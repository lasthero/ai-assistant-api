#!/bin/bash
# Run this script to re-import all AWS resources into Terraform state
# after a partial destroy or state corruption.
#
# Usage: bash infra/import.sh
#
set -e
export MSYS_NO_PATHCONV=1

PROJECT="chihho-ai-assistant"
REGION="us-east-1"

echo "→ Importing ECR repository..."
terraform import module.ecr.aws_ecr_repository.ai-assistant ${PROJECT}-server

echo "→ Importing IAM roles..."
terraform import module.iam.aws_iam_role.ecs_execution ${PROJECT}-ecs-execution
terraform import module.iam.aws_iam_role.ecs_task ${PROJECT}-ecs-task
terraform import module.iam.aws_iam_role.lambda ${PROJECT}-lambda

echo "→ Importing CloudWatch log groups..."
terraform import module.ecs.aws_cloudwatch_log_group.ecs /ecs/${PROJECT}
terraform import module.lambda.aws_cloudwatch_log_group.scraper /aws/lambda/${PROJECT}-job-scraper

echo "→ Importing Secrets Manager secret..."
SECRET_ARN=$(aws secretsmanager describe-secret \
  --secret-id ${PROJECT}/adzuna \
  --query 'ARN' --output text --region $REGION)
terraform import module.secrets.aws_secretsmanager_secret.adzuna $SECRET_ARN

echo "→ Importing Lambda function..."
terraform import module.lambda.aws_lambda_function.scraper ${PROJECT}-job-scraper

echo "→ Importing Lambda permission..."
terraform import module.lambda.aws_lambda_permission.eventbridge \
  ${PROJECT}-job-scraper/AllowEventBridge

echo "→ Importing EventBridge rule..."
terraform import module.lambda.aws_cloudwatch_event_rule.scraper \
  ${PROJECT}-scraper-schedule

echo "→ Importing ALB..."
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names ${PROJECT}-alb \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text --region $REGION)
terraform import module.ecs.aws_lb.main $ALB_ARN

echo "→ Importing Target Group..."
TG_ARN=$(aws elbv2 describe-target-groups \
  --names ${PROJECT}-tg \
  --query 'TargetGroups[0].TargetGroupArn' --output text --region $REGION)
terraform import module.ecs.aws_lb_target_group.ai-assistant $TG_ARN

echo "→ Importing ALB Listener..."
LISTENER_ARN=$(aws elbv2 describe-listeners \
  --load-balancer-arn $ALB_ARN \
  --query 'Listeners[0].ListenerArn' --output text --region $REGION)
terraform import module.ecs.aws_lb_listener.http $LISTENER_ARN

echo "→ Importing ElastiCache subnet group..."
terraform import module.elasticache.aws_elasticache_subnet_group.main \
  ${PROJECT}-redis-subnet

echo "→ Importing ElastiCache cluster..."
terraform import module.elasticache.aws_elasticache_cluster.jobs \
  ${PROJECT}-jobs

echo "→ Importing Adzuna secret..."
terraform import module.secrets.aws_secretsmanager_secret.adzuna \
  $(aws secretsmanager describe-secret \
    --secret-id chihho-ai-assistant/adzuna \
    --query 'ARN' --output text --region $REGION)

echo "✓ All imports done — run terraform apply"