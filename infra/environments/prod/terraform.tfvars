# infra/environments/prod/terraform.tfvars
# Never commit this file — it's in .gitignore

aws_region     = "us-east-1"
project_name   = "chihho-ai-assistant"
env            = "prod"
s3_bucket_name = "chihho-dev-assets"
adzuna_app_id  = "43bb0000"
adzuna_app_key = "234f312036647d6a49992e678a9aae80"