# nvyt.app Features

> Comprehensive feature documentation for the nvyt.app platform

---

## Table of Contents

1. [User Management](#user-management)
2. [Event Management](#event-management)
3. [RSVP & Attendance](#rsvp--attendance)
4. [Ticketing System](#ticketing-system)
5. [Contribution Lists](#contribution-lists)
6. [Check-in System](#check-in-system)
7. [Payments](#payments)
8. [Notifications](#notifications)
9. [Analytics](#analytics)
10. [API Reference](#api-reference)

---

## User Management

### Registration

Users can create accounts using:

- **Email/Password** - Traditional registration with email verification
- **Google OAuth** - One-click sign up with Google account
- **Facebook OAuth** - Social login with Facebook

**Registration Fields:**
| Field | Required | Validation |
|-------|----------|------------|
| Name | Yes | 2-100 characters |
| Email | Yes | Valid email format |
| Password | Yes | Min 8 chars, uppercase, lowercase, number |

### Authentication

**Web (Session-based):**
- HTTP-only secure cookies
- 7-day session expiry
- Automatic refresh

**Mobile (JWT-based):**
- Bearer token authentication
- Access token (7 days)
- Refresh token support

### User Profiles

| Field | Description |
|-------|-------------|
| Avatar | Profile picture (upload or Gravatar) |
| Bio | Short description |
| Location | City/Region |
| Social Links | Facebook, Instagram, Twitter |

### Account Settings

- Change password
- Update email (with verification)
- Delete account
- Export data (GDPR compliance)

---

## Event Management

### Event Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Public** | Visible to everyone, open registration | Conferences, meetups |
| **Private** | Invite-only, hidden from search | Birthdays, corporate events |

### Event Properties

**Basic Information:**
```
- Title (required)
- Description (Markdown supported)
- Cover Image
- Category
```

**Date & Time:**
```
- Start Date/Time (required)
- End Date/Time (optional)
- Timezone (default: Asia/Manila)
- Recurring events (future)
```

**Location:**
```
- Physical: Address, City, Map coordinates
- Online: Meeting URL, Password
- Hybrid: Both physical and online
```

**Capacity & Access:**
```
- Maximum Attendees (optional, unlimited if not set)
- Requires Approval (organizer must approve RSVPs)
- Age Restriction (future)
```

**Features Toggle:**
```
- Ticketing Enabled (paid events)
- Contributions Enabled (potluck-style)
```

### Event Status

| Status | Description |
|--------|-------------|
| `draft` | Not visible, still editing |
| `published` | Live and accepting registrations |
| `cancelled` | Event cancelled, attendees notified |
| `completed` | Event has ended |

### Event URLs

- **Public URL:** `https://nvyt.app/events/{slug}`
- **Private URL:** `https://nvyt.app/events/{slug}?token={invite_token}`
- **Manage URL:** `https://nvyt.app/dashboard/events/{id}`

---

## RSVP & Attendance

### RSVP Flow (Free Events)

```
User visits event page
        ↓
    [RSVP Button]
        ↓
┌─────────────────────────────┐
│ Requires Approval?          │
│   Yes → Status: pending     │
│   No  → Status: confirmed   │
└─────────────────────────────┘
        ↓
    QR Code Generated
        ↓
    Confirmation Email
```

### RSVP Status

| Status | Description |
|--------|-------------|
| `pending` | Awaiting organizer approval |
| `confirmed` | Approved to attend |
| `declined` | Organizer declined |
| `waitlisted` | Event full, on waitlist |
| `cancelled` | User cancelled RSVP |

### Waitlist Logic

When event reaches capacity:
1. New RSVPs go to waitlist
2. If someone cancels, first waitlisted user is promoted
3. Promoted user receives notification

### Guest Management (Organizer)

- View all RSVPs
- Approve/decline pending requests
- Add guests manually
- Send messages to attendees
- Export attendee list (CSV)

---

## Ticketing System

### Ticket Types

Organizers can create multiple ticket tiers:

```yaml
Example Event Tickets:
  - name: "Early Bird"
    price: 500
    quantity: 50
    salesEnd: "2026-02-01"
    
  - name: "General Admission"
    price: 750
    quantity: 200
    
  - name: "VIP"
    price: 1500
    quantity: 20
    description: "Includes meet & greet"
```

### Ticket Properties

| Property | Description |
|----------|-------------|
| Name | Ticket tier name |
| Description | What's included |
| Price | Amount in PHP |
| Quantity | Available tickets (null = unlimited) |
| Sales Start | When tickets go on sale |
| Sales End | When sales close |
| Min Per Order | Minimum tickets per purchase |
| Max Per Order | Maximum tickets per purchase |

### Purchase Flow

```
Select Tickets → Enter Attendee Info → Payment → Confirmation
      ↓                   ↓                ↓           ↓
   Quantity          Name/Email        PayMongo    Email + QR
   Selection         per ticket        Checkout    PDF Ticket
```

### Ticket Features

- **QR Code** - Unique per ticket for check-in
- **Ticket Number** - Human-readable reference (e.g., `NVYT-ABC123`)
- **Transferable** - Change attendee name/email
- **Refundable** - Based on organizer policy

---

## Contribution Lists

### Overview

Perfect for potlucks, parties, and community events where attendees bring items.

### Item Categories

| Category | Examples |
|----------|----------|
| Food | Main dishes, appetizers, desserts |
| Drinks | Beverages, ice |
| Supplies | Plates, utensils, napkins |
| Equipment | Speakers, projector, chairs |
| Other | Decorations, games |

### Contribution Item Properties

```yaml
- name: "Lechon"
  category: "food"
  quantityNeeded: 1
  description: "For 50 people"

- name: "Plastic Cups"
  category: "supplies"
  quantityNeeded: 100
```

### Claiming Flow

```
View Contribution List
        ↓
    Select Item
        ↓
   Enter Quantity
   (e.g., "I'll bring 20 cups")
        ↓
   Add Note (optional)
   ("Red cups from SM")
        ↓
      Claimed!
```

### Visibility Options

- **Public** - Anyone can see who's bringing what
- **Private** - Only organizer sees claims
- **Anonymous** - Items visible, claimers hidden

---

## Check-in System

### QR Code Check-in

Each ticket/RSVP generates a unique QR code containing:
```
{
  "type": "ticket" | "rsvp",
  "id": "uuid",
  "eventId": "uuid",
  "code": "NVYT-ABC123"
}
```

### Check-in Methods

| Method | Description |
|--------|-------------|
| **QR Scan** | Scan attendee's QR code |
| **Manual Search** | Search by name/email/ticket number |
| **Bulk Import** | Upload checked-in list (offline events) |

### Check-in States

```
Not Checked In → Checked In → (Cannot undo via app)
                     ↓
              Timestamp recorded
              Check-in count updated
```

### Check-in Dashboard

Real-time statistics:
- Total expected attendees
- Checked-in count
- Check-in rate (%)
- Recent check-ins feed

---

## Payments

### PayMongo Integration

Supported payment methods:

| Method | Type | Fees |
|--------|------|------|
| GCash | E-wallet | 2.5% |
| Maya | E-wallet | 2.5% |
| Credit Card | Visa/MC | 3.5% + PHP 15 |
| Debit Card | Visa/MC | 3.5% + PHP 15 |
| GrabPay | E-wallet | 2.5% |

### Payment Flow

```
1. User selects tickets
2. Create PayMongo Checkout Session
3. Redirect to PayMongo hosted page
4. User completes payment
5. Webhook confirms payment
6. Tickets generated & emailed
```

### Order Properties

| Field | Description |
|-------|-------------|
| Order Number | Unique reference (e.g., `ORD-20260108-XXXX`) |
| Total Amount | Sum of ticket prices |
| Payment Status | pending, paid, failed, refunded |
| Payment Method | gcash, maya, card, etc. |

### Refunds

Refund policies set by organizer:
- **Full refund** - Until X days before event
- **Partial refund** - Percentage based on timing
- **No refunds** - Non-refundable tickets

---

## Notifications

### Email Notifications

| Trigger | Recipient | Template |
|---------|-----------|----------|
| Registration | User | Welcome email |
| RSVP Confirmed | Attendee | Confirmation + QR |
| RSVP Pending | Attendee | Awaiting approval |
| RSVP Approved | Attendee | Approved + QR |
| Ticket Purchase | Buyer | Receipt + Tickets |
| Event Reminder | Attendees | 24h before event |
| Event Updated | Attendees | Change notification |
| Event Cancelled | Attendees | Cancellation notice |

### Push Notifications (Mobile App)

- Event reminders
- RSVP status updates
- New events from followed organizers
- Check-in confirmation

### In-App Notifications

- Activity feed
- Unread badge count
- Mark as read

---

## Analytics

### Event Analytics (Organizer)

**Overview Metrics:**
- Total views
- Unique visitors
- Conversion rate (views → RSVPs/tickets)
- Revenue (paid events)

**Attendance Metrics:**
- RSVPs by status
- Check-in rate
- No-show rate
- Waitlist size

**Traffic Sources:**
- Direct links
- Social media
- Search
- Referrals

### Dashboard Stats

```
┌─────────────────────────────────────────┐
│  Total Events: 12    Total Revenue: ₱45,000  │
│  Total Attendees: 856   Avg Check-in: 78%    │
└─────────────────────────────────────────┘
```

### Export Options

- CSV export for all data
- PDF reports
- API access (future)

---

## API Reference

### Base URL

```
Production: https://nvyt.app/api/v1
Development: http://localhost:3000/api/v1
```

### Authentication

**Session (Web):**
```
Cookie: session=<token>
```

**JWT (Mobile):**
```
Authorization: Bearer <access_token>
```

### Endpoints Overview

#### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Sign in |
| POST | `/auth/logout` | Sign out |
| GET | `/auth/me` | Get current user |

#### Events
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/events` | List public events |
| POST | `/events` | Create event |
| GET | `/events/:slug` | Get event details |
| PATCH | `/events/:id` | Update event |
| DELETE | `/events/:id` | Delete event |

#### Tickets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/events/:id/tickets` | List ticket types |
| POST | `/events/:id/tickets` | Create ticket type |
| POST | `/events/:id/purchase` | Purchase tickets |
| GET | `/orders/:id` | Get order details |

#### Attendees
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/events/:id/rsvp` | RSVP to event |
| DELETE | `/events/:id/rsvp` | Cancel RSVP |
| GET | `/events/:id/attendees` | List attendees (organizer) |
| POST | `/events/:id/check-in` | Check in attendee |

#### Contributions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/events/:id/contributions` | List contribution items |
| POST | `/events/:id/contributions` | Add contribution item |
| POST | `/contributions/:id/claim` | Claim item |
| DELETE | `/contributions/:id/claim` | Unclaim item |

### Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100
  }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": { ... }
  }
}
```

---

## Feature Flags

Features can be toggled per environment:

| Flag | Description | Default |
|------|-------------|---------|
| `ENABLE_OAUTH` | Social login | true |
| `ENABLE_PAYMENTS` | PayMongo integration | true |
| `ENABLE_CONTRIBUTIONS` | Contribution lists | true |
| `ENABLE_WAITLIST` | Waitlist feature | true |
| `MAINTENANCE_MODE` | Show maintenance page | false |

---

*Last updated: January 2026*
