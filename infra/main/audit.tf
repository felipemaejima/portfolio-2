# ---------------------------------------------------------------------------------------------------------------
# Audit trail: who did what in the account, kept beyond the free 90-day CloudTrail event history.
# Cost: the first copy of management events is free; only the S3 storage is paid (a few MB -> cents).
# Data events (every S3 object read, every Lambda invoke) and CloudTrail Insights are billed per event: left off.
# ---------------------------------------------------------------------------------------------------------------
locals {
  trail_name = "${local.name}-audit"
  # Built by hand: the bucket policy must reference the trail before the trail exists.
  trail_arn = "arn:aws:cloudtrail:us-east-1:${local.account_id}:trail/${local.trail_name}"
}

data "aws_iam_policy_document" "audit_bucket" {
  source_policy_documents = [data.aws_iam_policy_document.tls_only["audit"].json]

  statement {
    sid       = "CloudTrailAclCheck"
    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.this["audit"].arn]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.trail_arn]
    }
  }

  statement {
    sid       = "CloudTrailWrite"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.this["audit"].arn}/AWSLogs/${local.account_id}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "s3:x-amz-acl"
      values   = ["bucket-owner-full-control"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [local.trail_arn]
    }
  }
}

resource "aws_s3_bucket_policy" "audit" {
  bucket = aws_s3_bucket.this["audit"].id
  policy = data.aws_iam_policy_document.audit_bucket.json
}

resource "aws_s3_bucket_lifecycle_configuration" "audit" {
  bucket = aws_s3_bucket.this["audit"].id
  rule {
    id     = "expire-old-logs"
    status = "Enabled"
    filter {}
    expiration {
      days = 365
    }
  }
}

resource "aws_cloudtrail" "audit" {
  name           = local.trail_name
  s3_bucket_name = aws_s3_bucket.this["audit"].id
  # All regions + global services (IAM, STS, CloudFront): activity in a region we don't use is exactly what a
  # leaked credential looks like. Still a single, free copy of the management events.
  is_multi_region_trail         = true
  include_global_service_events = true
  # Signed digest files: proves the logs weren't altered or deleted after delivery.
  enable_log_file_validation = true

  depends_on = [aws_s3_bucket_policy.audit]
}

# ---------------------------------------------------------------------------------------------------------------
# IAM Access Analyzer (external access, free): flags any bucket, role, key or secret reachable from outside the
# account — a misconfiguration by us or by an attacker. The "unused access" analyzer is paid: not used.
# Findings are emailed through the alerts topic.
# ---------------------------------------------------------------------------------------------------------------
resource "aws_accessanalyzer_analyzer" "account" {
  analyzer_name = "${local.name}-external-access"
  type          = "ACCOUNT"
}

resource "aws_cloudwatch_event_rule" "access_analyzer_findings" {
  name        = "${local.name}-access-analyzer-findings"
  description = "New external-access findings"
  event_pattern = jsonencode({
    source        = ["aws.access-analyzer"]
    "detail-type" = ["Access Analyzer Finding"]
    detail        = { status = ["ACTIVE"] }
  })
}

resource "aws_cloudwatch_event_target" "access_analyzer_findings" {
  rule = aws_cloudwatch_event_rule.access_analyzer_findings.name
  arn  = aws_sns_topic.alerts.arn
}
