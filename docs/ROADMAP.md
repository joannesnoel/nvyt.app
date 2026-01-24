# nvyt.app Roadmap

> Event & Ticketing Platform for the Philippines

## Vision

nvyt.app aims to be the go-to platform for event organizers in the Philippines - from intimate gatherings to large conferences. We focus on simplicity, mobile-first design, and local payment methods.

---

## Phase 1: Foundation ✅

**Status: COMPLETE**

### Core Infrastructure
- [x] Monorepo setup (pnpm workspaces)
- [x] Nuxt 3 application with SSR
- [x] PostgreSQL database with Drizzle ORM
- [x] Docker + Kubernetes deployment (k3s with local registry)
- [x] Versioned API structure (`/api/v1`)

### Authentication
- [x] Email/password registration & login
- [x] JWT tokens (mobile-ready)
- [x] Session management (web)
- [x] SSR-compatible auth (useRequestFetch for cookie forwarding)
- [x] Password reset flow (forgot password with email token)
- [x] Email verification (registration sends link, verify page, resend flow)
- [ ] OAuth - Google (schema exists, not implemented)
- [ ] OAuth - Facebook (schema exists, not implemented)

### Event Management (Basic)
- [x] Create events (public/private)
- [x] Event listing with filters
- [x] Event detail page (by slug)
- [x] Edit/update events
- [x] Cancel events (with status management)
- [x] Location autocomplete (Google Maps API)
- [x] Event cover image upload (Garage S3 storage)
- [x] YouTube promo video support (alternative to cover image)
- [x] YouTube thumbnail fallback (auto-extract from video URL)
- [x] Media type toggle (image or video)
- [x] Public events require media (cover image or promo video)
- [ ] Rich text description (Markdown/WYSIWYG)

### User Dashboard
- [x] Dashboard layout
- [x] My events list
- [x] My registrations/tickets list
- [ ] Event analytics (basic)
- [ ] Profile settings page

---

## Phase 2: RSVP & Attendees ✅

**Status: COMPLETE**

### RSVP System
- [x] RSVP for free events
- [x] Attendee limits (waitlist when full)
- [x] Approval workflow for private events
- [x] Cancel RSVP
- [x] QR code generation for attendees

### Invitations
- [x] Generate invite links (private events)
- [x] Invite endpoint exists (`/api/v1/events/[eventId]/invite`)
- [x] Email invitations (RSVP invitations with custom messages)
- [x] Track invitation status (eventInvitations table)
- [ ] Bulk invite via CSV

### Check-in
- [x] QR code generation for attendees
- [x] Web-based QR scanner (html5-qrcode, camera-based)
- [x] Manual check-in (USB scanner / text input)
- [x] Check-in statistics (total, checked-in, rate)
- [x] Real-time check-in status updates (Pusher)

### Notifications (Email Infrastructure)
- [x] Email service with dual providers (SMTP/Mailtrap + Resend)
- [x] 11 email templates created
- [x] Account setup emails sending
- [ ] RSVP confirmation emails (templates exist, not triggered)
- [ ] Event reminders (templates exist, not triggered)
- [ ] Event updates/changes notifications
- [ ] Cancellation notices

---

## Phase 3: Ticketing & Payments ✅

**Status: COMPLETE (99%)**

### Ticket Types
- [x] Multiple ticket tiers (VIP, General, Early Bird)
- [x] Quantity limits per tier
- [x] Sale period (start/end dates)
- [x] Per-order limits (min/max)
- [x] Ticket status management (active/inactive)
- [x] Ticket type reordering
- [x] Price tier types (time-based, quantity-based, hybrid)

### Payment Integrations
- [x] PayMongo checkout session creation
- [x] PayMongo payment methods:
  - [x] GCash
  - [x] Maya (PayMaya)
  - [x] Credit/Debit cards
  - [x] GrabPay
- [x] PayMongo webhook handling (payment confirmation)
- [x] PayPal Integration:
  - [x] PayPal checkout flow
  - [x] PayPal webhooks
  - [x] PayPal retry payment
- [x] Payment confirmation emails (paid & free orders)
- [x] Refund processing via PayMongo API
- [x] Transaction fee tracking (processing fees, admin fees)

### Order Management
- [x] Order history
- [x] Guest checkout (no account required)
- [x] Order access via URL (no login needed)
- [x] Account setup from guest order (token-based)
- [x] Order success page with real-time ticket status
- [x] Ticket PDF with QR code (downloadable)
- [x] Orders management page for organizers
- [x] Post-payment registration forms:
  - [x] Custom registration fields (10 field types)
  - [x] Organizer dashboard for field management
  - [x] Attendee registration flow (per-ticket)
  - [x] "This ticket is mine" pre-fill feature
- [ ] Resend tickets functionality

### Organizer Payouts
- [x] Revenue dashboard (basic - in Orders page)
- [ ] Payout requests
- [ ] Transaction history
- [ ] Tax documents (BIR 2307)

---

## Phase 4: Contribution Lists ✅

