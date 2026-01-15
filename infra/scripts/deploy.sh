#!/bin/bash
# Deploy script for nvyt.app production (AWS ECS)
# Usage: ./deploy.sh [tag]
# Example: ./deploy.sh latest
#          ./deploy.sh v1.0.0

set -e

# Configuration
AWS_PROFILE="nvyt-prod"
AWS_REGION="ap-southeast-1"
ECR_REPOSITORY="nvyt-web"
ECS_CLUSTER="nvyt-production-cluster"
ECS_SERVICE="nvyt-production-web"
IMAGE_TAG="${1:-latest}"

echo "=========================================="
echo "Deploying nvyt.app to AWS ECS"
echo "=========================================="
echo "Profile: $AWS_PROFILE"
echo "Region: $AWS_REGION"
echo "Image Tag: $IMAGE_TAG"
echo ""

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws --profile $AWS_PROFILE sts get-caller-identity --query Account --output text)
ECR_URL="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

echo "ECR URL: $ECR_URL"
echo ""

# Step 1: Build Docker image
echo "[1/4] Building Docker image..."
docker build -t $ECR_REPOSITORY:$IMAGE_TAG -f docker/Dockerfile .

# Step 2: Tag for ECR
echo "[2/4] Tagging image for ECR..."
docker tag $ECR_REPOSITORY:$IMAGE_TAG $ECR_URL/$ECR_REPOSITORY:$IMAGE_TAG

# Step 3: Login to ECR and push
echo "[3/4] Pushing to ECR..."
aws --profile $AWS_PROFILE ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_URL
docker push $ECR_URL/$ECR_REPOSITORY:$IMAGE_TAG

# Step 4: Update ECS service
echo "[4/4] Updating ECS service..."
aws --profile $AWS_PROFILE ecs update-service \
  --cluster $ECS_CLUSTER \
  --service $ECS_SERVICE \
  --force-new-deployment \
  --region $AWS_REGION

echo ""
echo "=========================================="
echo "Deployment initiated!"
echo "=========================================="
echo ""
echo "Monitor deployment status:"
echo "  aws --profile $AWS_PROFILE ecs describe-services --cluster $ECS_CLUSTER --services $ECS_SERVICE --region $AWS_REGION"
echo ""
echo "View logs:"
echo "  aws --profile $AWS_PROFILE logs tail /ecs/nvyt-production --follow --region $AWS_REGION"
