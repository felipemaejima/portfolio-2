# WAF in front of everything (site, API, uploads). The Free flat-rate plan includes it — web ACL, rules and request
# fees — with at most 5 rules; requests it blocks don't count toward the plan's usage allowance.
# Rate limits are per viewer IP over a 5-minute window; the API also keeps its own per-IP limits on sensitive routes.
locals {
  managed_rule_groups = {
    # Known malicious IPs (botnets, scanners). Cheapest check first.
    ip-reputation = { priority = 0, name = "AWSManagedRulesAmazonIpReputationList", count_only = [] }
    # OWASP-style protections. Its 8 KB body limit would block image uploads (up to 4 MB): counted, not blocked.
    common = { priority = 3, name = "AWSManagedRulesCommonRuleSet", count_only = ["SizeRestrictions_BODY"] }
    # Exploit patterns such as Log4j, invalid/malicious request shapes.
    known-bad-inputs = { priority = 4, name = "AWSManagedRulesKnownBadInputsRuleSet", count_only = [] }
  }
  rate_limits = {
    # Brute force on login/refresh: far below what a human needs.
    rate-limit-auth = { priority = 1, limit = 20, path_prefix = "/api/auth/" }
    # HTTP flood from a single IP; a page view costs ~10-20 requests.
    rate-limit-all = { priority = 2, limit = 1000, path_prefix = null }
  }
}

resource "aws_wafv2_web_acl" "site" {
  name  = local.name
  scope = "CLOUDFRONT" # CloudFront web ACLs must live in us-east-1

  default_action {
    allow {}
  }

  dynamic "rule" {
    for_each = local.rate_limits
    content {
      name     = rule.key
      priority = rule.value.priority
      action {
        block {}
      }
      statement {
        rate_based_statement {
          limit                 = rule.value.limit
          evaluation_window_sec = 300
          aggregate_key_type    = "IP"

          dynamic "scope_down_statement" {
            for_each = rule.value.path_prefix == null ? [] : [rule.value.path_prefix]
            content {
              byte_match_statement {
                search_string         = scope_down_statement.value
                positional_constraint = "STARTS_WITH"
                field_to_match {
                  uri_path {}
                }
                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
          }
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = rule.key
        sampled_requests_enabled   = true
      }
    }
  }

  dynamic "rule" {
    for_each = local.managed_rule_groups
    content {
      name     = rule.key
      priority = rule.value.priority
      override_action {
        none {}
      }
      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = rule.value.name

          dynamic "rule_action_override" {
            for_each = toset(rule.value.count_only)
            content {
              name = rule_action_override.value
              action_to_use {
                count {}
              }
            }
          }
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = rule.key
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = local.name
    sampled_requests_enabled   = true
  }
}
