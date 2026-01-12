# nvyt.app Architecture

> Technical architecture documentation

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                            CLIENTS                                   │
├─────────────────┬─────────────────┬─────────────────────────────────┤
│   Web Browser   │   iOS App       │   Android App                   │
│   (Nuxt SSR)    │   (Flutter)     │   (Flutter)                     │
└────────┬────────┴────────┬────────┴────────┬────────────────────────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     KUBERNETES CLUSTER                               │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌──────────────────────────────────────────┐   │
│  │   Ingress   │───▶│            Nuxt 3 Application             │   │
│  │  (nginx)    │    │  ┌────────────────┬───────────────────┐  │   │
│  └─────────────┘    │  │  Vue 3 SSR     │   Nitro Server    │  │   │
│                     │  │  (Frontend)     │   (API + SSR)     │  │   │
│                     │  └────────────────┴───────────────────┘  │   │
│                     └──────────────┬───────────────────────────┘   │
│                                    │                                │
│  ┌─────────────────────────────────┼───────────────────────────┐   │
│  │                                 ▼                            │   │
│  │  ┌─────────────┐    ┌─────────────────┐                      │   │
│  │  │ PostgreSQL  │    │  Object Storage │                      │   │
│  │  │  (Primary)  │    │     (S3/MinIO)  │                      │   │
│  │  └─────────────┘    └─────────────────┘                      │   │
│  │         DATA LAYER                                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  PayMongo   │    │   Resend    │    │   Pusher    │
│  (Payments) │    │   (Email)   │    │ (Real-time) │
└─────────────┘    └─────────────┘    └─────────────┘
```

---

## Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| **Nuxt 3** | Vue.js meta-framework with SSR |
| **Vue 3** | Reactive UI framework |
| **Tailwind CSS** | Utility-first CSS |
| **Nuxt UI** | Pre-built component library |
| **Pinia** | State management |
| **VueUse** | Composition utilities |

### Backend

| Technology | Purpose |
|------------|---------|
| **Nitro** | Nuxt's server engine |
| **H3** | HTTP framework (built into Nitro) |
| **Drizzle ORM** | Type-safe database queries |
| **Zod** | Schema validation |
| **Jose** | JWT handling |

### Database

| Technology | Purpose |
|------------|---------|
| **PostgreSQL 16** | Primary database |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| **Kubernetes** | Container orchestration |
| **Docker** | Containerization |
| **nginx Ingress** | Load balancing, TLS |
| **cert-manager** | TLS certificate automation |

### External Services

| Service | Purpose |
|---------|---------|
| **PayMongo** | Payment processing |
| **Resend** | Transactional emails |
| **S3/MinIO** | File storage |
| **Pusher** | Real-time WebSocket updates |

---

## Project Structure

```
nvyt.app/
├── apps/
│   └── web/                    # Nuxt 3 application
│       ├── assets/             # Static assets (CSS, images)
│       ├── components/         # Vue components
│       │   ├── event/          # Event-related components
│       │   ├── ticket/         # Ticket components
│       │   └── ui/             # Shared UI components
│       ├── composables/        # Vue composables
│       ├── layouts/            # Page layouts
│       ├── middleware/         # Route middleware
│       ├── pages/              # File-based routing
│       │   ├── index.vue       # Home page
│       │   ├── events/         # Event pages
│       │   ├── dashboard/      # Organizer dashboard
│       │   └── auth/           # Auth pages
│       ├── plugins/            # Nuxt plugins
│       ├── public/             # Public static files
│       ├── server/             # Server-side code
│       │   ├── api/            # API routes
│       │   │   └── v1/         # Versioned API
│       │   ├── middleware/     # Server middleware
│       │   └── utils/          # Server utilities
│       ├── stores/             # Pinia stores
│       ├── types/              # TypeScript types
│       ├── nuxt.config.ts      # Nuxt configuration
│       └── package.json
│
├── packages/
│   ├── db/                     # Database package
│   │   ├── src/
│   │   │   ├── schema/         # Drizzle schema definitions
│   │   │   └── index.ts        # Database connection
│   │   ├── drizzle/            # Generated migrations
│   │   └── drizzle.config.ts   # Drizzle Kit config
│   │
│   └── shared/                 # Shared code
│       └── src/
│           ├── schemas/        # Zod validation schemas
│           └── index.ts
│
├── docker/
│   ├── Dockerfile              # Production image
│   ├── docker-compose.yml      # Full stack
│   └── docker-compose.dev.yml  # Development (DBs only)
│
├── k8s/                        # Kubernetes manifests
│   ├── namespace.yaml
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   └── hpa.yaml
│
├── docs/                       # Documentation
│
├── package.json                # Root package.json
├── pnpm-workspace.yaml         # Workspace config
├── turbo.json                  # Turborepo config
└── .env.example                # Environment template
```

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│    users    │       │   events    │       │ ticket_types│
├─────────────┤       ├─────────────┤       ├─────────────┤
│ id (PK)     │──┐    │ id (PK)     │──┐    │ id (PK)     │
│ email       │  │    │ organizer_id│◄─┘    │ event_id    │◄─┐
│ name        │  │    │ title       │       │ name        │  │
│ password    │  │    │ slug        │       │ price       │  │
│ ...         │  │    │ visibility  │       │ quantity    │  │
└─────────────┘  │    │ status      │       │ ...         │  │
                 │    │ ...         │       └─────────────┘  │
                 │    └─────────────┘                        │
                 │           │                               │
                 │           │                               │
┌─────────────┐  │    ┌──────┴──────┐       ┌─────────────┐ │
│  sessions   │  │    │             │       │   tickets   │ │
├─────────────┤  │    ▼             ▼       ├─────────────┤ │
│ id (PK)     │  │ ┌─────────┐ ┌─────────┐  │ id (PK)     │ │
│ user_id     │◄─┤ │attendees│ │ orders  │  │ ticket_type │◄┘
│ token       │  │ ├─────────┤ ├─────────┤  │ order_id    │◄─┐
│ expires_at  │  │ │ id (PK) │ │ id (PK) │  │ user_id     │  │
│ ...         │  │ │ event_id│ │ event_id│  │ qr_code     │  │
└─────────────┘  │ │ user_id │ │ user_id │  │ status      │  │
                 │ │ status  │ │ total   │  │ ...         │  │
                 │ │ ...     │ │ status  │  └─────────────┘  │
                 │ └─────────┘ │ ...     │                   │
                 │      ▲      └────┬────┘                   │
                 │      │           │                        │
                 └──────┴───────────┴────────────────────────┘

┌───────────────────┐       ┌───────────────────┐
│contribution_items │       │contribution_claims│
├───────────────────┤       ├───────────────────┤
│ id (PK)           │◄──────│ id (PK)           │
│ event_id          │       │ item_id           │
│ name              │       │ user_id           │
│ category          │       │ quantity          │
│ quantity_needed   │       │ notes             │
│ ...               │       │ ...               │
└───────────────────┘       └───────────────────┘

┌─────────────────────┐
│ event_collaborators │
├─────────────────────┤
│ id (PK)             │
│ event_id            │◄── references events
│ user_id             │◄── references users
│ can_edit            │
│ can_publish         │
│ can_manage_tickets  │
│ can_check_in        │
│ can_manage_attendees│
│ can_view_analytics  │
│ invited_by          │◄── references users
│ invited_at          │
│ accepted_at         │
│ ...                 │
└─────────────────────┘
```

