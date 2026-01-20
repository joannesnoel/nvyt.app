# Custom Post-Payment Registration Forms for Ticket Events

## Overview
Add custom registration forms that collect attendee information AFTER payment is confirmed. Each ticket requires a separate form submission. Form fields are customizable by event organizers.

## Key Decisions
- **Field Types**: Extended (text, email, phone, textarea, select, radio, checkbox, date, number, url)
- **Flow**: Payment success redirects directly to registration page if event has registration fields
- **First Ticket**: "This ticket is mine" checkbox to pre-fill with logged-in user info
- **Single Ticket**: Auto-assumes it's for the logged-in user (pre-fills data)
- **Multi-Ticket**: Loop through each ticket with "Save" button to proceed to next

---

## 1. Database Schema

### New Table: `ticket_registration_fields`
**File:** `packages/db/src/schema/ticketRegistrationFields.ts`

```typescript
// Enum: registration_field_type
// Values: text, email, phone, textarea, select, radio, checkbox, date, number, url

// Table: ticket_registration_fields
- id: uuid (PK)
- eventId: uuid (FK → events, cascade delete)
- label: text (required)
- fieldType: registration_field_type enum (required)
- placeholder: text (optional)
- helpText: text (optional)
- isRequired: boolean (default true)
- options: jsonb (for select/radio: [{ value, label }])
- validation: jsonb ({ minLength, maxLength, pattern, min, max })
- sortOrder: integer (default 0)
- isActive: boolean (default true)
- createdAt, updatedAt: timestamp
```

### Modify `tickets` Table
**File:** `packages/db/src/schema/tickets.ts`

Add columns:
```typescript
- registrationData: jsonb (stores { fieldId: value } responses)
- registrationCompleted: boolean (default false)
- registrationCompletedAt: timestamp
```

### Migration File
**File:** `packages/db/drizzle/0024_*.sql`

---

## 2. Shared Zod Schemas

**File:** `packages/shared/src/schemas/ticketRegistration.ts`

```typescript
- registrationFieldType: z.enum([...10 types])
- fieldOptionSchema: { value, label }
- fieldValidationSchema: { minLength?, maxLength?, pattern?, min?, max? }
- createRegistrationFieldSchema
- updateRegistrationFieldSchema
- reorderRegistrationFieldsSchema
- submitTicketRegistrationSchema: { ticketId, responses: Record<fieldId, value> }
```

Update `packages/shared/src/schemas/index.ts` to export new schemas.

---

## 3. API Endpoints

### Organizer - Field Management
**Directory:** `apps/web/server/api/v1/events/[eventId]/registration-fields/`

| Method | File | Description |
|--------|------|-------------|
| GET | `index.get.ts` | List registration fields for event |
| POST | `index.post.ts` | Create new field |
| PATCH | `[fieldId].patch.ts` | Update field |
| DELETE | `[fieldId].delete.ts` | Delete field |
| PATCH | `reorder.patch.ts` | Reorder fields |

### Attendee - Registration
**Directory:** `apps/web/server/api/v1/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `orders/[orderNumber]/registration.get.ts` | Get registration status & fields for all tickets |
| POST | `tickets/[ticketId]/registration.post.ts` | Submit registration for one ticket |

---

## 4. Frontend Pages

### Organizer Dashboard
**File:** `apps/web/pages/dashboard/events/[id]/registration.vue`

- List of registration fields with drag-and-drop reordering
- Add/Edit field modal with type-specific options
- Toggle active/inactive per field
- Form preview

### Attendee Registration Flow
**File:** `apps/web/pages/orders/[orderNumber]/register.vue`

Features:
- Redirected here after payment success (if event has registration fields)
- Shows one ticket at a time: "Ticket 1 of 5 - VIP Pass"
- First ticket: "This ticket is mine" checkbox → pre-fills from user profile
- Single ticket purchase: Auto pre-fills with user data
- "Save" button proceeds to next ticket
- Final ticket: "Complete Registration" button
- After completion: Show success with download buttons

### Update Checkout Redirect
**File:** `apps/web/server/api/v1/orders/checkout.post.ts`

- Check if event has active registration fields
- If yes: Return `registrationRequired: true` in response
- Frontend redirects to `/orders/[orderNumber]/register` instead of `/orders/[orderNumber]/success`

### Update PayMongo Webhook
**File:** `apps/web/server/api/v1/webhooks/paymongo.post.ts`

- Include `registrationRequired` flag in success page redirect logic

---

## 5. Components

**Directory:** `apps/web/components/registration/`

| Component | Description |
|-----------|-------------|
| `FieldEditor.vue` | Field config form for organizers (label, type, options, validation) |
| `FieldRenderer.vue` | Renders field based on type for attendees |
| `RegistrationForm.vue` | Complete form for one ticket |

---

## 6. User Flow

```
Payment Success (PayMongo callback)
        │
        ▼
