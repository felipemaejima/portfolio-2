variable "domain" {
  description = "Apex domain registered at Hostinger, e.g. example.info"
  type        = string
}

variable "github_repository" {
  description = "owner/name of the GitHub repository allowed to deploy (OIDC trust)"
  type        = string
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

variable "monthly_budget_usd" {
  description = "Monthly cost ceiling (R$ 60 ~ US$ 11). Budgets alert; they never block spending."
  type        = number
  default     = 11
}
