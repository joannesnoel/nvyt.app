#!/bin/bash
# Run database migrations for nvyt.app production (AWS ECS)
# Usage: ./migrate.sh [--build]
# Options:
#   --build   Build and push a new migration image before running

set -e

# Configuration
AWS_PROFILE="nvyt-prod"
AWS_REGION="ap-southeast-1"
ECR_REPOSITORY="nvyt-migrate"
ECS_CLUSTER="nvyt-production-cluster"
TASK_FAMILY="nvyt-production-migrate"
VPC_ID="vpc-04f31d27b70914fe9"

echo "=========================================="
echo "Running database migrations for nvyt.app"
echo "=========================================="
echo "Profile: $AWS_PROFILE"
echo "Region: $AWS_REGION"
echo ""

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws --profile $AWS_PROFILE sts get-caller-identity --query Account --output text)
ECR_URL="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

# Check if we need to build
if [ "$1" == "--build" ]; then
  echo "[1/5] Building migration Docker image..."
  docker build -t $ECR_REPOSITORY:latest -f docker/Dockerfile.migrate .

  echo "[2/5] Tagging image for ECR..."
  docker tag $ECR_REPOSITORY:latest $ECR_URL/$ECR_REPOSITORY:latest

  echo "[3/5] Pushing to ECR..."
  aws --profile $AWS_PROFILE ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_URL
  docker push $ECR_URL/$ECR_REPOSITORY:latest
else
  echo "Skipping build (use --build to build new migration image)"
fi

# Get the latest task definition
echo "[4/5] Getting task definition..."
TASK_DEF_ARN=$(aws --profile $AWS_PROFILE ecs describe-task-definition \
  --task-definition $TASK_FAMILY \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text \
  --region $AWS_REGION)

if [ -z "$TASK_DEF_ARN" ] || [ "$TASK_DEF_ARN" == "None" ]; then
  echo "Error: Task definition $TASK_FAMILY not found."
  echo "Did you run 'terraform apply' first?"
  exit 1
fi

echo "Task Definition: $TASK_DEF_ARN"

# Get public subnets
PUBLIC_SUBNETS=$(aws --profile $AWS_PROFILE ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=tag:Name,Values=*public*" \
  --query 'Subnets[*].SubnetId' \
  --output text \
  --region $AWS_REGION | tr '\t' ',')

# Get ECS security group
SG_ID=$(aws --profile $AWS_PROFILE ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=group-name,Values=nvyt-production-ecs-sg" \
  --query 'SecurityGroups[0].GroupId' \
  --output text \
  --region $AWS_REGION)

echo "Subnets: $PUBLIC_SUBNETS"
echo "Security Group: $SG_ID"
echo ""

# Run the migration task
echo "[5/5] Running migration task..."
TASK_ARN=$(aws --profile $AWS_PROFILE ecs run-task \
  --cluster $ECS_CLUSTER \
  --task-definition $TASK_DEF_ARN \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$PUBLIC_SUBNETS],securityGroups=[$SG_ID],assignPublicIp=ENABLED}" \
  --query 'tasks[0].taskArn' \
  --output text \
  --region $AWS_REGION)

if [ -z "$TASK_ARN" ] || [ "$TASK_ARN" == "None" ]; then
  echo "Error: Failed to start migration task"
  exit 1
fi

TASK_ID=$(echo $TASK_ARN | cut -d'/' -f3)
echo "Migration task started: $TASK_ID"
echo ""

# Wait for task to complete
echo "Waiting for migration to complete..."
aws --profile $AWS_PROFILE ecs wait tasks-stopped \
  --cluster $ECS_CLUSTER \
  --tasks $TASK_ARN \
  --region $AWS_REGION

# Check exit code
EXIT_CODE=$(aws --profile $AWS_PROFILE ecs describe-tasks \
  --cluster $ECS_CLUSTER \
  --tasks $TASK_ARN \
  --query 'tasks[0].containers[0].exitCode' \
  --output text \
  --region $AWS_REGION)

echo ""
echo "=========================================="
if [ "$EXIT_CODE" == "0" ]; then
  echo "Migration completed successfully!"
else
  echo "Migration FAILED with exit code: $EXIT_CODE"
  echo ""
  echo "View logs:"
  echo "  aws --profile $AWS_PROFILE logs filter-log-events --log-group-name /ecs/nvyt-production --log-stream-name-prefix migrate/$TASK_ID --region $AWS_REGION"
  exit 1
fi
echo "=========================================="
echo ""
echo "View migration logs:"
echo "  aws --profile $AWS_PROFILE logs filter-log-events --log-group-name /ecs/nvyt-production --log-stream-name-prefix migrate/$TASK_ID --region $AWS_REGION"
