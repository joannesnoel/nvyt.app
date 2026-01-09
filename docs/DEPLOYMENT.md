# Deployment Guide

> How to deploy nvyt.app to production

---

## Deployment Options

| Option | Best For | Complexity |
|--------|----------|------------|
| **Kubernetes** | Production, scaling | High |
| **Docker Compose** | Small deployments | Medium |
| **Platform (Vercel/Railway)** | Quick deploys | Low |

---

## Kubernetes Deployment

### Prerequisites

- Kubernetes cluster (1.28+)
- kubectl configured
- Container registry (Docker Hub, GHCR, etc.)
- cert-manager (for TLS)
- nginx-ingress or traefik

### Step 1: Build and Push Image

```bash
# Build the image
docker build -t ghcr.io/your-org/nvyt-web:latest -f docker/Dockerfile .

# Push to registry
docker push ghcr.io/your-org/nvyt-web:latest
```

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
  REDIS_URL: "redis://host:6379"
  JWT_SECRET: "your-production-secret-min-32-chars"
  PAYMONGO_SECRET_KEY: "sk_live_xxx"
  PAYMONGO_PUBLIC_KEY: "pk_live_xxx"
  RESEND_API_KEY: "re_xxx"
```

**Important:** For production, use:
- [External Secrets Operator](https://external-secrets.io/)
- [Sealed Secrets](https://sealed-secrets.netlify.app/)
- Cloud provider secret managers

### Step 3: Update Deployment Image

Edit `k8s/deployment.yaml`:

```yaml
spec:
  template:
    spec:
      containers:
        - name: web
          image: ghcr.io/your-org/nvyt-web:latest  # Your image
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

### Step 6: Database Setup

Run migrations from a pod:

```bash
# Get pod name
kubectl get pods -n nvyt

# Run migrations
kubectl exec -it nvyt-web-xxx -n nvyt -- npm run db:migrate
```

Or use a Kubernetes Job:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
  namespace: nvyt
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: ghcr.io/your-org/nvyt-web:latest
          command: ["npm", "run", "db:migrate"]
          envFrom:
            - secretRef:
                name: nvyt-secrets
      restartPolicy: Never
```

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

## Redis Setup

### Managed Redis

**Options:**
- [Upstash](https://upstash.com/) - Serverless Redis
- [Redis Cloud](https://redis.com/cloud/)
- [AWS ElastiCache](https://aws.amazon.com/elasticache/)

### Self-Hosted Redis

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: nvyt
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7-alpine
          ports:
            - containerPort: 6379
---
apiVersion: v1
kind: Service
metadata:
  name: redis-service
  namespace: nvyt
spec:
  selector:
    app: redis
  ports:
    - port: 6379
```

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret for signing JWTs (min 32 chars) |
| `APP_URL` | Public URL (https://nvyt.app) |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PAYMONGO_PUBLIC_KEY` | PayMongo public key | - |
| `PAYMONGO_SECRET_KEY` | PayMongo secret key | - |
| `RESEND_API_KEY` | Resend email API key | - |
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

### Kubernetes

```bash
# View rollout history
kubectl rollout history deployment/nvyt-web -n nvyt

# Rollback to previous version
kubectl rollout undo deployment/nvyt-web -n nvyt

# Rollback to specific revision
kubectl rollout undo deployment/nvyt-web --to-revision=2 -n nvyt
```

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

*Last updated: January 2026*
