# EventBridge Scheduler for Expire Stale Orders Cron Job
# Runs every 15 minutes, invokes ECS RunTask with curl to hit the cron endpoint

resource "aws_scheduler_schedule" "expire_orders" {
  name       = "${local.name_prefix}-expire-stale-orders"
  group_name = "default"

  flexible_time_window {
    mode = "OFF"
  }

  schedule_expression = "rate(15 minutes)"

  target {
    arn      = aws_ecs_cluster.main.arn
    role_arn = aws_iam_role.eventbridge_scheduler.arn

    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.expire_orders.arn
      launch_type         = "FARGATE"
      task_count          = 1

      network_configuration {
        subnets          = aws_subnet.public[*].id
        security_groups  = [aws_security_group.ecs.id]
        assign_public_ip = true
      }
    }
  }

  state = "ENABLED"
}

# Lightweight task definition for the cron curl job
resource "aws_ecs_task_definition" "expire_orders" {
  family                   = "${local.name_prefix}-expire-orders"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "expire-orders"
      image = "curlimages/curl:latest"

      command = [
        "/bin/sh", "-c",
        "for i in $(seq 1 30); do curl -sf http://localhost:3000/ && break || sleep 3; done && curl -sf -X POST -H \"Authorization: Bearer $CRON_SECRET\" http://localhost:3000/api/v1/cron/expire-orders"
      ]

      # Must be essential so ECS stops the entire task when curl exits
      essential = true

      secrets = [
        { name = "CRON_SECRET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:CRON_SECRET::" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "expire-orders"
        }
      }
    },
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
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:DATABASE_URL::" },
        { name = "NUXT_DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_DATABASE_URL::" },
        { name = "NUXT_JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_JWT_SECRET::" },
        { name = "NUXT_CRON_SECRET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_CRON_SECRET::" },
        { name = "CRON_SECRET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:CRON_SECRET::" },
        { name = "NUXT_PAYMONGO_SECRET_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PAYMONGO_SECRET_KEY::" },
        { name = "NUXT_PUBLIC_PAYMONGO_PUBLIC_KEY", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PUBLIC_PAYMONGO_PUBLIC_KEY::" },
        { name = "NUXT_PAYPAL_CLIENT_ID", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PAYPAL_CLIENT_ID::" },
        { name = "NUXT_PAYPAL_CLIENT_SECRET", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PAYPAL_CLIENT_SECRET::" },
        { name = "NUXT_PAYPAL_MODE", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_PAYPAL_MODE::" },
        { name = "NUXT_SMTP_HOST", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_SMTP_HOST::" },
        { name = "NUXT_SMTP_PORT", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_SMTP_PORT::" },
        { name = "NUXT_SMTP_USER", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_SMTP_USER::" },
        { name = "NUXT_SMTP_PASS", valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NUXT_SMTP_PASS::" },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "expire-orders-web"
        }
      }

      essential = true
    }
  ])

  tags = {
    Name = "${local.name_prefix}-expire-orders"
  }
}

# IAM Role for EventBridge Scheduler to invoke ECS RunTask
resource "aws_iam_role" "eventbridge_scheduler" {
  name = "${local.name_prefix}-eventbridge-scheduler-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "scheduler.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${local.name_prefix}-eventbridge-scheduler-role"
  }
}

resource "aws_iam_role_policy" "eventbridge_scheduler_ecs" {
  name = "${local.name_prefix}-eventbridge-ecs-policy"
  role = aws_iam_role.eventbridge_scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:RunTask"
        ]
        Resource = [
          aws_ecs_task_definition.expire_orders.arn,
          "${replace(aws_ecs_task_definition.expire_orders.arn, "/:\\d+$/", "")}:*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = [
          aws_iam_role.ecs_execution.arn,
          aws_iam_role.ecs_task.arn
        ]
      }
    ]
  })
}