### Key Tables

| Table | Description |
|-------|-------------|
| `users` | User accounts |
| `sessions` | Active sessions (web) |
| `refresh_tokens` | JWT refresh tokens (mobile) |
| `account_setup_tokens` | Guest checkout account setup |
| `events` | Event listings |
| `event_collaborators` | Team members with permissions |
| `attendees` | RSVPs for free events |
| `ticket_types` | Ticket tiers for paid events |
| `tickets` | Individual purchased tickets |
| `orders` | Payment transactions |
| `contribution_items` | Items needed for events |
| `contribution_claims` | Who's bringing what |

---

## API Design

### RESTful Conventions

```
GET    /api/v1/events          # List events
POST   /api/v1/events          # Create event
GET    /api/v1/events/:slug    # Get event
PATCH  /api/v1/events/:id      # Update event
DELETE /api/v1/events/:id      # Delete event
```

### Versioning

API is versioned via URL path:
- `/api/v1/` - Current stable version
- `/api/v2/` - Future breaking changes

### Response Structure

```typescript
// Success
{
  success: true,
  data: T,
  meta?: {
    page: number,
    limit: number,
    total: number,
    totalPages: number
  }
}

// Error
{
  success: false,
  error: {
    code: string,
    message: string,
    details?: unknown
  }
}
```

