# Input Variables for nvyt.app Production Infrastructure

variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "ap-southeast-1"
}

variable "aws_profile" {
  description = "AWS CLI profile to use"
  type        = string
  default     = "nvyt-prod"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "nvyt"
}

variable "environment" {
  description = "Environment name (production, staging, etc.)"
  type        = string
  default     = "production"
}

# Networking
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets (for RDS)"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]
}

# Domain
variable "domain_name" {
  description = "Primary domain name"
  type        = string
  default     = "nvyt.app"
}

# RDS
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "nvyt"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "nvyt"
}

# ECS
variable "ecs_task_cpu" {
  description = "ECS task CPU units (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 512
}

variable "ecs_task_memory" {
  description = "ECS task memory in MB"
  type        = number
  default     = 1024
}

variable "ecs_desired_count" {
  description = "Number of ECS tasks to run"
  type        = number
  default     = 2
}

variable "container_port" {
  description = "Container port for the application"
  type        = number
  default     = 3000
}

# S3
variable "s3_bucket_name" {
  description = "S3 bucket name for uploads"
  type        = string
  default     = "nvyt-uploads-prod"
}

# Application
variable "app_url" {
  description = "Public URL of the application"
  type        = string
  default     = "https://nvyt.app"
}

# Secrets (sensitive - provide via terraform.tfvars or env vars)
variable "admin_emails" {
  description = "Comma-separated list of admin email addresses"
  type        = string
  default     = ""
}

variable "paymongo_public_key" {
  description = "PayMongo public key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "paymongo_secret_key" {
  description = "PayMongo secret key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "paymongo_webhook_secret" {
  description = "PayMongo webhook secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "paymongo_payment_methods" {
  description = "PayMongo payment methods (comma-separated, e.g., 'gcash,paymaya,card,qrph')"
  type        = string
  default     = ""
}

variable "google_maps_api_key" {
  description = "Google Maps API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "pusher_app_id" {
  description = "Pusher app ID"
  type        = string
  default     = ""
}

variable "pusher_key" {
  description = "Pusher key"
  type        = string
  default     = ""
}

variable "pusher_secret" {
  description = "Pusher secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "pusher_cluster" {
  description = "Pusher cluster"
  type        = string
  default     = "ap1"
}

# PayPal
variable "paypal_client_id" {
  description = "PayPal client ID"
  type        = string
  default     = ""
}

variable "paypal_client_secret" {
  description = "PayPal client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "paypal_mode" {
  description = "PayPal mode (sandbox or live)"
  type        = string
  default     = "live"
}

variable "paypal_webhook_id" {
  description = "PayPal webhook ID"
  type        = string
  default     = ""
}

# SMTP
variable "smtp_host" {
  description = "SMTP server host"
  type        = string
  default     = ""
}

variable "smtp_port" {
  description = "SMTP server port"
  type        = string
  default     = "587"
}

variable "smtp_user" {
  description = "SMTP username"
  type        = string
  default     = ""
}

variable "smtp_pass" {
  description = "SMTP password"
  type        = string
  sensitive   = true
  default     = ""
}

variable "smtp_from" {
  description = "SMTP from address"
  type        = string
  default     = "nvyt <noreply@nvyt.app>"
}

variable "sentry_dsn" {
  description = "Sentry DSN for error tracking"
  type        = string
  default     = ""
}
