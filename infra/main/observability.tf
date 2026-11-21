resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alerts"
}

# Who may publish: CloudWatch alarms and the Access Analyzer EventBridge rule (audit.tf) of this account.
# (A custom policy replaces the default one, so each service publisher must be listed; SNS requires a unique Sid each.)
resource "aws_sns_topic_policy" "alerts" {
  arn = aws_sns_topic.alerts.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "CloudWatchAlarms"
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.alerts.arn
        Condition = { ArnLike = { "aws:SourceArn" = "arn:aws:cloudwatch:us-east-1:${local.account_id}:alarm:*" } }
      },
      {
        Sid       = "AccessAnalyzerFindings"
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

# ---------------------------------------------------------------------------------------------------------------
# API errors become Alertas (#57). Missing data is fine: no errors, no data. Together with site_5xx and the compute
# alarm: 4 alarms and 1 custom metric, inside CloudWatch's free 10 + 10.
# ---------------------------------------------------------------------------------------------------------------
# Lines the API logs at level "error" (Nest's JSON logger, stored as-is): unhandled exceptions behind a 500, and the
# Discord failures Login and Visita swallow. Pattern checked with `aws logs test-metric-filter` against real lines.
resource "aws_cloudwatch_log_metric_filter" "api_error_logs" {
  name           = "${local.name}-api-error-logs"
  log_group_name = aws_cloudwatch_log_group.api.name
  pattern        = "{ $.level = \"error\" }"

  metric_transformation {
    name      = "ApiErrorLogs"
    namespace = "Portfolio"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "api_error_logs" {
  alarm_name          = "${local.name}-api-error-logs"
  alarm_description   = "The API logged an error (500, or a swallowed Discord failure) in the last 5 minutes"
  namespace           = aws_cloudwatch_log_metric_filter.api_error_logs.metric_transformation[0].namespace
  metric_name         = aws_cloudwatch_log_metric_filter.api_error_logs.metric_transformation[0].name
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# Function errors of the API Lambda, for what the app can't log as JSON: timeouts, and a boot that crashes (a missing
# SSM parameter makes main.ts throw before the logger exists; Node exits, Runtime.ExitError). AWS docs count timeouts
# and runtime errors as Errors but don't say so for init crashes, and that wasn't tested outside production (see
# docs/specs/infra.md); with traffic, site_5xx also catches an API that can't boot.
resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "${local.name}-api-errors"
  alarm_description   = "The API Lambda had function errors (crash or timeout) in the last 5 minutes"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
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

# New accounts may already have AWS's default services monitor, and only one such monitor is allowed. Then its ARN
# goes in `existing_anomaly_monitor_arn` and the import block below adopts it. (A config-driven import runs inside
# plan/apply; the `terraform import` CLI evaluates the whole config against the current state and breaks when a
# previous apply stopped halfway.)
import {
  for_each = var.existing_anomaly_monitor_arn == null ? [] : [var.existing_anomaly_monitor_arn]
  to       = aws_ce_anomaly_monitor.services
  id       = each.value
}

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
        Sid       = "BudgetExceeded"
        Effect    = "Allow"
        Principal = { Service = "budgets.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.kill_switch.arn
        Condition = { StringEquals = { "aws:SourceAccount" = local.account_id } }
      },
      {
        Sid       = "ComputeRunawayAlarm"
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

# ---------------------------------------------------------------------------------------------------------------
# Alertas forwarder: both topics -> Lambda -> Discord #alertas (AWS Chatbot has no Discord). The email subscription
# above stays the backstop. It also listens to the kill switch topic, where the budget's 100% notice goes (a budget
# notification takes a single SNS topic); the compute alarm publishes to both and is sent once, from `alerts`.
# Runs only when there is an Alerta; minimal logs (costs approved in #53).
# ---------------------------------------------------------------------------------------------------------------
data "archive_file" "alerts_forwarder" {
  type        = "zip"
  source_file = "${path.module}/alerts-forwarder.mjs"
  output_path = "${path.module}/.build/alerts-forwarder.zip"
}

resource "aws_iam_role" "alerts_forwarder" {
  name               = "${local.name}-alerts-forwarder"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "alerts_forwarder_logs" {
  role       = aws_iam_role.alerts_forwarder.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Reads only the #alertas webhook (written by `make discord-secrets`, never by Terraform).
locals {
  discord_alerts_webhook = "${local.ssm_prefix}/discord-alerts-webhook"
}

resource "aws_iam_role_policy" "alerts_forwarder" {
  role = aws_iam_role.alerts_forwarder.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "ssm:GetParameter"
        Resource = "arn:aws:ssm:us-east-1:${local.account_id}:parameter${local.discord_alerts_webhook}"
      },
      {
        Effect    = "Allow"
        Action    = "kms:Decrypt"
        Resource  = "*"
        Condition = { StringEquals = { "kms:ViaService" = "ssm.us-east-1.amazonaws.com" } }
      },
    ]
  })
}

resource "aws_cloudwatch_log_group" "alerts_forwarder" {
  name              = "/aws/lambda/${local.name}-alerts-forwarder"
  retention_in_days = 14
}

resource "aws_lambda_function" "alerts_forwarder" {
  function_name    = "${local.name}-alerts-forwarder"
  role             = aws_iam_role.alerts_forwarder.arn
  runtime          = "nodejs24.x" # the runtime ships the AWS SDK v3; no bundling needed
  architectures    = ["arm64"]
  handler          = "alerts-forwarder.handler"
  filename         = data.archive_file.alerts_forwarder.output_path
  source_code_hash = data.archive_file.alerts_forwarder.output_base64sha256
  timeout          = 15 # SSM read + up to 5 s per Discord post

  environment {
    variables = {
      # Where the webhook is, not its value: the function reads it from SSM on each run.
      WEBHOOK_PARAMETER = local.discord_alerts_webhook
      KILL_SWITCH_TOPIC = aws_sns_topic.kill_switch.arn
      KILL_SWITCH_ALARM = aws_cloudwatch_metric_alarm.api_compute_runaway.alarm_name
    }
  }

  depends_on = [aws_cloudwatch_log_group.alerts_forwarder, aws_iam_role_policy_attachment.alerts_forwarder_logs]
}

resource "aws_lambda_permission" "alerts_forwarder_sns" {
  for_each      = { alerts = aws_sns_topic.alerts.arn, kill_switch = aws_sns_topic.kill_switch.arn }
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.alerts_forwarder.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = each.value
}

resource "aws_sns_topic_subscription" "alerts_forwarder" {
  for_each  = aws_lambda_permission.alerts_forwarder_sns
  topic_arn = each.value.source_arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.alerts_forwarder.arn
}
