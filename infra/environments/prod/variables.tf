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

variable "rapidapi_key" {
  description = "RapidAPI key for JSearch"
  sensitive   = true
}
