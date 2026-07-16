variable "project_name" {}
variable "rapidapi_key" { sensitive = true }

resource "aws_secretsmanager_secret" "rapidapi" {
  name                    = "${var.project_name}/rapidapi-key"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "rapidapi" {
  secret_id     = aws_secretsmanager_secret.rapidapi.id
  secret_string = var.rapidapi_key
}

output "rapidapi_secret_arn" { value = aws_secretsmanager_secret.rapidapi.arn }
