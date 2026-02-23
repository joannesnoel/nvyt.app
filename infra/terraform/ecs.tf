# ECS Cluster, Task Definition, and Service

# ECR Repository for migrations
resource "aws_ecr_repository" "migrate" {
  name                 = "nvyt-migrate"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = false
  }

  tags = {
    Name = "nvyt-migrate"
  }
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }

  tags = {
    Name = "${local.name_prefix}-cluster"
  }
}

# ECS Task Definition
resource "aws_ecs_task_definition" "main" {
  family                   = "${local.name_prefix}-web"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "web"
      image = "${aws_ecr_repository.main.repository_url}:latest"

      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "HOST", value = "0.0.0.0" },
        { name = "PORT", value = tostring(var.container_port) },
        { name = "NUXT_PUBLIC_APP_URL", value = var.app_url },
        { name = "APP_URL", value = var.app_url },
        { name = "NUXT_PUBLIC_ENABLE_GTM", value = "true" },
        { name = "NUXT_PUBLIC_SENTRY_DSN", value = var.sentry_dsn },
      ]

      secrets = [
        # Admin
        { name = "NUXT_ADMIN_EMAILS", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:ADMIN_EMAILS::" },
        # Database
        { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:DATABASE_URL::" },
        { name = "NUXT_DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_DATABASE_URL::" },
        # JWT
        { name = "NUXT_JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_JWT_SECRET::" },
        # PayMongo
        { name = "NUXT_PAYMONGO_SECRET_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PAYMONGO_SECRET_KEY::" },
        { name = "NUXT_PAYMONGO_WEBHOOK_SECRET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PAYMONGO_WEBHOOK_SECRET::" },
        { name = "NUXT_PAYMONGO_PAYMENT_METHODS", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PAYMONGO_PAYMENT_METHODS::" },
        { name = "NUXT_PUBLIC_PAYMONGO_PUBLIC_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PUBLIC_PAYMONGO_PUBLIC_KEY::" },
        # PayPal
        { name = "NUXT_PAYPAL_CLIENT_ID", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PAYPAL_CLIENT_ID::" },
        { name = "NUXT_PAYPAL_CLIENT_SECRET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PAYPAL_CLIENT_SECRET::" },
        { name = "NUXT_PAYPAL_MODE", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PAYPAL_MODE::" },
        { name = "NUXT_PAYPAL_WEBHOOK_ID", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PAYPAL_WEBHOOK_ID::" },
        { name = "NUXT_PUBLIC_PAYPAL_CLIENT_ID", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PUBLIC_PAYPAL_CLIENT_ID::" },
        { name = "NUXT_PUBLIC_PAYPAL_MODE", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PUBLIC_PAYPAL_MODE::" },
        # Google Maps
        { name = "NUXT_PUBLIC_GOOGLE_MAPS_API_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PUBLIC_GOOGLE_MAPS_API_KEY::" },
        # Pusher
        { name = "NUXT_PUSHER_APP_ID", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PUSHER_APP_ID::" },
        { name = "NUXT_PUSHER_SECRET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PUSHER_SECRET::" },
        { name = "NUXT_PUBLIC_PUSHER_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PUBLIC_PUSHER_KEY::" },
        { name = "NUXT_PUBLIC_PUSHER_CLUSTER", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PUBLIC_PUSHER_CLUSTER::" },
        { name = "SMTP_HOST", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_SMTP_HOST::" },
        { name = "SMTP_PORT", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_SMTP_PORT::" },
        { name = "SMTP_USER", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_SMTP_USER::" },
        { name = "SMTP_PASS", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_SMTP_PASS::" },
        { name = "NUXT_SMTP_HOST", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_SMTP_HOST::" },
        { name = "NUXT_SMTP_PORT", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_SMTP_PORT::" },
        { name = "NUXT_SMTP_USER", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_SMTP_USER::" },
        { name = "NUXT_SMTP_PASS", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_SMTP_PASS::" },
        { name = "S3_ENDPOINT", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_S3_ENDPOINT::" },
        { name = "S3_REGION", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_S3_REGION::" },
        { name = "S3_BUCKET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_S3_BUCKET::" },
        { name = "NUXT_S3_ENDPOINT", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_S3_ENDPOINT::" },
        { name = "NUXT_S3_REGION", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_S3_REGION::" },
        { name = "NUXT_S3_BUCKET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_S3_BUCKET::" },
        { name = "S3_PUBLIC_URL", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PUBLIC_S3_PUBLIC_URL::" },
        { name = "NUXT_PUBLIC_S3_PUBLIC_URL", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PUBLIC_S3_PUBLIC_URL::" },
        # Cron
        { name = "NUXT_CRON_SECRET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_CRON_SECRET::" },
        { name = "CRON_SECRET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:CRON_SECRET::" },
        # Web Push (VAPID)
        { name = "NUXT_VAPID_PUBLIC_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_VAPID_PUBLIC_KEY::" },
        { name = "NUXT_VAPID_PRIVATE_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_VAPID_PRIVATE_KEY::" },
        { name = "NUXT_PUBLIC_VAPID_PUBLIC_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PUBLIC_VAPID_PUBLIC_KEY::" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "web"
        }
      }

      essential = true
    }
  ])

  tags = {
    Name = "${local.name_prefix}-web"
  }
}

# Migration Task Definition
resource "aws_ecs_task_definition" "migrate" {
  family                   = "${local.name_prefix}-migrate"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "migrate"
      image = "${aws_ecr_repository.migrate.repository_url}:latest"

      environment = [
        { name = "NODE_ENV", value = "production" },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:DATABASE_URL::" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "migrate"
        }
      }

      essential = true
    }
  ])

  tags = {
    Name = "${local.name_prefix}-migrate"
  }
}

# ECS Service
resource "aws_ecs_service" "main" {
  name            = "${local.name_prefix}-web"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.main.arn
  desired_count   = var.ecs_desired_count
  launch_type     = "FARGATE"

  # Enable ECS Exec for debugging and running commands
  enable_execute_command = true

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.main.arn
    container_name   = "web"
    container_port   = var.container_port
  }

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  # Wait for ALB listener to be ready
  depends_on = [aws_lb_listener.https]

  # Ignore changes to desired_count (allow manual scaling)
  lifecycle {
    ignore_changes = [desired_count]
  }

  tags = {
    Name = "${local.name_prefix}-web"
  }
}
