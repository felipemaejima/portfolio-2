resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alerts"
}

# Who may publish: CloudWatch alarms and the Access Analyzer EventBridge rule (audit.tf) of this account.
# (A custom policy replaces the default one, so each service publisher must be listed.)
resource "aws_sns_topic_policy" "alerts" {
  arn = aws_sns_topic.alerts.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.alerts.arn
        Condition = { ArnLike = { "aws:SourceArn" = "arn:aws:cloudwatch:us-east-1:${local.account_id}:alarm:*" } }
      },
      {
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.alerts.arn
        Condition = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.access_analyzer_findings.arn } }
      },
    ]
  })
}

# AWS emails a confirmation link; alerts only arrive after it is clicked.
resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# 5xx seen by visitors (API errors, Lambda failures or throttling). Percent of requests; noisy at very low traffic,
# which is fine here: any burst of errors is worth an email.
resource "aws_cloudwatch_metric_alarm" "site_5xx" {
  alarm_name          = "${local.name}-5xx"
  alarm_description   = "10% or more of requests failed with 5xx over 5 minutes"
  namespace           = "AWS/CloudFront"
  metric_name         = "5xxErrorRate"
  dimensions          = { DistributionId = aws_cloudfront_distribution.site.id, Region = "Global" }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# Budgets ALERT, they never stop spending: AWS has no native hard cap. The kill switch below is ours.
resource "aws_budgets_budget" "monthly" {
  name         = "${local.name}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.monthly_budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  # Gross usage, before credits. With the AWS default (credits included) the net cost stays ~0 while credits last,
  # so an attack would silently burn them and neither the alerts nor the kill switch would ever fire.
  cost_types {
    include_credit = false
    include_refund = false
  }

  dynamic "notification" {
    for_each = [50, 80]
    content {
      notification_type          = "ACTUAL"
      comparison_operator        = "GREATER_THAN"
      threshold                  = notification.value
      threshold_type             = "PERCENTAGE"
      subscriber_email_addresses = [var.alert_email]
    }
  }

  # 100% actual: email AND the kill switch below.
  notification {
    notification_type          = "ACTUAL"
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.alert_email]
    subscriber_sns_topic_arns  = [aws_sns_topic.kill_switch.arn]
  }

  # Forecast: warns mid-month when the trend will cross the ceiling.
  notification {
    notification_type          = "FORECASTED"
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.alert_email]
  }
}

# New accounts may already have AWS's default services monitor, and only one such monitor is allowed. If the
# apply fails with a limit error, import it instead: `terraform import aws_ce_anomaly_monitor.services <arn>`.
resource "aws_ce_anomaly_monitor" "services" {
  name              = "${local.name}-services"
  monitor_type      = "DIMENSIONAL"
  monitor_dimension = "SERVICE"
}

resource "aws_ce_anomaly_subscription" "email" {
  name             = "${local.name}-anomalies"
  frequency        = "DAILY"
  monitor_arn_list = [aws_ce_anomaly_monitor.services.arn]

  subscriber {
    type    = "EMAIL"
    address = var.alert_email
  }

  threshold_expression {
    dimension {
      key           = "ANOMALY_TOTAL_IMPACT_ABSOLUTE"
      match_options = ["GREATER_THAN_OR_EQUAL"]
      values        = ["1"]
    }
  }
}

# ---------------------------------------------------------------------------------------------------------------
# Cost kill switch: SNS -> Lambda that sets the API's reserved concurrency to 0 (the site stays up; the API returns
# errors until `make api-enable`). Two triggers:
#   - fast: the API's compute (Lambda Duration) runs away — metrics arrive within minutes;
#   - backstop: the monthly budget is exceeded — billing data lags hours, up to a day.
# Separate topic from the email alerts: only these two alarms may trip it.
# ---------------------------------------------------------------------------------------------------------------
resource "aws_sns_topic" "kill_switch" {
  name = "${local.name}-kill-switch"
}

resource "aws_sns_topic_policy" "kill_switch" {
  arn = aws_sns_topic.kill_switch.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "budgets.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.kill_switch.arn
        Condition = { StringEquals = { "aws:SourceAccount" = local.account_id } }
      },
      {
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.kill_switch.arn
        Condition = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_metric_alarm.api_compute_runaway.arn } }
      },
    ]
  })
}

# 90 s of compute per 5 minutes at 1 GB = 90 GB-s. Sustained just below it for a whole month: ~778k GB-s, i.e.
# ~US$ 5 after Lambda's free tier (400k GB-s) — inside the budget. Normal use (cached public pages, one admin)
# stays far below. Raise it only if real traffic ever gets close.
resource "aws_cloudwatch_metric_alarm" "api_compute_runaway" {
  alarm_name          = "${local.name}-api-compute-runaway"
  alarm_description   = "API used more than 90 s of compute in 5 minutes: kill switch tripped"
  namespace           = "AWS/Lambda"
  metric_name         = "Duration"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 90000
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.kill_switch.arn, aws_sns_topic.alerts.arn]
}

data "archive_file" "kill_switch" {
  type        = "zip"
  source_file = "${path.module}/kill-switch.mjs"
  output_path = "${path.module}/.build/kill-switch.zip"
}

resource "aws_iam_role" "kill_switch" {
  name               = "${local.name}-kill-switch"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "kill_switch_logs" {
  role       = aws_iam_role.kill_switch.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "kill_switch" {
  role = aws_iam_role.kill_switch.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "lambda:PutFunctionConcurrency", Resource = aws_lambda_function.api.arn }]
  })
}

resource "aws_cloudwatch_log_group" "kill_switch" {
  name              = "/aws/lambda/${local.name}-kill-switch"
  retention_in_days = 90
}

resource "aws_lambda_function" "kill_switch" {
  function_name    = "${local.name}-kill-switch"
  role             = aws_iam_role.kill_switch.arn
  runtime          = "nodejs24.x" # the runtime ships the AWS SDK v3; no bundling needed
  architectures    = ["arm64"]
  handler          = "kill-switch.handler"
  filename         = data.archive_file.kill_switch.output_path
  source_code_hash = data.archive_file.kill_switch.output_base64sha256
  timeout          = 10

  environment {
    variables = { TARGET_FUNCTION = aws_lambda_function.api.function_name }
  }

  depends_on = [aws_cloudwatch_log_group.kill_switch, aws_iam_role_policy_attachment.kill_switch_logs]
}

resource "aws_lambda_permission" "kill_switch_sns" {
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.kill_switch.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.kill_switch.arn
}

resource "aws_sns_topic_subscription" "kill_switch" {
  topic_arn = aws_sns_topic.kill_switch.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.kill_switch.arn
}