### Authentication Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      WEB (Session-based)                     │
├─────────────────────────────────────────────────────────────┤
│  1. POST /api/v1/auth/login { email, password }             │
│  2. Server creates session, sets HTTP-only cookie           │
│  3. Subsequent requests include cookie automatically        │
│  4. POST /api/v1/auth/logout clears session                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     MOBILE (JWT-based)                       │
├─────────────────────────────────────────────────────────────┤
│  1. POST /api/v1/auth/login { email, password }             │
│  2. Server returns { accessToken, refreshToken }            │
│  3. Store tokens securely on device                         │
│  4. Include header: Authorization: Bearer <accessToken>     │
│  5. POST /api/v1/auth/refresh when token expires            │
└─────────────────────────────────────────────────────────────┘
```

---

## Deployment Architecture

### Kubernetes Resources

```yaml
Namespace: nvyt
├── Deployment: nvyt-web (2-10 replicas)
│   └── Container: web
│       ├── Image: <registry>/nvyt-web:latest
│       │   # Options: ghcr.io/org/nvyt-web:latest (GHCR)
│       │   #          192.168.0.20:30500/nvyt-web:latest (local registry)
│       ├── Port: 3000
│       ├── Resources: 256Mi-512Mi RAM, 100m-500m CPU
│       ├── Probes: /api/health
│       └── Env: ConfigMap + Secret
│
├── Service: nvyt-web-service (ClusterIP)
│   └── Port: 80 → 3000
│
├── Ingress: nvyt-ingress
│   ├── Host: nvyt.app
│   ├── TLS: cert-manager (Let's Encrypt)
│   └── Backend: nvyt-web-service:80
│
├── HorizontalPodAutoscaler: nvyt-web-hpa
│   ├── Min: 2, Max: 10
│   └── Target: 70% CPU, 80% Memory
│
├── ConfigMap: nvyt-config
│   └── Non-sensitive configuration
│
└── Secret: nvyt-secrets
    └── Sensitive credentials
```

### High Availability

```
                    ┌─────────────┐
                    │   Ingress   │
                    │   (nginx)   │
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
      ┌──────────┐   ┌──────────┐   ┌──────────┐
      │  Pod 1   │   │  Pod 2   │   │  Pod N   │
      │  (web)   │   │  (web)   │   │  (web)   │
      └────┬─────┘   └────┬─────┘   └────┬─────┘
           │              │              │
           └──────────────┼──────────────┘
                          │
                          │
                          ▼
                    ┌──────────┐
                    │ Postgres │
                    │ (Primary)│
                    └──────────┘
```

---

## Security

### Authentication

- Passwords hashed with SHA-256 (upgrade to Argon2 recommended)
- JWT signed with HS256 algorithm
- HTTP-only cookies for web sessions
- CSRF protection via SameSite cookies

### Authorization

- Role-based: User, Organizer, Admin
- Resource ownership checks
- Event-level permissions

### Data Protection

- TLS 1.3 for all traffic
- Database encryption at rest
- Secrets management via K8s secrets
- PII handling compliance

### API Security

- Rate limiting (planned)
- Input validation (Zod)
- SQL injection prevention (Drizzle ORM)
- XSS prevention (Vue auto-escaping)

---

## Performance

### Caching Strategy

| Layer | Cache | TTL |
|-------|-------|-----|
| CDN | Static assets | 1 year |
| PostgreSQL | Session data | 7 days |
| Browser | API responses | Varies |

### Database Optimization

- Indexes on frequently queried columns
- Connection pooling
- Query optimization with Drizzle

### Frontend Optimization

- SSR for initial page load
- Code splitting (automatic with Nuxt)
- Image optimization
- Lazy loading

---

## Monitoring

### Health Checks

```
GET /api/health
{
  "status": "healthy",
  "timestamp": "2026-01-08T12:00:00Z",
  "version": "1.0.0"
}
```

### Metrics (Prometheus)

- HTTP request duration
- Request count by status code
- Active connections
- Database query latency

### Logging

- Structured JSON logs
- Log levels: debug, info, warn, error
- Request/response logging
- Error tracking

### Alerting

- High error rate (> 1%)
- Latency spike (p99 > 2s)
- Pod restarts
- Database connection failures

---

## Future Considerations

### Scaling

- Database read replicas
- CDN for media files
- Edge functions for API

### Features

- WebSocket for real-time updates
- Background job processing (BullMQ)
- Full-text search (PostgreSQL or Meilisearch)
- Analytics pipeline

---

*Last updated: January 10, 2026*
