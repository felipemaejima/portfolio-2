# All buckets are private. New buckets already default to SSE-S3 encryption and BucketOwnerEnforced; the public
# access block is made explicit anyway (defense in depth, visible in review).
# Values become the `purpose` tag: S3 tags only allow letters, digits, spaces and + - = . _ : / @.
locals {
  buckets = {
    web     = "SPA build served by CloudFront"
    uploads = "Admin uploads under uploads/ served by CloudFront at /uploads/"
    backups = "Daily pg_dump of the Neon database"
    audit   = "CloudTrail management event logs"
  }
}

resource "aws_s3_bucket" "this" {
  for_each = local.buckets
  # Globally unique names: suffix with the account id.
  bucket = "${local.name}-${each.key}-${local.account_id}"
  tags   = { purpose = each.value }
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each                = aws_s3_bucket.this
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Refuse any access without TLS. web/uploads merge this into their CloudFront policy (web.tf), audit into its
# CloudTrail policy (audit.tf).
data "aws_iam_policy_document" "tls_only" {
  for_each = aws_s3_bucket.this
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [each.value.arn, "${each.value.arn}/*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "backups" {
  bucket = aws_s3_bucket.this["backups"].id
  policy = data.aws_iam_policy_document.tls_only["backups"].json
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.this["backups"].id
  rule {
    id     = "expire-old-backups"
    status = "Enabled"
    filter {}
    expiration {
      days = 30
    }
  }
}
