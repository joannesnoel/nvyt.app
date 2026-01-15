# Terraform Outputs

# VPC
output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = aws_subnet.private[*].id
}

# ALB
output "alb_dns_name" {
  description = "ALB DNS name - point your domain here"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB hosted zone ID (for Route 53 alias records)"
  value       = aws_lb.main.zone_id
}

# ACM Certificate
output "acm_certificate_arn" {
  description = "ACM certificate ARN"
  value       = aws_acm_certificate.main.arn
}

output "acm_certificate_validation_records" {
  description = "DNS records to add for certificate validation"
  value = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
}

# RDS
output "rds_endpoint" {
  description = "RDS endpoint"
  value       = aws_db_instance.main.endpoint
}

output "rds_database_name" {
  description = "RDS database name"
  value       = aws_db_instance.main.db_name
}

# ECR
output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = aws_ecr_repository.main.repository_url
}

output "ecr_migrate_repository_url" {
  description = "ECR migration repository URL"
  value       = aws_ecr_repository.migrate.repository_url
}

# S3
output "s3_bucket_name" {
  description = "S3 bucket name"
  value       = aws_s3_bucket.uploads.id
}

output "s3_bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.uploads.arn
}

# ECS
output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.main.name
}

output "ecs_migrate_task_definition" {
  description = "ECS migration task definition ARN"
  value       = aws_ecs_task_definition.migrate.arn
}

# Secrets
output "secrets_arn" {
  description = "Secrets Manager secret ARN"
  value       = aws_secretsmanager_secret.app_secrets.arn
}

# Connection info (for reference)
output "database_url_pattern" {
  description = "Database URL pattern (password stored in Secrets Manager)"
  value       = "postgresql://${var.db_username}:***@${aws_db_instance.main.endpoint}/${var.db_name}"
}

# DNS Setup Instructions
output "dns_setup_instructions" {
  description = "Instructions for DNS setup"
  value = <<-EOT

    =====================================================
    DNS SETUP INSTRUCTIONS (Cloudflare)
    =====================================================

    1. SSL Certificate Validation:
       Add these CNAME records to validate the ACM certificate:
       ${join("\n       ", [for k, v in {
  for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
    name  = dvo.resource_record_name
    value = dvo.resource_record_value
  }
} : "Name: ${v.name}\n          Value: ${v.value}"])}

    2. Point Domain to ALB:
       Add a CNAME record:
       - Name: @ (or nvyt.app)
       - Value: ${aws_lb.main.dns_name}
       - Proxy: OFF (DNS only) initially, then enable after verification

    3. Cloudflare SSL Settings:
       - Set SSL/TLS mode to "Full (strict)"

    =====================================================
  EOT
}
