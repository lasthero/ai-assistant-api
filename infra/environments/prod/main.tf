terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket = "chihho-terraform-state"
    key    = "ai-assistant-server/prod/terraform.tfstate"
    region = "us-east-1"
  }
}

provider "aws" {
  region = var.aws_region
}

module "vpc" {
  source = "../../modules/vpc"
  name   = var.project_name
  env    = var.env
}

module "ecr" {
  source       = "../../modules/ecr"
  project_name = var.project_name
}

module "iam" {
  source       = "../../modules/iam"
  project_name = var.project_name
  s3_bucket    = var.s3_bucket_name
  aws_region   = var.aws_region
  account_id   = data.aws_caller_identity.current.account_id
}

module "secrets" {
  source         = "../../modules/secrets"
  project_name   = var.project_name
  adzuna_app_id  = var.adzuna_app_id
  adzuna_app_key = var.adzuna_app_key
}

module "elasticache" {
  source             = "../../modules/elasticache"
  project_name       = var.project_name
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
}

module "ecs" {
  source             = "../../modules/ecs"
  project_name       = var.project_name
  aws_region         = var.aws_region
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  public_subnet_ids  = module.vpc.public_subnet_ids
  ecr_repository_url = module.ecr.repository_url
  execution_role_arn = module.iam.ecs_execution_role_arn
  task_role_arn      = module.iam.ecs_task_role_arn
  redis_host         = module.elasticache.redis_host
  s3_bucket          = var.s3_bucket_name
  adzuna_secret_arn  = module.secrets.adzuna_secret_arn
}

module "api_gateway" {
  source       = "../../modules/api-gateway"
  project_name = var.project_name
  alb_dns_name = module.ecs.alb_dns_name
  env          = var.env
}

module "lambda" {
  source             = "../../modules/lambda"
  project_name       = var.project_name
  aws_region         = var.aws_region
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  redis_host         = module.elasticache.redis_host
  adzuna_secret_arn  = module.secrets.adzuna_secret_arn
  lambda_role_arn    = module.iam.lambda_role_arn
}

data "aws_caller_identity" "current" {}
