# AWS Secrets Manager for Application Secrets

resource "aws_secretsmanager_secret" "app_secrets" {
  name        = "${local.name_prefix}/app-secrets"
  description = "Application secrets for ${local.name_prefix}"

  tags = {
    Name = "${local.name_prefix}-app-secrets"
  }
}

resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id

  secret_string = jsonencode({
    # Database
    DATABASE_URL      = "postgresql://${var.db_username}:${random_password.db_password.result}@${aws_db_instance.main.endpoint}/${var.db_name}"
    NUXT_DATABASE_URL = "postgresql://${var.db_username}:${random_password.db_password.result}@${aws_db_instance.main.endpoint}/${var.db_name}"

    # JWT
    NUXT_JWT_SECRET = random_password.jwt_secret.result

    # PayMongo
    NUXT_PAYMONGO_SECRET_KEY        = var.paymongo_secret_key
    NUXT_PAYMONGO_WEBHOOK_SECRET    = var.paymongo_webhook_secret
    NUXT_PUBLIC_PAYMONGO_PUBLIC_KEY = var.paymongo_public_key

    # PayPal
    NUXT_PAYPAL_CLIENT_ID        = var.paypal_client_id
    NUXT_PAYPAL_CLIENT_SECRET    = var.paypal_client_secret
    NUXT_PAYPAL_MODE             = var.paypal_mode
    NUXT_PAYPAL_WEBHOOK_ID       = var.paypal_webhook_id
    NUXT_PUBLIC_PAYPAL_CLIENT_ID = var.paypal_client_id
    NUXT_PUBLIC_PAYPAL_MODE      = var.paypal_mode

    # Google Maps
    NUXT_PUBLIC_GOOGLE_MAPS_API_KEY = var.google_maps_api_key

    # Pusher
    NUXT_PUSHER_APP_ID         = var.pusher_app_id
    NUXT_PUSHER_SECRET         = var.pusher_secret
    NUXT_PUBLIC_PUSHER_KEY     = var.pusher_key
    NUXT_PUBLIC_PUSHER_CLUSTER = var.pusher_cluster

    # S3
    NUXT_S3_ENDPOINT          = "https://s3.${var.aws_region}.amazonaws.com"
    NUXT_S3_REGION            = var.aws_region
    NUXT_S3_BUCKET            = var.s3_bucket_name
    NUXT_PUBLIC_S3_PUBLIC_URL = "https://${var.s3_bucket_name}.s3.${var.aws_region}.amazonaws.com"

    # Note: S3 access key/secret not needed when using IAM role
    # The ECS task role has S3 permissions
  })
}

# Store database password separately for easier access
resource "aws_secretsmanager_secret" "db_password" {
  name        = "${local.name_prefix}/db-password"
  description = "Database password for ${local.name_prefix}"

  tags = {
    Name = "${local.name_prefix}-db-password"
  }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}
