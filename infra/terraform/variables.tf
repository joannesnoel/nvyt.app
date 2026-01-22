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
# Note: ADMIN_EMAILS is now managed directly in AWS Secrets Manager
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