**Status: COMPLETE**

### Contribution Items
- [x] Database schema for contribution lists
- [x] Quantity needed per item
- [x] Categories defined (food, drinks, supplies, equipment, other)
- [x] CRUD API for contribution items
- [x] UI for managing contribution items (organizer dashboard)
- [x] Reorder items
- [ ] Custom items (attendee suggestions)

### Claiming System
- [x] Database schema for claims
- [x] Claim items API
- [x] Partial claims (bring X of Y)
- [x] Claim notes
- [x] Unclaim items

### Visibility
- [x] Public contribution list display (on event page)
- [x] Who's bringing what view
- [x] Progress tracking (X/Y items claimed)
- [x] Only confirmed attendees can claim items

---

## Phase 5: Mobile Apps 📱

**Status: NOT STARTED**

### Flutter App Development
- [ ] Project setup
- [ ] Authentication flow (JWT ready on backend)
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

## Phase 6: Advanced Features ⚡

**Status: SIGNIFICANTLY COMPLETE (80%)**

### Event Content Management
- [x] Event FAQs (full CRUD + public display with accordion)
- [x] Event Announcements (news & updates with publish dates)
- [x] Event Requirements (terms & agreements for ticket purchases)
- [x] Requirements satisfaction tracking (checkbox acceptance)

### Event Customization & Theming
- [x] Theme mode (light/dark/system preference)
- [x] Color templates (15+ color options)
- [x] Font family customization:
  - [x] Title font (h1)
  - [x] Section heading font (h2-h6)
  - [x] Body text font
- [x] Event preview page for organizers

### Business Verification (for Paid Events)
- [x] Verification submission flow
- [x] Document uploads (business registration, license)
- [x] Verification status tracking (pending, approved, rejected)
- [x] Block publishing until verified (for paid ticket events)
- [x] Admin review interface (backend ready)

### Event Discovery
- [x] PSGC geographic data (regions, provinces, cities, barangays)
- [ ] Location-based search (infrastructure ready)
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
- [x] Basic attendee stats in API (total, checked-in, by status)
- [x] Revenue stats in orders page
- [x] Google Analytics 4 integration:
  - [x] Checkout events
  - [x] Purchase events
- [ ] Analytics dashboard UI
- [ ] Attendance trends
- [ ] Revenue reports
- [ ] Conversion funnels
- [x] Export to CSV/Excel (attendee export)

### Organizer Tools
- [ ] Custom branding
- [ ] Custom domains
- [ ] Embeddable widgets
- [ ] API access for integrations

### Enterprise Features
- [x] Team management (Event Collaborators)
- [x] Invitation flow (invite by email, accept on login)
- [x] Granular role-based permissions:
  - [x] canEdit
  - [x] canPublish
  - [x] canManageTickets
  - [x] canCheckIn
  - [x] canManageAttendees
  - [x] canViewAnalytics
- [x] Permission checks in API endpoints
- [ ] Audit logs
- [ ] SSO integration
- [ ] White-label option

---

## Phase 7: Growth & Scale 🚀

**Status: INFRASTRUCTURE STARTED**

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
- [x] Local Docker registry with PVC (survives restarts)
- [x] Real-time updates (Pusher WebSocket)
- [ ] CDN for assets
- [ ] Database read replicas

---

## Priority Backlog (Recommended Next Steps)

### High Priority
1. **Resend Tickets Functionality** - User convenience
2. **Profile Settings Page** - User management
3. **RSVP/Event Confirmation Emails** - Trigger existing templates

### Medium Priority (User Experience)
5. **OAuth Integration** - Reduce signup friction (Google/Facebook)
6. **Admin Dashboard** - Review business verifications, manage users
7. **Event Reminders** - Automated emails before event date
8. **Location-based Event Search** - Use PSGC data for discovery

### Lower Priority (Feature Enhancement)
9. **Analytics Dashboard UI** - Visualize organizer insights
10. **Bulk CSV Invitations** - Large event management
11. **Rich Text Event Descriptions** - Better formatting
12. **Custom Contribution Items** - Let attendees suggest items

---

## Technical Debt & Maintenance

- [ ] Unit test coverage > 80%
- [ ] E2E tests for critical flows
- [ ] Performance monitoring (Core Web Vitals)
- [ ] Security audits (quarterly)
- [ ] Dependency updates (monthly)
- [x] SSR hydration fix (auth state)

---

## Release Schedule

| Phase | Target | Status | Completion |
|-------|--------|--------|------------|
| Phase 1 | Q1 2026 | ✅ Complete | 98% |
| Phase 2 | Q1 2026 | ✅ Complete | 98% |
| Phase 3 | Q2 2026 | ✅ Complete | 99% |
| Phase 4 | Q2 2026 | ✅ Complete | 95% |
| Phase 5 | Q3 2026 | ⏳ Planned | 0% |
| Phase 6 | Q4 2026 | 🔄 Significant | 80% |
| Phase 7 | 2027 | 🔄 Started | 15% |

---

*Last updated: January 24, 2026*
