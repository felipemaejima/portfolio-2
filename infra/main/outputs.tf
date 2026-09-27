output "name_servers" {
  description = "Set these as the domain's nameservers at Hostinger"
  value       = aws_route53_zone.main.name_servers
}

output "site_url" {
  value = "https://${var.domain}"
}

output "api_url" {
  value = "https://${var.domain}/api"
}

output "api_function_name" {
  value = aws_lambda_function.api.function_name
}

# Input of `make plan-subscribe` (CloudFront Free flat-rate plan): the distribution, its web ACL and the hosted zone.
output "plan_resource_arns" {
  value = [aws_cloudfront_distribution.site.arn, aws_wafv2_web_acl.site.arn, aws_route53_zone.main.arn]
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

# Copy into the GitHub repository's Actions *variables* (not secrets: none of these is sensitive).
output "github_variables" {
  value = {
    DOMAIN                  = var.domain
    ECR_REPOSITORY          = aws_ecr_repository.api.name
    API_FUNCTION_NAME       = aws_lambda_function.api.function_name
    BACKUP_BUCKET           = aws_s3_bucket.this["backups"].id
    WEB_BUCKET              = aws_s3_bucket.this["web"].id
    CLOUDFRONT_DISTRIBUTION = aws_cloudfront_distribution.site.id
    AWS_API_DEPLOY_ROLE_ARN = aws_iam_role.ci["api-deploy"].arn
    AWS_BACKUP_ROLE_ARN     = aws_iam_role.ci["backup"].arn
    AWS_WEB_DEPLOY_ROLE_ARN = aws_iam_role.ci["web-deploy"].arn
    SSM_DIRECT_DATABASE_URL = "${local.ssm_prefix}/direct-database-url"
  }
}
