# ---------------------------------------------------------------------------------------------------------------
# Image registry
# ---------------------------------------------------------------------------------------------------------------
resource "aws_ecr_repository" "api" {
  name = "${local.name}-api"
  # Immutable tags: a tag (the git sha) always means the same image, so deploys are traceable.
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      # Each image is ~1 GB of storage billed monthly; 5 is plenty to roll back.
      description = "Keep the last 5 images"
      selection   = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 5 }
      action      = { type = "expire" }
    }]
  })
}

# Lambda can only be created from an image that already exists. First deploy: create the repository, push an image
# (`make api-publish`), then apply the rest (see infra/README.md). Afterwards CI owns the image (ignore_changes).
data "aws_ecr_image" "api_initial" {
  repository_name = aws_ecr_repository.api.name
  most_recent     = true
}

# ---------------------------------------------------------------------------------------------------------------
# Secrets — SSM Parameter Store is the single source of truth (free, encrypted with the AWS-managed key)
# ---------------------------------------------------------------------------------------------------------------
resource "random_password" "jwt" {
  for_each = toset(["access", "refresh"])
  length   = 64
  special  = false
}

resource "aws_ssm_parameter" "jwt" {
  for_each = random_password.jwt
  name     = "${local.ssm_prefix}/jwt-${each.key}-secret"
  type     = "SecureString"
  value    = each.value.result
}

# Written by `make db-secrets` (Neon console values). Only the pooled URL reaches the Lambda; the direct one is
# read by CI for migrations and backups.
data "aws_ssm_parameter" "database_url" {
  name = "${local.ssm_prefix}/database-url"
}

# ---------------------------------------------------------------------------------------------------------------
# Lambda (container image + Lambda Web Adapter: the unchanged Nest/Express server behind Lambda)
# ---------------------------------------------------------------------------------------------------------------
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api" {
  name               = "${local.name}-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Least privilege: the app writes and deletes upload objects, nothing else. No access keys anywhere — the
# AWS SDK picks up this role's temporary credentials from the Lambda environment.
resource "aws_iam_role_policy" "api_uploads" {
  role = aws_iam_role.api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:DeleteObject"]
      Resource = "${aws_s3_bucket.this["uploads"].arn}/uploads/*"
    }]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.name}-api"
  retention_in_days = 14
}

resource "aws_lambda_function" "api" {
  function_name = "${local.name}-api"
  role          = aws_iam_role.api.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.api.repository_url}@${data.aws_ecr_image.api_initial.image_digest}"
  # Graviton (arm64) is cheaper per ms. On Lambda, CPU scales with memory: argon2 and Nest's boot need it.
  architectures = ["arm64"]
  memory_size   = 1024
  timeout       = 15

  environment {
    variables = {
      PUBLIC_URL         = "https://${var.domain}"
      CLIENT_IP_HEADER   = "x-viewer-ip" # set by the CloudFront Function in web.tf; clients can't forge it
      DATABASE_URL       = data.aws_ssm_parameter.database_url.value
      JWT_ACCESS_SECRET  = random_password.jwt["access"].result
      JWT_REFRESH_SECRET = random_password.jwt["refresh"].result
      STORAGE_DRIVER     = "s3"
      S3_BUCKET          = aws_s3_bucket.this["uploads"].id
      UPLOADS_PUBLIC_URL = "https://${var.domain}/uploads"
    }
  }

  # The app already logs JSON. WARN for platform logs drops the per-invocation START/END/REPORT lines, so a flood of
  # requests doesn't also become a CloudWatch Logs bill.
  logging_config {
    log_format            = "JSON"
    log_group             = aws_cloudwatch_log_group.api.name
    application_log_level = "INFO"
    system_log_level      = "WARN"
  }

  depends_on = [aws_cloudwatch_log_group.api, aws_iam_role_policy_attachment.api_logs]

  lifecycle {
    # Infrastructure vs. release: CI swaps the image; an apply must never roll a deploy back.
    # The kill switch sets reserved concurrency to 0; an apply must never silently turn the API back on.
    ignore_changes = [image_uri, reserved_concurrent_executions]
  }
}

# ---------------------------------------------------------------------------------------------------------------
# Entry point: Function URL reachable ONLY through CloudFront
# ---------------------------------------------------------------------------------------------------------------
# AWS_IAM auth + CloudFront OAC: CloudFront signs each request; anything else (someone who found the URL) is
# rejected by Lambda before the function runs — no invocation, no cost, no way around the WAF.
# No API Gateway: it would bill every request it receives, including attack traffic.
resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "AWS_IAM"
}

# CloudFront needs both permissions, restricted to this distribution; InvokeFunction only via the URL.
resource "aws_lambda_permission" "cloudfront_url" {
  statement_id           = "AllowCloudFrontInvokeFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = aws_cloudfront_distribution.site.arn
  function_url_auth_type = "AWS_IAM"
}

resource "aws_lambda_permission" "cloudfront_invoke" {
  statement_id             = "AllowCloudFrontInvokeFunction"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.api.function_name
  principal                = "cloudfront.amazonaws.com"
  source_arn               = aws_cloudfront_distribution.site.arn
  invoked_via_function_url = true
}
