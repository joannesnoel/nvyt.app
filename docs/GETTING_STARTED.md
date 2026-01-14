# Getting Started with nvyt.app

> Quick start guide for developers

---

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 22.x or later
- **pnpm** 10.x or later
- **Docker** and Docker Compose
- **Git**

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/nvyt.app.git
cd nvyt.app
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Start Development Infrastructure

```bash
docker compose -f docker/docker-compose.dev.yml up -d
```

This starts:
- **PostgreSQL** on port 5432 - Database
- **Mailhog** on port 8025 - Email testing UI (SMTP on 1025)

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Database (default works with docker-compose.dev.yml)
DATABASE_URL=postgresql://nvyt:nvyt@localhost:5432/nvyt

# Auth (change in production!)
JWT_SECRET=your-super-secret-jwt-key

# App
APP_URL=http://localhost:3000

# Pusher (for real-time updates - optional in dev)
NUXT_PUBLIC_PUSHER_KEY=your-pusher-key
NUXT_PUBLIC_PUSHER_CLUSTER=ap1
PUSHER_APP_ID=your-app-id
PUSHER_SECRET=your-pusher-secret
```

### 5. Run Database Migrations

```bash
# Generate migration files from schema
pnpm db:generate

# Apply migrations
pnpm db:migrate
```

### 6. Start Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project Commands

### Development

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm preview` | Preview production build |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript checks |

### Database

| Command | Description |
|---------|-------------|
| `pnpm db:generate` | Generate migrations from schema |
| `pnpm db:migrate` | Run pending migrations |
| `pnpm db:studio` | Open Drizzle Studio (DB GUI) |

### Docker

| Command | Description |
|---------|-------------|
| `docker compose -f docker/docker-compose.dev.yml up -d` | Start dev infrastructure |
| `docker compose -f docker/docker-compose.dev.yml down` | Stop dev infrastructure |
| `docker compose -f docker/docker-compose.yml up --build` | Run full stack |

---

## Project Structure Overview

```
nvyt.app/
├── apps/web/           # Main Nuxt application
│   ├── pages/          # Routes (file-based)
│   ├── components/     # Vue components
│   ├── server/api/     # API endpoints
│   └── server/utils/   # Server utilities
├── packages/db/        # Database schema
├── packages/shared/    # Shared types & validation
├── docker/             # Docker configs
├── k8s/                # Kubernetes manifests
└── docs/               # Documentation
```

---

## Key Files

### Configuration

| File | Purpose |
|------|---------|
| `apps/web/nuxt.config.ts` | Nuxt configuration |
| `packages/db/drizzle.config.ts` | Database config |
| `turbo.json` | Monorepo task config |
| `.env` | Environment variables |

### Database Schema

| File | Purpose |
|------|---------|
| `packages/db/src/schema/users.ts` | User & auth tables |
| `packages/db/src/schema/events.ts` | Events table |
| `packages/db/src/schema/eventCollaborators.ts` | Team members & permissions |
| `packages/db/src/schema/tickets.ts` | Ticketing tables |
| `packages/db/src/schema/attendees.ts` | RSVP table |
| `packages/db/src/schema/contributions.ts` | Contribution tables |

### API Routes

| File | Endpoint |
|------|----------|
| `server/api/v1/auth/register.post.ts` | POST /api/v1/auth/register |
| `server/api/v1/auth/login.post.ts` | POST /api/v1/auth/login |
| `server/api/v1/events/index.get.ts` | GET /api/v1/events |
| `server/api/v1/events/index.post.ts` | POST /api/v1/events |
| `server/api/v1/events/[slug].get.ts` | GET /api/v1/events/:slug |

---

## Development Workflow

### Adding a New Page

1. Create a file in `apps/web/pages/`:

```vue
<!-- apps/web/pages/about.vue -->
<template>
  <div>
    <h1>About Us</h1>
  </div>
</template>
```

2. Page is automatically available at `/about`

