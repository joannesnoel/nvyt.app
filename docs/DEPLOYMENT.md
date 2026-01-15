# Deployment Guide

> How to deploy nvyt.app to production

---

## Deployment Options

| Option | Best For | Complexity |
|--------|----------|------------|
| **AWS ECS** | Production, managed | Medium |
| **Kubernetes** | Production, scaling | High |
| **Docker Compose** | Small deployments | Medium |
| **Platform (Vercel/Railway)** | Quick deploys | Low |

---

## AWS ECS Deployment (Recommended)

nvyt.app production runs on AWS ECS Fargate with the following infrastructure:

### Architecture

| Component | AWS Service | Details |
|-----------|-------------|---------|
| Compute | ECS Fargate | 2 tasks, auto-scaling |
| Database | RDS PostgreSQL | db.t3.micro, private subnet |
| Load Balancer | ALB | HTTPS termination |
| SSL/TLS | ACM | Auto-renewed certificates |
| Storage | S3 | User uploads |
| Container Registry | ECR | Docker images |
| Secrets | Secrets Manager | Database credentials, API keys |
| DNS | Cloudflare | Proxy & DDoS protection |

### Prerequisites

- AWS CLI configured with profile `nvyt-prod`
- Terraform 1.5+
- Docker

### Infrastructure Setup (One-time)

```bash
cd infra/terraform

# Initialize Terraform
terraform init

# Review planned changes
terraform plan

# Apply infrastructure
terraform apply
```

This creates all AWS resources including VPC, RDS, ECS cluster, ALB, etc.

### Deploy Application

```bash
# From project root
./infra/scripts/deploy.sh latest
```

This script:
1. Builds Docker image
2. Pushes to ECR
3. Updates ECS service (rolling deployment)

### Run Database Migrations

```bash
# Run migrations using existing image
./infra/scripts/migrate.sh

# Or build new migration image first
./infra/scripts/migrate.sh --build
```

Migrations run as a one-off ECS Fargate task that connects to RDS.

### Full Deployment Workflow

When deploying changes with database migrations:

```bash
# 1. Run migrations FIRST
./infra/scripts/migrate.sh --build

# 2. Deploy application
./infra/scripts/deploy.sh latest

# 3. Verify
curl https://nvyt.app/api/health
```

### Configuration

**Terraform Variables** (`infra/terraform/terraform.tfvars`):

```hcl
aws_region     = "ap-southeast-1"
environment    = "production"
app_url        = "https://nvyt.app"
admin_emails   = "admin@nvyt.app"
```

**Secrets** (AWS Secrets Manager):

Secrets are stored in `nvyt-production/app-secrets`:
- `DATABASE_URL` - PostgreSQL connection string with SSL
- `JWT_SECRET` - JWT signing secret
- `PAYMONGO_*` - Payment gateway keys
- `PUSHER_*` - Real-time messaging keys
- `SENDGRID_API_KEY` - Email service

### Monitoring

```bash
# Check ECS service status
aws --profile nvyt-prod ecs describe-services \
  --cluster nvyt-production-cluster \
  --services nvyt-production-web

# View application logs
aws --profile nvyt-prod logs tail /ecs/nvyt-production --follow

# List running tasks
aws --profile nvyt-prod ecs list-tasks \
  --cluster nvyt-production-cluster \
  --service-name nvyt-production-web
```

### Scaling

```bash
# Manual scaling
aws --profile nvyt-prod ecs update-service \
  --cluster nvyt-production-cluster \
  --service nvyt-production-web \
  --desired-count 4
```

### Costs

Estimated monthly costs (ap-southeast-1):
- ECS Fargate (2 tasks): ~$30
- RDS db.t3.micro: ~$15
- ALB: ~$20
- S3 + ECR: ~$5
- **Total: ~$70/month**

---

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (1.28+)
- kubectl configured
- Container registry (Docker Hub, GHCR, etc.)
- cert-manager (for TLS)
- nginx-ingress or traefik

### Step 1: Build and Push Image

**Using GitHub Container Registry (GHCR):**

```bash
# Build the image
docker build -t ghcr.io/your-org/nvyt-web:latest -f docker/Dockerfile .

# Push to registry
docker push ghcr.io/your-org/nvyt-web:latest
```

**Using Local/Private Registry:**

