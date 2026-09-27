# GitHub Actions authenticates with OIDC: each run gets short-lived credentials for a role, so no AWS access key
# is ever stored in GitHub. Trust is restricted to this repository's main branch.
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:refs/heads/main"]
    }
  }
}

locals {
  direct_database_url_arn = "arn:aws:ssm:us-east-1:${local.account_id}:parameter${local.ssm_prefix}/direct-database-url"

  # SecureStrings use the AWS-managed key; decrypting through SSM needs kms:Decrypt scoped to that service.
  read_direct_database_url = [
    { Effect = "Allow", Action = "ssm:GetParameter", Resource = local.direct_database_url_arn },
    {
      Effect    = "Allow"
      Action    = "kms:Decrypt"
      Resource  = "*"
      Condition = { StringEquals = { "kms:ViaService" = "ssm.us-east-1.amazonaws.com" } }
    },
  ]

  ci_roles = {
    # Build → push image → migrate (direct URL) → release the new image on Lambda.
    api-deploy = concat(local.read_direct_database_url, [
      { Effect = "Allow", Action = "ecr:GetAuthorizationToken", Resource = "*" },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload", "ecr:PutImage", "ecr:UploadLayerPart",
        ]
        Resource = aws_ecr_repository.api.arn
      },
      {
        Effect   = "Allow"
        Action   = ["lambda:UpdateFunctionCode", "lambda:GetFunction", "lambda:GetFunctionConfiguration"]
        Resource = aws_lambda_function.api.arn
      },
    ])

    # Nightly pg_dump to the backups bucket.
    backup = concat(local.read_direct_database_url, [
      { Effect = "Allow", Action = "s3:PutObject", Resource = "${aws_s3_bucket.this["backups"].arn}/*" },
    ])

    # Ready for apps/web: sync the build and invalidate the CDN.
    web-deploy = [
      { Effect = "Allow", Action = "s3:ListBucket", Resource = aws_s3_bucket.this["web"].arn },
      { Effect = "Allow", Action = ["s3:PutObject", "s3:DeleteObject"], Resource = "${aws_s3_bucket.this["web"].arn}/*" },
      { Effect = "Allow", Action = "cloudfront:CreateInvalidation", Resource = aws_cloudfront_distribution.site.arn },
    ]
  }
}

resource "aws_iam_role" "ci" {
  for_each           = local.ci_roles
  name               = "${local.name}-github-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
}

resource "aws_iam_role_policy" "ci" {
  for_each = local.ci_roles
  role     = aws_iam_role.ci[each.key].id
  policy   = jsonencode({ Version = "2012-10-17", Statement = each.value })
}
