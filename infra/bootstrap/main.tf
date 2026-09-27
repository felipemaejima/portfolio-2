# Bootstrap: the bucket that stores the state of infra/main.
# Chicken-and-egg: Terraform needs a state backend before it can create one, so this tiny stack keeps a LOCAL
# state (not committed). If that file is lost, re-import the bucket: `terraform import aws_s3_bucket.state <name>`.

terraform {
  required_version = ">= 1.16"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.66"
    }
  }
}

variable "project" {
  type    = string
  default = "portfolio"
}

provider "aws" {
  region = "us-east-1"
  default_tags {
    tags = { project = var.project, env = "shared", managed-by = "terraform" }
  }
}

data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "state" {
  # Bucket names are global across all AWS accounts; the account id keeps this one unique.
  bucket = "${var.project}-tfstate-${data.aws_caller_identity.current.account_id}"

  lifecycle {
    prevent_destroy = true
  }
}

# Versioning lets a corrupted or wrongly-applied state be rolled back.
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# The state holds secrets (JWT keys, database URL): refuse any unencrypted (non-TLS) access.
resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

output "state_bucket" {
  value = aws_s3_bucket.state.id
}
