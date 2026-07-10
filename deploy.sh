#!/bin/bash
set -e

REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URL="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/chihho-mcp-server"

echo "→ Logging into ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

echo "→ Building Docker image..."
docker build -t chihho-mcp-server .

echo "→ Tagging image..."
docker tag chihho-mcp-server:latest "$ECR_URL:latest"

echo "→ Pushing to ECR..."
docker push "$ECR_URL:latest"

echo "→ Forcing ECS service update..."
aws ecs update-service \
  --cluster chihho-mcp-cluster \
  --service chihho-mcp-service \
  --force-new-deployment \
  --region $REGION

echo "✓ Deployed successfully"