```bash
# Build the image for local registry
docker build -t 192.168.0.20:30500/nvyt-web:latest -f docker/Dockerfile .

# Push to local registry
docker push 192.168.0.20:30500/nvyt-web:latest
```

Note: When using a local registry, you can comment out `imagePullSecrets` in the deployment manifest.

### Step 2: Configure Secrets

Edit `k8s/secret.yaml` with real values:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: nvyt-secrets
  namespace: nvyt
type: Opaque
stringData:
  DATABASE_URL: "postgresql://user:pass@host:5432/nvyt"
  JWT_SECRET: "your-production-secret-min-32-chars"
  PAYMONGO_SECRET_KEY: "sk_live_xxx"
  PAYMONGO_PUBLIC_KEY: "pk_live_xxx"
  RESEND_API_KEY: "re_xxx"
  PUSHER_APP_ID: "your-pusher-app-id"
  PUSHER_KEY: "your-pusher-key"
  PUSHER_SECRET: "your-pusher-secret"
  PUSHER_CLUSTER: "ap1"
```

**Important:** For production, use:
- [External Secrets Operator](https://external-secrets.io/)
- [Sealed Secrets](https://sealed-secrets.netlify.app/)
- Cloud provider secret managers

### Step 3: Update Deployment Image

Edit `k8s/deployment.yaml` with your registry:

**For GHCR:**
```yaml
spec:
  template:
    spec:
      containers:
        - name: web
          image: ghcr.io/your-org/nvyt-web:latest
      imagePullSecrets:
        - name: ghcr-secret
```

**For Local/Private Registry:**
```yaml
spec:
  template:
    spec:
      containers:
        - name: web
          image: 192.168.0.20:30500/nvyt-web:latest
      # imagePullSecrets not needed for local registry
```

### Step 4: Configure Ingress

Edit `k8s/ingress.yaml`:

```yaml
spec:
  tls:
    - hosts:
        - nvyt.app
      secretName: nvyt-tls
  rules:
    - host: nvyt.app  # Your domain
```

### Step 5: Deploy

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Deploy configuration
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml

# Deploy application
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/hpa.yaml

# Verify deployment
kubectl get pods -n nvyt
kubectl get ingress -n nvyt
```

### Step 6: Database Migrations

Use the migration Job to safely apply schema changes:

```bash
# Delete any previous migration job
kubectl delete job db-migrate -n nvyt --ignore-not-found

# Run migration job
kubectl apply -f k8s/migration-job.yaml

# Wait for completion and check status
kubectl wait --for=condition=complete job/db-migrate -n nvyt --timeout=120s

# View migration logs
kubectl logs job/db-migrate -n nvyt
```

**Important:** Always run migrations BEFORE deploying new application code that depends on schema changes.

---

## Safe Deployment Workflow (with migrations)

When deploying changes that include database migrations:

```bash
# 1. Build and push new image
docker build -t 192.168.0.20:30500/nvyt-web:latest -f docker/Dockerfile .
docker push 192.168.0.20:30500/nvyt-web:latest

# 2. Run migrations FIRST (using new image)
kubectl delete job db-migrate -n nvyt --ignore-not-found
kubectl apply -f k8s/migration-job.yaml
kubectl wait --for=condition=complete job/db-migrate -n nvyt --timeout=120s

# 3. Check migration succeeded
kubectl logs job/db-migrate -n nvyt

# 4. Deploy application (only after migrations succeed)
kubectl rollout restart deployment/nvyt-web -n nvyt
kubectl rollout status deployment/nvyt-web -n nvyt
```

**If migration fails:**
- Check logs: `kubectl logs job/db-migrate -n nvyt`
- Do NOT deploy the new application code
- Fix the migration locally and rebuild the image

---

## CI/CD with GitHub Actions

### `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}/nvyt-web

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          file: docker/Dockerfile
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up kubectl
        uses: azure/setup-kubectl@v3

      - name: Configure kubectl
        run: |
          echo "${{ secrets.KUBE_CONFIG }}" | base64 -d > kubeconfig
          export KUBECONFIG=kubeconfig

      - name: Update deployment
        run: |
          kubectl set image deployment/nvyt-web \
            web=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            -n nvyt

      - name: Wait for rollout
        run: |
          kubectl rollout status deployment/nvyt-web -n nvyt --timeout=300s
