variable "domain" {
  description = "Apex domain registered at Hostinger, e.g. example.info"
  type        = string
}

variable "github_repository" {
  description = "owner/name of the GitHub repository allowed to deploy (OIDC trust)"
  type        = string
}

# Repositories created after 2026-07-15 get OIDC subjects with immutable IDs (repo:OWNER@ID/REPO@ID:...), so a
# deleted-and-recreated repository with the same name can't inherit the trust. Both IDs are public:
# curl -s https://api.github.com/repos/OWNER/REPO | jq '{owner_id: .owner.id, repository_id: .id}'
variable "github_owner_id" {
  description = "Numeric ID of the repository owner (GitHub user/org)"
  type        = number
}

variable "github_repository_id" {
  description = "Numeric ID of the GitHub repository"
  type        = number
}

variable "alert_email" {
  description = "Receives budget, cost anomaly and API error alerts"
  type        = string
}

variable "project" {
  type    = string
  default = "portfolio"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "existing_anomaly_monitor_arn" {
  description = "ARN of the AWS default services anomaly monitor, if the account already has one (only one is allowed); it is imported instead of created"
  type        = string
  default     = null
}

variable "monthly_budget_usd" {
  description = "Monthly cost ceiling (R$ 60 ~ US$ 11). Budgets alert; they never block spending."
  type        = number
  default     = 11
}
