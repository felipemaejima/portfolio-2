data "aws_caller_identity" "current" {}

locals {
  name       = "${var.project}-${var.environment}"
  account_id = data.aws_caller_identity.current.account_id
  # SSM parameter names; the Neon URLs are written by `make db-secrets`, never by Terraform or git.
  ssm_prefix = "/${var.project}/${var.environment}"
}
