# nvyt.app Roadmap

> Event & Ticketing Platform for the Philippines

## Vision

nvyt.app aims to be the go-to platform for event organizers in the Philippines - from intimate gatherings to large conferences. We focus on simplicity, mobile-first design, and local payment methods.

---

## Phase 1: Foundation (Current)

**Target: MVP Launch**

### Core Infrastructure
- [x] Monorepo setup (pnpm + Turborepo)
- [x] Nuxt 3 application with SSR
- [x] PostgreSQL database with Drizzle ORM
- [x] Docker + Kubernetes deployment configs
- [x] Versioned API structure (`/api/v1`)

### Authentication
- [x] Email/password registration & login
- [x] JWT tokens (mobile-ready)
- [x] Session management (web)
- [ ] Email verification
- [ ] Password reset flow
- [ ] OAuth (Google, Facebook)

### Event Management (Basic)
- [x] Create events (public/private)
- [x] Event listing with filters
- [x] Event detail page
- [x] Edit/update events
- [x] Cancel events (with typed confirmation)
- [ ] Event cover image upload
- [ ] Rich text description (Markdown/WYSIWYG)

### User Dashboard
- [x] Dashboard layout
- [x] My events list
- [ ] Event analytics (basic)
- [ ] Profile settings

---

## Phase 2: RSVP & Attendees

**Target: Free Events Launch**

### RSVP System
- [x] RSVP for free events
- [x] Attendee limits (waitlist when full)
- [x] Approval workflow for private events
- [x] Cancel RSVP (with typed confirmation)

### Invitations
- [x] Generate invite links (private events)
- [ ] Email invitations (endpoint exists, sending not implemented)
- [ ] Bulk invite via CSV
- [ ] Track invitation status

### Check-in
- [x] QR code generation for attendees
- [ ] Web-based QR scanner (camera-based)
- [x] Manual check-in (USB scanner / text input)
- [x] Check-in statistics

### Notifications
- [ ] Email confirmations
- [ ] Event reminders (24h, 1h before)
- [ ] Event updates/changes
- [ ] Cancellation notices

---

## Phase 3: Ticketing & Payments

**Target: Paid Events Launch**

### Ticket Types
- [x] Multiple ticket tiers (VIP, General, Early Bird)
- [x] Quantity limits per tier
- [x] Sale period (start/end dates)
- [x] Per-order limits (min/max)

### PayMongo Integration
- [x] Checkout session creation
- [x] Payment methods:
  - [x] GCash
  - [x] Maya (PayMaya)
  - [x] Credit/Debit cards
  - [x] GrabPay
- [x] Webhook handling
- [ ] Payment confirmation emails
- [ ] Refund processing

### Order Management
- [x] Order history
- [ ] Receipt generation (PDF)
- [ ] Ticket PDF with QR code
- [ ] Resend tickets

### Organizer Payouts
- [ ] Revenue dashboard
- [ ] Payout requests
- [ ] Transaction history
- [ ] Tax documents (BIR 2307)

---

## Phase 4: Contribution Lists

**Target: Social Events Enhancement**

### Contribution Items
- [x] Database schema for contribution lists
- [ ] CRUD API for contribution items
- [ ] Categories (food, drinks, supplies, equipment)
- [x] Quantity needed per item (schema)
- [ ] Custom items (attendee suggestions)

### Claiming System
- [x] Database schema for claims
- [ ] Claim items API
- [ ] Partial claims (bring 2 of 5)
- [ ] Claim notes ("I'll bring homemade lumpia")
- [ ] Unclaim items

### Visibility
- [x] Public contribution list display (UI exists)
- [ ] Who's bringing what
- [x] Progress tracking (X/Y items claimed - UI exists)

---

## Phase 5: Mobile Apps

**Target: Native Experience**

### Flutter App Development
- [ ] Project setup
- [ ] Authentication flow
- [ ] Event browsing
- [ ] Event details
- [ ] RSVP & ticketing
- [ ] QR ticket display
- [ ] Push notifications
- [ ] Offline ticket support

### Organizer Features (Mobile)
- [ ] Create/edit events
- [ ] QR scanner for check-in
- [ ] Real-time attendance
- [ ] Quick stats

---

## Phase 6: Advanced Features

**Target: Platform Maturity**

### Event Discovery
- [ ] Location-based search
- [ ] Category filtering
- [ ] Featured events
- [ ] Recommendations
- [ ] Calendar integration (Google, Apple)

### Social Features
- [ ] User profiles (public)
- [ ] Follow organizers
- [ ] Event sharing
- [ ] Comments/discussions

### Analytics & Insights
- [ ] Attendance trends
- [ ] Revenue reports
- [ ] Conversion funnels
- [ ] Export to CSV/Excel

### Organizer Tools
- [ ] Custom branding
- [ ] Custom domains
- [ ] Embeddable widgets
- [ ] API access for integrations

### Enterprise Features
- [ ] Team management
- [ ] Role-based permissions
- [ ] Audit logs
- [ ] SSO integration
- [ ] White-label option

---

## Phase 7: Growth & Scale

**Target: Market Leadership**

### Platform Expansion
- [ ] Multi-language support (Filipino, Cebuano)
- [ ] Multi-currency
- [ ] Regional expansion (SEA)

### Integrations
- [ ] Zapier/Make integration
- [ ] Slack notifications
- [ ] Discord bot
- [ ] Eventbrite import

### Performance & Scale
- [ ] CDN for assets
- [ ] Database read replicas
- [ ] Redis caching optimization
- [ ] Real-time updates (WebSocket)

---

## Success Metrics

### Phase 1-2 (Foundation)
- [ ] 100 events created
- [ ] 1,000 registered users
- [ ] 99.9% uptime

### Phase 3-4 (Monetization)
- [ ] PHP 100,000 in ticket sales
- [ ] 50 paid events
- [ ] < 2% payment failure rate

### Phase 5-6 (Growth)
- [ ] 10,000 MAU
- [ ] 500 monthly events
- [ ] 4.5+ app store rating

### Phase 7 (Scale)
- [ ] PHP 10M annual GMV
- [ ] 100,000 MAU
- [ ] Regional presence

---

## Technical Debt & Maintenance

Ongoing tasks to maintain code quality:

- [ ] Unit test coverage > 80%
- [ ] E2E tests for critical flows
- [ ] Performance monitoring (Core Web Vitals)
- [ ] Security audits (quarterly)
- [ ] Dependency updates (monthly)
- [ ] Documentation updates

---

## Release Schedule

| Phase | Target Date | Status |
|-------|-------------|--------|
| Phase 1 | Q1 2026 | Nearly Complete |
| Phase 2 | Q1 2026 | Nearly Complete |
| Phase 3 | Q2 2026 | In Progress |
| Phase 4 | Q2 2026 | In Progress (Schema Only) |
| Phase 5 | Q3 2026 | Planned |
| Phase 6 | Q4 2026 | Planned |
| Phase 7 | 2027 | Planned |

---

*Last updated: January 8, 2026*