### Adding a New API Route

1. Create a file in `apps/web/server/api/v1/`:

```typescript
// apps/web/server/api/v1/hello.get.ts
export default defineEventHandler(() => {
  return { message: 'Hello, World!' }
})
```

2. API is available at `/api/v1/hello`

### Adding a Database Table

1. Create/edit schema in `packages/db/src/schema/`:

```typescript
// packages/db/src/schema/categories.ts
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'

export const categories = pgTable('categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
})
```

2. Export from `packages/db/src/schema/index.ts`

3. Generate and run migration:

```bash
pnpm db:generate
pnpm db:migrate
```

### Adding Validation Schema

1. Add to `packages/shared/src/schemas/`:

```typescript
// packages/shared/src/schemas/category.ts
import { z } from 'zod'

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
})

export type CreateCategoryInput = z.infer<typeof createCategorySchema>
```

2. Export from `packages/shared/src/schemas/index.ts`

3. Use in API route:

```typescript
import { createCategorySchema } from '@nvyt/shared'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const result = createCategorySchema.safeParse(body)
  // ...
})
```

---

## Testing API Endpoints

### Using cURL

```bash
# Register
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"Password123","confirmPassword":"Password123"}'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Password123"}'

# Get Events
curl http://localhost:3000/api/v1/events
```

### Using HTTPie

```bash
# Register
http POST localhost:3000/api/v1/auth/register \
  name="Test User" \
  email="test@example.com" \
  password="Password123" \
  confirmPassword="Password123"

# Login
http POST localhost:3000/api/v1/auth/login \
  email="test@example.com" \
  password="Password123"
```

---

## Testing Tools

### Email Testing with Mailhog

All emails sent in development go to Mailhog instead of real recipients.

1. Open [http://localhost:8025](http://localhost:8025)
2. View all sent emails in the web UI
3. No configuration needed - uses SMTP on port 1025 by default

### PayMongo Webhook Testing with Cloudflare Tunnel

To test PayMongo webhooks locally, use Cloudflare Tunnel to expose your local server:

1. **Start a quick tunnel:**
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

2. **Copy the public URL** from the output (e.g., `https://xxx.trycloudflare.com`)

3. **Register webhook in PayMongo Dashboard:**
   - Go to Developers → Webhooks
   - Add URL: `https://<your-tunnel-url>/api/v1/webhooks/paymongo`
   - Select events: `checkout_session.payment.paid`, `payment.paid`, `payment.failed`
   - Copy the webhook secret to `PAYMONGO_WEBHOOK_SECRET` in `.env`

For persistent tunnels, configure a named tunnel in your Cloudflare dashboard.

---

## Common Issues

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Database Connection Failed

1. Check if PostgreSQL is running:
```bash
docker compose -f docker/docker-compose.dev.yml ps
```

2. Verify DATABASE_URL in `.env`

3. Test connection:
```bash
psql postgresql://nvyt:nvyt@localhost:5432/nvyt
```

### Module Not Found

```bash
# Clear node_modules and reinstall
rm -rf node_modules apps/*/node_modules packages/*/node_modules
pnpm install
```

### TypeScript Errors After Schema Change

```bash
# Regenerate Nuxt types
pnpm --filter @nvyt/web nuxt prepare
```

---

## IDE Setup

### VS Code

Recommended extensions:

```json
{
  "recommendations": [
    "vue.volar",
    "dbaeumer.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "prisma.prisma"
  ]
}
```

### Settings

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

---

## Next Steps

1. **Explore the codebase** - Start with `apps/web/pages/index.vue`
2. **Read the features doc** - `docs/FEATURES.md`
3. **Check the roadmap** - `docs/ROADMAP.md`
4. **Review the architecture** - `docs/ARCHITECTURE.md`

---

## Getting Help

- Check existing documentation in `/docs`
- Review code comments
- Ask in team chat

---

*Last updated: January 10, 2026*