┌───────────────────────────────┐
│ Event has registration fields? │
└───────────────────────────────┘
        │                │
       Yes              No
        │                │
        ▼                ▼
/orders/.../register   /orders/.../success
        │
        ▼
┌─────────────────────────────────────┐
│  Ticket 1 of N - [Ticket Type]      │
│                                     │
│  □ This ticket is for me            │ ← First ticket only
│    (pre-fills from user profile)    │
│                                     │
│  [Dynamic registration fields]      │
│                                     │
│  [Save & Continue]                  │
└─────────────────────────────────────┘
        │
        ▼ (repeat for each ticket)
        │
        ▼
┌─────────────────────────────────────┐
│  Registration Complete!             │
│                                     │
│  [Download Tickets] [View Tickets]  │
└─────────────────────────────────────┘
```

---

## 7. Implementation Order

### Phase 1: Database
1. Create `ticketRegistrationFields.ts` schema
2. Add columns to `tickets.ts`
3. Generate and run migration
4. Update `packages/db/src/index.ts` exports

### Phase 2: Shared Schemas
1. Create `ticketRegistration.ts` Zod schemas
2. Export from `packages/shared/src/schemas/index.ts`

### Phase 3: Backend APIs
1. Registration field CRUD endpoints (follow eventRequirements pattern)
2. GET `/orders/[orderNumber]/registration` - status & fields
3. POST `/tickets/[ticketId]/registration` - submit with validation
4. Update checkout response to include `registrationRequired`

### Phase 4: Organizer Dashboard
1. Create `/dashboard/events/[id]/registration.vue`
2. Build `FieldEditor.vue` component
3. Add to event dashboard navigation

### Phase 5: Attendee Registration
1. Create `/orders/[orderNumber]/register.vue`
2. Build `FieldRenderer.vue` and `RegistrationForm.vue`
3. Implement wizard flow with "This ticket is mine" feature
4. Update checkout redirect logic

---

## 8. Files to Create/Modify

### New Files
```
packages/db/src/schema/ticketRegistrationFields.ts
packages/db/drizzle/0024_*.sql
packages/shared/src/schemas/ticketRegistration.ts

apps/web/server/api/v1/events/[eventId]/registration-fields/
  ├── index.get.ts
  ├── index.post.ts
  ├── [fieldId].patch.ts
  ├── [fieldId].delete.ts
  └── reorder.patch.ts

apps/web/server/api/v1/orders/[orderNumber]/registration.get.ts
apps/web/server/api/v1/tickets/[ticketId]/registration.post.ts

apps/web/pages/dashboard/events/[id]/registration.vue
apps/web/pages/orders/[orderNumber]/register.vue

apps/web/components/registration/
  ├── FieldEditor.vue
  ├── FieldRenderer.vue
  └── RegistrationForm.vue
```

### Modified Files
```
packages/db/src/schema/tickets.ts (add registrationData columns)
packages/db/src/index.ts (export new schema)
packages/shared/src/schemas/index.ts (export new schemas)
apps/web/server/api/v1/orders/checkout.post.ts (return registrationRequired flag)
apps/web/pages/orders/[orderNumber]/success.vue (handle registration redirect)
```

---

## Verification
1. Create a ticket event with registration fields in dashboard
2. Purchase tickets and verify redirect to registration page
3. Fill out registration for each ticket
4. Verify registration data saved to tickets
5. Download tickets and verify registration is complete
