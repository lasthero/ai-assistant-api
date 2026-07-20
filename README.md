# ai-assistant-server

AI-powered job matching service that compares your resume against real-time job postings using AWS Bedrock (Llama 3.1 8B) and RapidAPI JSearch.

## Architecture

```
Vercel (your site)
  → API Gateway (REST) → ALB → ECS Fargate (ai-assistant Server)
                                    ↓              ↓
                              S3 (resume)    ElastiCache Redis
                                    ↓              ↑
                              Bedrock       Lambda (job scraper)
                              Llama 3.1          ↑
                                          EventBridge (4hr schedule)
                                                 ↑
                                          RapidAPI JSearch
```

## Stack

| Component          | Service                    |
| ------------------ | -------------------------- |
| Compute            | ECS Fargate                |
| Container registry | ECR                        |
| API                | REST API Gateway           |
| LLM                | AWS Bedrock (Llama 3.1 8B) |
| Job data           | RapidAPI JSearch           |
| Cache              | ElastiCache Redis          |
| Scheduler          | EventBridge + Lambda       |
| Secrets            | AWS Secrets Manager        |
| IaC                | Terraform                  |

## Getting Started

### Prerequisites
- AWS CLI configured
- Terraform >= 1.6
- Docker
- RapidAPI account + JSearch API key

### 1. Create Terraform state bucket
```bash
aws s3 mb s3://chihho-terraform-state --region us-east-1
```

### 2. Deploy infrastructure
```bash
cd infra/environments/prod

terraform init
terraform plan -var="s3_bucket_name=chihho-dev-assets" -var="adzuna_app_id=APP_ID" -var="adzuna_app_key=APP_KEY"
terraform apply
```

### 3. Build and push AI Assistant API
```bash
chmod +x deploy.sh
./deploy.sh
```

### 4. Enable Bedrock model access
Go to AWS Console → Bedrock → Model access → Request access for:
- `meta.llama3-1-8b-instruct-v1:0`

### 5. Add API Gateway URL to Vercel env vars
```
AI_API_URL=https://xxx.execute-api.us-east-1.amazonaws.com/prod
AI_API_KEY=xxx  # get from: aws apigateway get-api-key --api-key <id> --include-value
```

## API

### POST /analyze
```json
// request
{ "jobQuery": "senior platform engineer" }

// response
{
  "jobsAnalyzed": 45,
  "overallSummary": "Strong match for SRE and platform roles...",
  "topMatches": [
    {
      "jobId": "...",
      "jobTitle": "Senior Platform Engineer",
      "company": "Acme Corp",
      "matchScore": 88,
      "matchSummary": "Strong CI/CD and Kubernetes experience aligns well",
      "strengths": ["Kubernetes", "CI/CD", "Python"],
      "gaps": ["Go", "Rust"],
      "recommendation": "strong yes",
      "applyUrl": "https://..."
    }
  ],
  "skillGaps": ["Go", "Rust", "gRPC"]
}
```

## Local Development
```bash
cd src
npm install
REDIS_HOST=localhost S3_BUCKET=chihho-dev-assets AWS_REGION=us-east-1 npm run dev
```