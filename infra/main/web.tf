# One distribution for everything under the domain: the SPA (/), the API (/api/*) and uploads (/uploads/*).
# Same origin for the browser (no CORS), one certificate, one WAF — and one CloudFront flat-rate plan (Free tier:
# no overage charges even under attack; subscribed with `make plan-subscribe`, Terraform has no resource for it yet).
# Origins are private: buckets and the Lambda only answer requests signed by this distribution (Origin Access Control).
resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = local.name
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_origin_access_control" "lambda" {
  name                              = "${local.name}-lambda"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "${local.name}-spa-rewrite"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = file("${path.module}/spa-rewrite.js")
}

resource "aws_cloudfront_function" "viewer_ip" {
  name    = "${local.name}-viewer-ip"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = file("${path.module}/viewer-ip.js")
}

# The Free plan only allows AWS-managed cache, origin request and response header policies.
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

# Caches only what the API marks cacheable (public GETs: max-age=60); default TTL 0 means everything else, including
# every admin response (Cache-Control: no-store), goes to the origin.
data "aws_cloudfront_cache_policy" "origin_headers" {
  # By ID: unlike the older managed policies, this one has no "Managed-" prefix in its name.
  id = "4cc15a8a-d715-48a4-82b8-cc0b614638fe" # UseOriginCacheControlHeaders-QueryStrings
}

# Everything but Host (the Function URL must see its own hostname), so cookies, query strings and X-Authorization
# reach the API. `Authorization` itself is replaced by CloudFront's signature — hence X-Authorization in the app.
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

data "aws_cloudfront_response_headers_policy" "security" {
  name = "Managed-SecurityHeadersPolicy"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  default_root_object = "index.html"
  aliases             = [var.domain]
  # South America edges only exist in PriceClass_All; without them Brazilian visitors hit US edges.
  price_class = "PriceClass_All"
  comment     = "${local.name} site, API and uploads"
  web_acl_id  = aws_wafv2_web_acl.site.arn

  origin {
    origin_id                = "web"
    domain_name              = aws_s3_bucket.this["web"].bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  origin {
    origin_id                = "uploads"
    domain_name              = aws_s3_bucket.this["uploads"].bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
  }

  origin {
    origin_id                = "api"
    domain_name              = trimsuffix(trimprefix(aws_lambda_function_url.api.function_url, "https://"), "/")
    origin_access_control_id = aws_cloudfront_origin_access_control.lambda.id
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id           = "web"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = "api"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.origin_headers.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.viewer_ip.arn
    }
  }

  # Upload keys are UUIDs never reused, so long caching is safe (the API sets Cache-Control: immutable).
  ordered_cache_behavior {
    path_pattern               = "/uploads/*"
    target_origin_id           = "uploads"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# Only this distribution may read the buckets. ListBucket makes S3 answer 404 (not 403) for missing keys;
# CloudFront never issues list requests, so nothing becomes listable. Any non-TLS access is refused.
data "aws_iam_policy_document" "cloudfront_read" {
  for_each = {
    web     = "*"
    uploads = "uploads/*"
  }

  source_policy_documents = [data.aws_iam_policy_document.tls_only[each.key].json]

  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.this[each.key].arn}/${each.value}"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }

  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.this[each.key].arn]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "cloudfront_read" {
  for_each = data.aws_iam_policy_document.cloudfront_read
  bucket   = aws_s3_bucket.this[each.key].id
  policy   = each.value.json
}

# Placeholder until apps/web exists. Terraform creates it once and never touches it again: from then on the
# web deploy pipeline owns the bucket contents.
resource "aws_s3_object" "placeholder" {
  bucket        = aws_s3_bucket.this["web"].id
  key           = "index.html"
  content_type  = "text/html; charset=utf-8"
  cache_control = "no-cache"
  content       = <<-HTML
    <!doctype html>
    <html lang="pt-BR">
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${var.domain}</title></head>
      <body style="font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0">
        <p>Em breve.</p>
      </body>
    </html>
  HTML

  lifecycle {
    ignore_changes = all
  }
}

resource "aws_route53_record" "site" {
  for_each = toset(["A", "AAAA"])
  zone_id  = aws_route53_zone.main.zone_id
  name     = var.domain
  type     = each.key
  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}
