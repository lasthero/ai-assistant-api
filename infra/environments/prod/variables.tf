variable "aws_region" {
  default = "us-east-1"
}

variable "project_name" {
  default = "chihho-ai-assistant"
}

variable "env" {
  default = "prod"
}

variable "s3_bucket_name" {
  description = "S3 bucket containing resume PDF"
}

variable "adzuna_app_id" {
  description = "Adzuna API app ID"
  sensitive   = true
}

variable "adzuna_app_key" {
  description = "Adzuna API app key"
  sensitive   = true
}
