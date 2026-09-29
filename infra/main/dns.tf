# The domain stays registered at Hostinger; only its nameservers point here (see outputs.name_servers).
# Route 53 allows an ALIAS at the apex (CNAME there is forbidden by DNS) and lets ACM validate automatically.
resource "aws_route53_zone" "main" {
  name = var.domain
}

# CAA: only Amazon may issue certificates for this domain — a mis-issued cert elsewhere is refused by compliant CAs.
resource "aws_route53_record" "caa" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "CAA"
  ttl     = 3600
  records = ["0 issue \"amazon.com\"", "0 issuewild \";\""]
}

# CloudFront only accepts certificates from us-east-1. One certificate: the API lives under the same domain (/api).
resource "aws_acm_certificate" "site" {
  domain_name       = var.domain
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

# ACM proves domain ownership by checking these CNAMEs. It only succeeds after the nameservers are delegated.
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for o in aws_acm_certificate.site.domain_validation_options : o.domain_name => o
  }
  zone_id         = aws_route53_zone.main.zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "site" {
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [aws_route53_record.cert_validation[var.domain].fqdn]
}
