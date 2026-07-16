#!/bin/bash
set -e

REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URL="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/chihho-ai-assistant-server"

echo "→ Logging into ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

echo "→ Building Docker image..."
docker build -t chihho-ai-assistant-server .

echo "→ Tagging image..."
docker tag chihho-ai-assistant-server:latest "$ECR_URL:latest"

echo "→ Pushing to ECR..."
docker push "$ECR_URL:latest"

echo "→ Forcing ECS service update..."
aws ecs update-service \
  --cluster chihho-ai-assistant-cluster \
  --service chihho-ai-assistant-service \
  --force-new-deployment \
  --region $REGION

echo "→ Deploying Lambda..."
cd infra/modules/lambda
npm install --production
zip -r scraper.zip scraper.js node_modules package.json
aws lambda update-function-code \
  --function-name chihho-ai-assistant-job-scraper \
  --zip-file fileb://scraper.zip \
  --region $REGION
cd ../../..
echo "✓ Lambda deployed"

echo "✓ Deployed successfully"
