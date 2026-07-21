variable "project_name" {}
variable "alb_dns_name" {}
variable "env"          {}

resource "aws_api_gateway_rest_api" "ai-assistant" {
  name        = "${var.project_name}-api"
  description = "AI Assistant REST API"
}

locals {
  post_endpoints = {
    analyze = "analyze"
    career  = "career"
    code    = "code"
  }
}

# ── Dynamic POST endpoints (single-segment paths) ─────────────────────────────
resource "aws_api_gateway_resource" "endpoints" {
  for_each    = local.post_endpoints
  rest_api_id = aws_api_gateway_rest_api.ai-assistant.id
  parent_id   = aws_api_gateway_rest_api.ai-assistant.root_resource_id
  path_part   = each.value
}

resource "aws_api_gateway_method" "post" {
  for_each         = local.post_endpoints
  rest_api_id      = aws_api_gateway_rest_api.ai-assistant.id
  resource_id      = aws_api_gateway_resource.endpoints[each.key].id
  http_method      = "POST"
  authorization    = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "post" {
  for_each                = local.post_endpoints
  rest_api_id             = aws_api_gateway_rest_api.ai-assistant.id
  resource_id             = aws_api_gateway_resource.endpoints[each.key].id
  http_method             = aws_api_gateway_method.post[each.key].http_method
  type                    = "HTTP_PROXY"
  integration_http_method = "POST"
  uri                     = "http://${var.alb_dns_name}/${each.value}"
}

# ── /resume/parse-pdf (nested path — general purpose) ─────────────────────────
resource "aws_api_gateway_resource" "resume" {
  rest_api_id = aws_api_gateway_rest_api.ai-assistant.id
  parent_id   = aws_api_gateway_rest_api.ai-assistant.root_resource_id
  path_part   = "resume"
}

resource "aws_api_gateway_resource" "resume_parse_pdf" {
  rest_api_id = aws_api_gateway_rest_api.ai-assistant.id
  parent_id   = aws_api_gateway_resource.resume.id
  path_part   = "parse-pdf"
}

resource "aws_api_gateway_method" "resume_parse_pdf_post" {
  rest_api_id      = aws_api_gateway_rest_api.ai-assistant.id
  resource_id      = aws_api_gateway_resource.resume_parse_pdf.id
  http_method      = "POST"
  authorization    = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "resume_parse_pdf" {
  rest_api_id             = aws_api_gateway_rest_api.ai-assistant.id
  resource_id             = aws_api_gateway_resource.resume_parse_pdf.id
  http_method             = aws_api_gateway_method.resume_parse_pdf_post.http_method
  type                    = "HTTP_PROXY"
  integration_http_method = "POST"
  uri                     = "http://${var.alb_dns_name}/resume/parse-pdf"
}

# ── /me/career (nested path — personal, chihho-dev.info only) ─────────────────
resource "aws_api_gateway_resource" "me" {
  rest_api_id = aws_api_gateway_rest_api.ai-assistant.id
  parent_id   = aws_api_gateway_rest_api.ai-assistant.root_resource_id
  path_part   = "me"
}

resource "aws_api_gateway_resource" "me_career" {
  rest_api_id = aws_api_gateway_rest_api.ai-assistant.id
  parent_id   = aws_api_gateway_resource.me.id
  path_part   = "career"
}

resource "aws_api_gateway_method" "me_career_post" {
  rest_api_id      = aws_api_gateway_rest_api.ai-assistant.id
  resource_id      = aws_api_gateway_resource.me_career.id
  http_method      = "POST"
  authorization    = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "me_career" {
  rest_api_id             = aws_api_gateway_rest_api.ai-assistant.id
  resource_id             = aws_api_gateway_resource.me_career.id
  http_method             = aws_api_gateway_method.me_career_post.http_method
  type                    = "HTTP_PROXY"
  integration_http_method = "POST"
  uri                     = "http://${var.alb_dns_name}/me/career"
}

# ── /health (GET, no API key) ─────────────────────────────────────────────────
resource "aws_api_gateway_resource" "health" {
  rest_api_id = aws_api_gateway_rest_api.ai-assistant.id
  parent_id   = aws_api_gateway_rest_api.ai-assistant.root_resource_id
  path_part   = "health"
}

resource "aws_api_gateway_method" "health_get" {
  rest_api_id   = aws_api_gateway_rest_api.ai-assistant.id
  resource_id   = aws_api_gateway_resource.health.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "health" {
  rest_api_id             = aws_api_gateway_rest_api.ai-assistant.id
  resource_id             = aws_api_gateway_resource.health.id
  http_method             = aws_api_gateway_method.health_get.http_method
  type                    = "HTTP_PROXY"
  integration_http_method = "GET"
  uri                     = "http://${var.alb_dns_name}/health"
}

# ── API key + usage plan ──────────────────────────────────────────────────────
resource "aws_api_gateway_api_key" "site" {
  name = "${var.project_name}-site-key"
}

resource "aws_api_gateway_deployment" "main" {
  rest_api_id = aws_api_gateway_rest_api.ai-assistant.id
  depends_on = [
    aws_api_gateway_integration.post,
    aws_api_gateway_integration.health,
    aws_api_gateway_integration.resume_parse_pdf,
    aws_api_gateway_integration.me_career,
  ]
  triggers = {
    redeployment = sha1(jsonencode([
      local.post_endpoints,
      aws_api_gateway_resource.resume_parse_pdf.id,
      aws_api_gateway_resource.me_career.id,
    ]))
  }
}

resource "aws_api_gateway_stage" "prod" {
  deployment_id = aws_api_gateway_deployment.main.id
  rest_api_id   = aws_api_gateway_rest_api.ai-assistant.id
  stage_name    = var.env
}

resource "aws_api_gateway_usage_plan" "main" {
  name = "${var.project_name}-usage-plan"
  api_stages {
    api_id = aws_api_gateway_rest_api.ai-assistant.id
    stage  = aws_api_gateway_stage.prod.stage_name
  }
  throttle_settings {
    rate_limit  = 10
    burst_limit = 20
  }
  quota_settings {
    limit  = 1000
    period = "MONTH"
  }

  depends_on = [aws_api_gateway_stage.prod]
}

resource "aws_api_gateway_usage_plan_key" "main" {
  key_id        = aws_api_gateway_api_key.site.id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.main.id
}

output "api_url"    { value = aws_api_gateway_stage.prod.invoke_url }
output "api_key_id" { value = aws_api_gateway_api_key.site.id }
