output "api_url" {
  description = "API Gateway invoke URL — set as AI Assistant_API_URL in Vercel"
  value       = module.api_gateway.api_url
}

output "api_key_id" {
  description = "API key ID — run: aws apigateway get-api-key --api-key <id> --include-value"
  value       = module.api_gateway.api_key_id
}

output "ecr_repository_url" {
  description = "ECR URL — used in deploy.sh"
  value       = module.ecr.repository_url
}

output "alb_dns_name" {
  description = "Internal ALB DNS — used by API Gateway"
  value       = module.ecs.alb_dns_name
}

output "redis_host" {
  description = "ElastiCache Redis host"
  value       = module.elasticache.redis_host
}