```

---

## Database Setup

### Managed PostgreSQL (Recommended)

**Options:**
- [Neon](https://neon.tech/) - Serverless Postgres
- [Supabase](https://supabase.com/) - Postgres + extras
- [DigitalOcean](https://www.digitalocean.com/products/managed-databases)
- [AWS RDS](https://aws.amazon.com/rds/postgresql/)

**Connection String Format:**
```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require
```

### Self-Hosted PostgreSQL

Deploy to Kubernetes:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: nvyt
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16-alpine
          env:
            - name: POSTGRES_USER
              value: nvyt
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: nvyt-secrets
                  key: POSTGRES_PASSWORD
            - name: POSTGRES_DB
              value: nvyt
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi
```

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for signing JWTs (min 32 chars) |
| `APP_URL` | Public URL (https://nvyt.app) |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PAYMONGO_PUBLIC_KEY` | PayMongo public key | - |
| `PAYMONGO_SECRET_KEY` | PayMongo secret key | - |
| `RESEND_API_KEY` | Resend email API key | - |
| `PUSHER_APP_ID` | Pusher application ID | - |
| `PUSHER_KEY` | Pusher public key | - |
| `PUSHER_SECRET` | Pusher secret key | - |
| `PUSHER_CLUSTER` | Pusher cluster region | ap1 |
| `NODE_ENV` | Environment | production |

---

## SSL/TLS

### With cert-manager

1. Install cert-manager:
```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.0/cert-manager.yaml
```

2. Create ClusterIssuer:
```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
      - http01:
          ingress:
            class: nginx
```

3. Annotate ingress:
```yaml
metadata:
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
```

---

## Monitoring

### Health Check Endpoint

The app exposes `/api/health`:

```bash
curl https://nvyt.app/api/health
# {"status":"healthy","timestamp":"...","version":"1.0.0"}
```

### Kubernetes Probes

Already configured in `k8s/deployment.yaml`:

```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

### Prometheus Metrics (Future)

Add metrics endpoint at `/api/metrics`

---

## Scaling

### Horizontal Pod Autoscaler

Already configured in `k8s/hpa.yaml`:

- Min replicas: 2
- Max replicas: 10
- Target CPU: 70%
- Target Memory: 80%

### Manual Scaling

```bash
kubectl scale deployment nvyt-web --replicas=5 -n nvyt
```

---

## Rollback

### Application Rollback

```bash
# View rollout history
kubectl rollout history deployment/nvyt-web -n nvyt

# Rollback to previous version
kubectl rollout undo deployment/nvyt-web -n nvyt

# Rollback to specific revision
kubectl rollout undo deployment/nvyt-web --to-revision=2 -n nvyt
```

### Database Migration Rollback

Drizzle migrations are forward-only. If you need to rollback a migration:

1. **For additive changes** (new tables, new columns with defaults): Just rollback the app, old code ignores new columns
2. **For breaking changes** (removed columns, renamed tables): Create a new migration to reverse the changes

**Best Practice:** Make migrations backward-compatible when possible:
- Add new columns as nullable or with defaults
- Keep old columns until all app versions are updated
- Use feature flags for schema-dependent features

---

## Troubleshooting

### View Logs

```bash
# All pods
kubectl logs -l app=nvyt-web -n nvyt

# Specific pod
kubectl logs nvyt-web-xxx -n nvyt

# Follow logs
kubectl logs -f nvyt-web-xxx -n nvyt
```

### Debug Pod

```bash
# Shell into pod
kubectl exec -it nvyt-web-xxx -n nvyt -- sh

# Check environment
kubectl exec nvyt-web-xxx -n nvyt -- env
```

### Common Issues

**ImagePullBackOff:**
- Check image name/tag
- Verify registry credentials

**CrashLoopBackOff:**
- Check logs for errors
- Verify environment variables
- Check database connectivity

**503 Service Unavailable:**
- Check pod readiness
- Verify service selector matches pods

---

## Security Checklist

- [ ] Use managed database with encryption
- [ ] Enable TLS for all traffic
- [ ] Use strong JWT_SECRET (min 32 chars)
- [ ] Store secrets in secret manager
- [ ] Enable network policies
- [ ] Configure pod security policies
- [ ] Set resource limits
- [ ] Enable audit logging
- [ ] Regular security updates

---

*Last updated: January 14, 2026*
