# nvyt.app

> Event & Ticketing Platform for the Philippines

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## Overview

**nvyt™** (pronounced "invite") is a modern event management platform that enables organizers to create events, sell tickets, and manage contributions. Built with Vue.js/Nuxt 3 and designed for the Philippine market with PayMongo integration.

### Key Features

- **Event Management** - Create public or private events
- **Ticketing** - Sell tickets with multiple tiers
- **Payments** - GCash, Maya, cards via PayMongo
- **Contribution Lists** - Perfect for potlucks and gatherings
- **QR Check-in** - Fast attendee verification
- **Mobile Ready** - API-first design for native apps

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Nuxt 3, Vue 3, Tailwind CSS, Nuxt UI |
| Backend | Nitro (H3), Drizzle ORM |
| Database | PostgreSQL |
| Payments | PayMongo |
| Infrastructure | Docker, Kubernetes |

---

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development databases
docker compose -f docker/docker-compose.dev.yml up -d

# Configure environment
cp .env.example .env

# Run database migrations
pnpm db:generate && pnpm db:migrate

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
nvyt.app/
├── apps/web/           # Nuxt 3 application
├── packages/db/        # Database schema (Drizzle)
├── packages/shared/    # Shared validation schemas
├── docker/             # Docker configurations
├── k8s/                # Kubernetes manifests
└── docs/               # Documentation
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/GETTING_STARTED.md) | Development setup guide |
| [Features](docs/FEATURES.md) | Feature documentation |
| [Architecture](docs/ARCHITECTURE.md) | Technical architecture |
| [Roadmap](docs/ROADMAP.md) | Development roadmap |
| [Deployment](docs/DEPLOYMENT.md) | Production deployment |

---

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm db:generate` | Generate database migrations |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:studio` | Open Drizzle Studio |

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://nvyt:nvyt@localhost:5432/nvyt

# Auth
JWT_SECRET=your-secret-key

# PayMongo
PAYMONGO_PUBLIC_KEY=pk_test_xxx
PAYMONGO_SECRET_KEY=sk_test_xxx

# Email
RESEND_API_KEY=re_xxx
```

---

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Create account
- `POST /api/v1/auth/login` - Sign in
- `POST /api/v1/auth/logout` - Sign out
- `GET /api/v1/auth/me` - Get current user

### Events
- `GET /api/v1/events` - List events
- `POST /api/v1/events` - Create event
- `GET /api/v1/events/:slug` - Get event details

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Support

- Documentation: `/docs`
- Issues: GitHub Issues

---

*Built with care in the Philippines*
