#!/bin/bash
# Run database migrations on AWS RDS via ECS run-task
# Usage: ./db-migrate.sh

set -e

# Configuration
AWS_PROFILE="nvyt-prod"
AWS_REGION="ap-southeast-1"
ECS_CLUSTER="nvyt-production-cluster"
TASK_DEFINITION="nvyt-production-web"

echo "=========================================="
echo "Running database migrations"
echo "=========================================="

# Get the latest task definition ARN
TASK_DEF_ARN=$(aws --profile $AWS_PROFILE ecs describe-task-definition \
  --task-definition $TASK_DEFINITION \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text \
  --region $AWS_REGION)

echo "Task Definition: $TASK_DEF_ARN"

# Get VPC configuration from the service
SERVICE_CONFIG=$(aws --profile $AWS_PROFILE ecs describe-services \
  --cluster $ECS_CLUSTER \
  --services nvyt-production-web \
  --query 'services[0].networkConfiguration.awsvpcConfiguration' \
  --output json \
  --region $AWS_REGION)

SUBNETS=$(echo $SERVICE_CONFIG | jq -r '.subnets | join(",")')
SECURITY_GROUPS=$(echo $SERVICE_CONFIG | jq -r '.securityGroups | join(",")')

echo "Subnets: $SUBNETS"
echo "Security Groups: $SECURITY_GROUPS"
echo ""

# Note: This requires a migration command in the container
# For now, we'll output instructions for manual migration
echo "=========================================="
echo "Manual Migration Instructions"
echo "=========================================="
echo ""
echo "Option 1: Run from local machine with port forwarding"
echo "  1. Create a bastion host or use SSM Session Manager"
echo "  2. Port forward to RDS"
echo "  3. Run: DATABASE_URL=<rds-url> pnpm --filter @nvyt/db db:push"
echo ""
echo "Option 2: Run from ECS Exec (requires ECS Exec enabled)"
echo "  aws --profile $AWS_PROFILE ecs execute-command \\"
echo "    --cluster $ECS_CLUSTER \\"
echo "    --task <task-id> \\"
echo "    --container web \\"
echo "    --interactive \\"
echo "    --command '/bin/sh'"
echo ""
echo "Then run migrations inside the container."
