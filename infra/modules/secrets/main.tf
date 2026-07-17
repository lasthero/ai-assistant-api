variable "project_name"   {}
variable "adzuna_app_id"  { sensitive = true }
variable "adzuna_app_key" { sensitive = true }

resource "aws_secretsmanager_secret" "adzuna" {
  name                    = "${var.project_name}/adzuna"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "adzuna" {
  secret_id     = aws_secretsmanager_secret.adzuna.id
  secret_string = jsonencode({
    app_id  = var.adzuna_app_id
    app_key = var.adzuna_app_key
  })
}

output "adzuna_secret_arn" { value = aws_secretsmanager_secret.adzuna.arn }
