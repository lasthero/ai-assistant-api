variable "project_name"        {}
variable "aws_region"          {}
variable "vpc_id"              {}
variable "private_subnet_ids"  { type = list(string) }
variable "redis_host"          {}
variable "rapidapi_secret_arn" {}
variable "lambda_role_arn"     {}

resource "aws_security_group" "lambda" {
  name   = "${var.project_name}-lambda-sg"
  vpc_id = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# Install npm deps and zip together
resource "null_resource" "lambda_build" {
  triggers = {
    scraper_hash     = filemd5("${path.module}/scraper.js")
    package_hash     = filemd5("${path.module}/package.json")
  }

  provisioner "local-exec" {
    command     = "npm install --production"
    working_dir = path.module
  }
}

data "archive_file" "scraper" {
  type        = "zip"
  source_dir  = path.module          # zips scraper.js + node_modules
  output_path = "${path.module}/scraper.zip"
  excludes    = ["*.tf", "*.zip", "*.example"]

  depends_on = [null_resource.lambda_build]
}

resource "aws_lambda_function" "scraper" {
  function_name    = "${var.project_name}-job-scraper"
  role             = var.lambda_role_arn
  handler          = "scraper.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.scraper.output_path
  source_code_hash = data.archive_file.scraper.output_base64sha256
  timeout          = 60
  memory_size      = 256

  environment {
    variables = {
      REDIS_HOST          = var.redis_host
      RAPIDAPI_SECRET_ARN = var.rapidapi_secret_arn
      AWS_REGION_NAME     = var.aws_region
      JOB_QUERIES = jsonencode([
        "senior software engineer New York",
        "senior platform engineer New York",
        "site reliability engineer New York",
        "staff engineer New York",
      ])
    }
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.lambda.id]
  }

  depends_on = [data.archive_file.scraper]
}

# EventBridge rule — runs every 4 hours
resource "aws_cloudwatch_event_rule" "scraper" {
  name                = "${var.project_name}-scraper-schedule"
  schedule_expression = "rate(4 hours)"
  force_destroy       = true
}

resource "aws_cloudwatch_event_target" "scraper" {
  rule      = aws_cloudwatch_event_rule.scraper.name
  target_id = "scraper"
  arn       = aws_lambda_function.scraper.arn
}

resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scraper.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.scraper.arn
}

# CloudWatch log group for Lambda
resource "aws_cloudwatch_log_group" "scraper" {
  name              = "/aws/lambda/${var.project_name}-job-scraper"
  retention_in_days = 7
}
