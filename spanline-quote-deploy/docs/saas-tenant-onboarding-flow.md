# Tenant Onboarding Flow — Detailed Design

**Prepared for:** Tony, Director — Spanline  
**Prepared by:** Manus AI  
**Date:** 15 May 2026  
**Parent document:** SaaS Multi-Tenancy Architecture Plan  

---

## 1. Overview

Tenant onboarding is the process by which a new franchise or company signs up, configures their environment, invites their team, connects integrations, and begins using the platform. A well-designed onboarding flow directly impacts activation rates, time-to-value, and long-term retention. Research consistently shows that SaaS applications which achieve "first value" within the first session retain 2–3x more users than those requiring multi-day setup processes [1].

This document details every stage of the onboarding journey — from initial signup through to a fully operational tenant — including the technical implementation, data architecture, automation triggers, and edge cases that must be handled.

---

## 2. Onboarding Stages at a Glance

The onboarding flow is divided into seven distinct stages. Each stage has a clear completion criterion, and the system tracks progress to provide contextual guidance and nudges.

| Stage | Name | Completion Criterion | Blocking? | Estimated Time |
|---|---|---|---|---|
| 1 | **Account Creation** | Email verified, password set | Yes | 2 minutes |
| 2 | **Company Profile** | Business name, ABN, region saved | Yes | 3 minutes |
| 3 | **Subscription Selection** | Plan chosen (trial or paid) | Yes | 2 minutes |
| 4 | **Master Data Seeding** | Product catalogue loaded for region | Automatic | 5 seconds |
| 5 | **Integration Setup** | At least Xero connected (optional) | No | 5–10 minutes |
| 6 | **Team Invitations** | At least one additional user invited (optional) | No | 3 minutes |
| 7 | **First Value Action** | First quote created or first lead imported | No | 5–10 minutes |

Stages 1–4 are completed in a single guided wizard (approximately 7 minutes). Stages 5–7 are presented as a checklist dashboard that persists until all items are completed or dismissed.

---

## 3. Stage 1 — Account Creation

### 3.1 User Journey

The franchise owner (or their designated admin) arrives at the platform landing page and clicks "Start Free Trial" or "Get Started." They are presented with a registration form.

**Required fields:**
- Full name
- Email address (becomes the primary login)
- Password (minimum 10 characters, complexity enforced)
- Phone number (for account recovery and SMS verification)

**Optional fields:**
- How did you hear about us? (attribution tracking)
- Referral code (for partner/franchise referral tracking)

Upon submission, the system sends a verification email with a 6-digit code (valid for 15 minutes). The user enters the code on the next screen to confirm their email address.

### 3.2 Technical Implementation

```
POST /api/auth/register
├── Validate input (Zod schema)
├── Check email uniqueness across all tenants
├── Hash password (bcrypt, cost factor 12)
├── Create user record (status: "pending_verification")
├── Generate 6-digit verification code (stored in Redis, TTL 15 min)
├── Send verification email via Resend
└── Return session token (limited scope: can only verify email)

POST /api/auth/verify-email
├── Validate code against Redis store
├── Update user status to "active"
├── Create tenant record (status: "onboarding")
├── Create tenant_user record (role: "owner")
├── Upgrade session token to full scope
└── Redirect to onboarding wizard (Stage 2)
```

### 3.3 Database Records Created

| Table | Record | Notes |
|---|---|---|
| `users` | New user with `status: active` | Global user record |
| `tenants` | New tenant with `status: onboarding` | Placeholder until company profile is completed |
| `tenant_users` | Link record with `role: owner` | Owner has full admin privileges |

### 3.4 Edge Cases

| Scenario | Handling |
|---|---|
| Email already registered | Show "email already in use" with link to login page |
| Verification code expired | Allow resend (max 3 per hour, then lockout) |
| User abandons after email sent | Cleanup job removes unverified accounts after 72 hours |
| Multiple tenants per user | Supported — user can be invited to additional tenants later |
| Franchise referral code | Pre-fills region and may unlock specific pricing tier |

---

## 4. Stage 2 — Company Profile

### 4.1 User Journey

After email verification, the user enters a guided wizard. The first step collects company information that will be used throughout the platform — on quotes, invoices, contracts, and portal branding.

**Required fields:**
- Company/trading name (e.g., "Spanline Canberra")
- ABN (Australian Business Number) — validated format
- Primary region (dropdown: ACT, NSW, VIC, QLD, SA, WA, TAS, NT)
- Business address (street, suburb, state, postcode)
- Primary phone number

**Optional fields (can be completed later):**
- Company logo (upload, displayed on quotes and portals)
- Website URL
- Licence numbers (builder's licence, contractor licence)
- Default payment terms (e.g., "14 days from invoice")
- GST registered (yes/no — affects quote calculations)

### 4.2 Technical Implementation

```
PUT /api/onboarding/company-profile
├── Validate all fields (ABN format: 11 digits with checksum)
├── Update tenant record with company details
├── Generate tenant slug from company name (URL-safe, unique)
├── Provision subdomain: {slug}.spanquote.com.au
├── If logo uploaded: store in S3 at tenant-{id}/branding/logo.png
├── Update tenant status to "profile_complete"
└── Advance wizard to Stage 3
```

### 4.3 Subdomain Provisioning

Each tenant receives a subdomain automatically upon profile completion. This subdomain serves as the entry point for their client portal and trade portal.

| URL Pattern | Purpose |
|---|---|
| `{slug}.spanquote.com.au` | Tenant's main application URL |
| `{slug}.spanquote.com.au/client-portal` | Client-facing portal |
| `{slug}.spanquote.com.au/trade-portal` | Trade contractor portal |
| `admin.spanquote.com.au` | Platform administration (Spanline corporate) |

Custom domains (e.g., `quotes.spanlinecanberra.com.au`) are supported as a premium feature. The platform handles SSL certificate provisioning via Let's Encrypt and DNS verification.

### 4.4 Edge Cases

| Scenario | Handling |
|---|---|
| Duplicate company name | Append region to slug (e.g., `spanline-canberra-2`) |
| Invalid ABN | Real-time validation against ABR (Australian Business Register) API |
| Logo too large | Client-side resize to max 500x500px before upload |
| User wants to change company name later | Allowed via Settings; slug remains unchanged unless explicitly requested |

---

## 5. Stage 3 — Subscription Selection

### 5.1 User Journey

The user is presented with the available subscription tiers. All new tenants begin with a **14-day free trial** of the Professional tier (full features, no credit card required). This allows the tenant to evaluate the platform without commitment.

### 5.2 Subscription Tiers

| Feature | Starter ($199/mo) | Professional ($499/mo) | Enterprise ($999/mo) |
|---|---|---|---|
| **Users included** | 3 | 10 | Unlimited |
| **Quotes per month** | 50 | Unlimited | Unlimited |
| **CRM (leads, appointments)** | Basic | Full | Full + automation |
| **Construction management** | — | Full | Full + Gantt charts |
| **Client portal** | View-only | Full interactive | Full + white-label |
| **Trade portal** | — | Full | Full + custom branding |
| **Xero integration** | — | Full | Full + multi-entity |
| **Digital signatures (SignWell)** | 5/month | Unlimited | Unlimited |
| **SMS credits** | 50/month | 200/month | 500/month |
| **Storage** | 5 GB | 25 GB | 100 GB |
| **Support** | Email (48h) | Email + chat (24h) | Priority (4h) + phone |
| **Custom domain** | — | — | Included |

### 5.3 Technical Implementation

```
POST /api/onboarding/select-plan
├── Record selected plan on tenant record
├── If "Start Trial":
│   ├── Set tenant.plan = "professional_trial"
│   ├── Set tenant.trialEndsAt = now + 14 days
│   ├── Enable all Professional features
│   └── Schedule trial expiry reminder emails (day 7, day 12, day 13)
├── If "Subscribe Now":
│   ├── Create Stripe Customer for tenant
│   ├── Create Stripe Checkout Session (subscription mode)
│   ├── Redirect to Stripe Checkout
│   └── On success webhook: activate subscription, update tenant.plan
├── Update tenant status to "plan_selected"
└── Trigger master data seeding (Stage 4)
```

### 5.4 Trial-to-Paid Conversion Flow

The trial period is designed to demonstrate value before requiring payment. The conversion touchpoints are:

| Day | Action | Channel |
|---|---|---|
| 0 | Trial starts, welcome email with getting-started guide | Email |
| 3 | "How's it going?" check-in with tips based on usage | Email |
| 7 | Mid-trial reminder with feature highlights they haven't tried | Email + in-app banner |
| 10 | "4 days left" — show what they'll lose on downgrade | In-app notification |
| 12 | "2 days left" — prominent upgrade CTA in dashboard | Email + in-app modal |
| 13 | "Last day" — final reminder with one-click upgrade button | Email + SMS |
| 14 | Trial expires — downgrade to Starter (read-only for premium features) | Automatic |

After trial expiry, the tenant retains access to their data but premium features become read-only. They can upgrade at any time to restore full access.

### 5.5 Edge Cases

| Scenario | Handling |
|---|---|
| User skips plan selection | Default to Professional trial; plan selection card persists on dashboard |
| Payment fails during checkout | Retry with different card; tenant remains on trial until resolved |
| Tenant wants to downgrade mid-cycle | Prorated credit applied; features restricted at end of billing period |
| Annual billing discount | 20% discount for annual commitment (2 months free) |
| Franchise bulk deal | Custom pricing via platform admin; bypasses standard tiers |

---

## 6. Stage 4 — Master Data Seeding

### 6.1 Overview

This is the only fully automated stage. Upon plan selection, the system seeds the tenant's environment with the default product catalogue, pricing matrices, and configuration data appropriate for their region. This ensures the tenant can create their first quote immediately without manual data entry.

### 6.2 What Gets Seeded

| Data Category | Source | Tenant Customisation |
|---|---|---|
| **Product catalogue** | Platform master (Spanline product range) | Tenant can add/remove/modify products |
| **Pricing matrices** | Region-specific defaults | Tenant can override any price |
| **Colour groups** | Platform master | Tenant can add custom colours |
| **Spec mappings** | Platform master | Tenant can add custom specs |
| **Skylux/Eclipse pricing** | Region-specific | Tenant can override |
| **Deck products + framing** | Platform master | Tenant can customise |
| **Labour rates** | Region-specific defaults | Tenant must review and confirm |
| **Travel bands** | Region-specific (distance from branch) | Tenant sets their branch location |
| **Email templates** | Platform defaults (quote sent, contract, etc.) | Tenant can customise content and branding |
| **SMS templates** | Platform defaults | Tenant can customise |
| **Kanban templates** | Platform defaults (construction workflow) | Tenant can modify stages |
| **Project plan templates** | Platform defaults | Tenant can customise |

### 6.3 Technical Implementation

```
async function seedTenantData(tenantId: number, region: string) {
  // 1. Copy platform-level products → tenant products
  const platformProducts = await db.select().from(platformProducts)
    .where(eq(platformProducts.region, region));
  
  await db.insert(tenantProducts).values(
    platformProducts.map(p => ({ ...p, tenantId, id: undefined }))
  );

  // 2. Copy pricing matrices for region
  await seedPricingForRegion(tenantId, region);

  // 3. Copy email/SMS templates with tenant branding placeholders
  await seedTemplates(tenantId);

  // 4. Create default kanban board configuration
  await seedKanbanTemplates(tenantId);

  // 5. Create default project plan templates
  await seedProjectPlanTemplates(tenantId);

  // 6. Update tenant status
  await db.update(tenants)
    .set({ status: "seeded", seededAt: new Date() })
    .where(eq(tenants.id, tenantId));
}
```

### 6.4 Two-Tier Master Data Model

The platform maintains a clear separation between platform-level data and tenant-level data:

**Platform-level (read-only for tenants):**
- Base product definitions (name, description, category)
- Structural specifications (wind categories, engineering data)
- Compliance requirements (building codes, standards)

**Tenant-level (fully editable):**
- Pricing (cost prices, sell prices, margins)
- Labour rates and installation times
- Travel bands and delivery charges
- Custom products added by the tenant
- Template content (emails, SMS, documents)

When the platform owner (Spanline corporate) updates the master catalogue — for example, adding a new product or updating a specification — tenants receive a notification and can choose to accept the update or keep their current configuration.

### 6.5 Seeding Duration and Performance

The seeding operation copies approximately 2,000–5,000 rows across 12–15 tables. On PostgreSQL with batch inserts, this completes in under 5 seconds. The user sees a brief loading animation ("Setting up your workspace...") during this process.

---

## 7. Stage 5 — Integration Setup

### 7.1 User Journey

After seeding completes, the user arrives at their dashboard with an onboarding checklist. The integration setup step is presented as a card with the available integrations and their connection status.

Integrations are **not blocking** — the tenant can use the platform for quoting and CRM without any integrations connected. However, certain features are gated behind integration status:

| Integration | Features Unlocked | Priority |
|---|---|---|
| **Xero** | Invoicing, payment reconciliation, project costs, remittances | High — recommended during onboarding |
| **Stripe** (tenant's own account) | Client payment collection, deposit processing | Medium — needed before first invoice |
| **SignWell** | Digital contract signatures | Medium — needed before first contract |
| **SMS (Vocphone)** | SMS notifications to clients and trades | Low — can use email initially |

### 7.2 Xero Connection Flow

The Xero integration is the most complex and most important integration for a construction business. The connection flow uses OAuth 2.0:

**Step 1:** Tenant clicks "Connect Xero" → redirected to Xero's OAuth consent screen.

**Step 2:** Tenant authorises the application to access their Xero organisation.

**Step 3:** Callback receives the access token and refresh token. The system stores these encrypted in `tenant_integrations`.

**Step 4:** The system performs an initial sync:
- Pulls the Xero organisation name and details
- Pulls the chart of accounts (for cost code mapping)
- Pulls existing contacts (for matching with CRM clients)
- Pulls existing projects (for linking to construction jobs)

**Step 5:** The tenant is presented with a mapping screen:
- Map Spanline income accounts to Xero revenue accounts
- Map cost categories to Xero expense accounts
- Confirm or create a default tax rate

**Step 6:** Connection is marked as active. Ongoing sync runs automatically.

### 7.3 Xero Multi-Organisation Support

Some franchise owners manage multiple Xero organisations (e.g., separate entities for residential and commercial work). The Enterprise tier supports connecting multiple Xero organisations to a single tenant, with rules for which entity handles which job type.

### 7.4 Stripe Connect Onboarding

For tenants who want to collect payments from their clients directly (deposits, progress payments), the platform uses Stripe Connect:

**Step 1:** Tenant clicks "Set Up Payments" → redirected to Stripe Connect onboarding.

**Step 2:** Stripe collects the tenant's business details, bank account, and identity verification (KYC).

**Step 3:** Once approved, the tenant's Stripe account is linked to the platform.

**Step 4:** The platform can now create payment links, checkout sessions, and invoices on behalf of the tenant.

The platform takes no application fee by default (this is configurable by the platform owner for future monetisation).

### 7.5 Integration Credentials Storage

All integration credentials are stored in a dedicated `tenant_integrations` table with encryption at rest:

```sql
CREATE TABLE tenant_integrations (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  provider VARCHAR(50) NOT NULL,  -- 'xero', 'stripe', 'signwell', 'vocphone'
  status VARCHAR(20) NOT NULL DEFAULT 'disconnected',
  credentials JSONB NOT NULL,  -- encrypted at rest (AES-256-GCM)
  metadata JSONB,  -- org name, last sync time, etc.
  connected_at TIMESTAMP,
  expires_at TIMESTAMP,  -- for OAuth tokens
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, provider)
);
```

### 7.6 Edge Cases

| Scenario | Handling |
|---|---|
| Xero token expires | Background job refreshes tokens 1 hour before expiry |
| Xero organisation disconnected by user in Xero | Webhook notification → mark as disconnected, notify tenant admin |
| Stripe Connect onboarding abandoned | Show "Resume Setup" button; Stripe retains partial application |
| Tenant changes Xero organisation | Full re-sync required; warn about data mapping implications |
| Integration rate limits hit | Exponential backoff with tenant-specific rate tracking |

---

## 8. Stage 6 — Team Invitations

### 8.1 User Journey

The tenant owner invites their team members. Each invitation specifies a role that determines what the user can access within the tenant.

### 8.2 Role Definitions

| Role | Access Level | Typical User |
|---|---|---|
| **Owner** | Full access + billing + tenant settings | Franchise owner/director |
| **Admin** | Full access except billing and tenant deletion | Office manager |
| **Design Adviser** | Quotes, CRM leads, appointments, client communication | Sales staff |
| **Construction Manager** | Construction jobs, scheduling, trade management, financials | Site supervisor |
| **Office User** | CRM, documents, inbox, basic reporting | Administrative staff |
| **Read-Only** | View all data, no create/edit/delete | Accountant, auditor |

### 8.3 Invitation Flow

**Step 1:** Tenant owner enters the invitee's email address and selects a role.

**Step 2:** System sends an invitation email with a unique link (valid for 7 days).

**Step 3:** Invitee clicks the link and is taken to a registration page (if new to the platform) or a confirmation page (if they already have an account on another tenant).

**Step 4:** Upon acceptance, a `tenant_user` record is created linking the user to the tenant with the specified role.

**Step 5:** The invitee is redirected to the tenant's dashboard with a brief role-specific tutorial overlay.

### 8.4 Technical Implementation

```
POST /api/tenants/:tenantId/invitations
├── Validate inviter has Owner or Admin role
├── Check invitee email isn't already a member of this tenant
├── Generate invitation token (UUID v4, stored with TTL 7 days)
├── Create invitation record (tenant_id, email, role, token, status: pending)
├── Send invitation email via Resend (branded with tenant logo/name)
└── Return invitation ID

GET /api/invitations/:token/accept
├── Validate token exists and hasn't expired
├── If user exists (by email):
│   ├── Add tenant_user record for existing user
│   └── Redirect to tenant dashboard
├── If user doesn't exist:
│   ├── Show registration form (pre-filled email)
│   ├── On submit: create user + tenant_user
│   └── Redirect to tenant dashboard
└── Mark invitation as "accepted"
```

### 8.5 Multi-Tenant User Experience

A single user can belong to multiple tenants (e.g., a regional manager overseeing several franchise locations). When such a user logs in, they see a tenant selector:

```
┌─────────────────────────────────────┐
│  Select Workspace                    │
│                                      │
│  ┌──────────────────────────────┐   │
│  │ 🏢 Spanline Canberra         │   │
│  │    Owner · Last active 2h ago │   │
│  └──────────────────────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │ 🏢 Spanline Sydney           │   │
│  │    Admin · Last active 3d ago │   │
│  └──────────────────────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │ 🏢 Spanline Melbourne        │   │
│  │    Read-Only · Never accessed │   │
│  └──────────────────────────────┘   │
│                                      │
└─────────────────────────────────────┘
```

After selecting a tenant, the user's session is scoped to that tenant for all subsequent actions. They can switch tenants via a dropdown in the application header without re-authenticating.

### 8.6 Edge Cases

| Scenario | Handling |
|---|---|
| Invitation to email that already has an account | Link existing user to new tenant (no new registration) |
| Invitation expired | Show "invitation expired" page with option to request a new one |
| Owner tries to invite more users than plan allows | Show upgrade prompt with user count comparison |
| User removed from tenant | Soft-delete tenant_user record; user retains platform account |
| Last owner tries to leave | Block action; must transfer ownership first |

---

## 9. Stage 7 — First Value Action

### 9.1 Philosophy

The onboarding is not truly complete until the tenant has experienced the core value proposition of the platform. For Spanline, this means either creating their first quote or importing their first batch of client data. The system actively guides the user toward this moment.

### 9.2 Guided First Quote

If the tenant chooses to create their first quote, the system provides a guided experience:

**Step 1:** Pre-filled client details (using the tenant's own company as a test client).

**Step 2:** Product selection with the seeded catalogue — highlighted with tooltips explaining each field.

**Step 3:** Automatic calculation demonstration — showing how pricing, margins, and adjustments work.

**Step 4:** Preview of the generated quote PDF — demonstrating the professional output with the tenant's branding.

**Step 5:** Celebration moment — "Your first quote is ready!" with options to send it (as a test) or start a real quote.

### 9.3 Data Import Alternative

For tenants migrating from another system (spreadsheets, Buildxact, Tradify, etc.), the platform offers a CSV import wizard:

| Import Type | Fields | Validation |
|---|---|---|
| **Clients** | Name, email, phone, address | Email format, phone format, duplicate detection |
| **Leads** | Client details + source, status, notes | Status mapping to platform values |
| **Quotes** | Client, items, amounts, status | Amount validation, product matching |
| **Jobs** | Client, quote reference, status, dates | Date format, status mapping |
| **Installers** | Name, trade type, contact details, ABN | ABN validation, trade type matching |

The import wizard provides:
- Template CSV download (pre-formatted with correct headers)
- Column mapping interface (drag-and-drop or dropdown)
- Preview of first 10 rows before committing
- Error report with row-by-row issues
- Partial import support (skip errored rows, import valid ones)

### 9.4 Onboarding Completion

Once the tenant completes their first value action, the onboarding checklist is marked as complete. The system:

1. Updates `tenant.status` from `onboarding` to `active`.
2. Sends a "You're all set!" email with links to help documentation.
3. Removes the onboarding wizard overlay from the dashboard.
4. Begins tracking engagement metrics for the tenant.

The checklist remains accessible from Settings for any incomplete optional items (integrations, team invitations).

---

## 10. Onboarding Analytics and Health Metrics

### 10.1 Metrics Tracked

The platform tracks onboarding progress to identify drop-off points and optimise the flow:

| Metric | Definition | Target |
|---|---|---|
| **Registration-to-verification rate** | % of signups that verify email | > 85% |
| **Wizard completion rate** | % that complete stages 1–4 | > 90% |
| **Time to first quote** | Minutes from signup to first quote created | < 30 minutes |
| **Integration connection rate** | % that connect Xero within 7 days | > 60% |
| **Team invitation rate** | % that invite at least one team member | > 50% |
| **Trial-to-paid conversion** | % of trials that convert to paid subscription | > 25% |
| **Day-7 retention** | % of tenants active on day 7 | > 70% |
| **Day-30 retention** | % of tenants active on day 30 | > 55% |

### 10.2 Automated Interventions

Based on onboarding progress, the system triggers automated interventions:

| Trigger | Action | Channel |
|---|---|---|
| No activity for 48 hours after signup | "Need help getting started?" email with video walkthrough | Email |
| Wizard abandoned at Stage 2 | "Complete your profile in 2 minutes" reminder | Email |
| No quote created after 5 days | "Create your first quote" tutorial email with screenshots | Email |
| Xero not connected after 7 days | "Connect Xero to unlock invoicing" with step-by-step guide | Email + in-app |
| No team members invited after 7 days | "Invite your team" prompt with role explanation | In-app notification |
| High engagement but no subscription | Personal outreach from success team (Enterprise prospects) | Email from human |

---

## 11. Platform Admin View of Onboarding

The platform owner (Spanline corporate) has a dedicated admin dashboard showing onboarding health across all tenants:

### 11.1 Tenant Onboarding Pipeline

```
┌─────────────────────────────────────────────────────────────────────┐
│  Tenant Onboarding Pipeline                                          │
│                                                                       │
│  Registered ──→ Profile ──→ Plan ──→ Seeded ──→ Integrated ──→ Active│
│     12            10         9         9           6            4     │
│                                                                       │
│  Drop-off:  2 (17%)    1 (10%)   0 (0%)     3 (33%)       2 (33%)   │
└─────────────────────────────────────────────────────────────────────┘
```

### 11.2 Individual Tenant Health Card

For each tenant, the platform admin can see:

- Onboarding stage and completion percentage
- Days since signup
- Features activated vs. available
- Integration connection status
- Team size vs. plan limit
- Last activity timestamp
- Revenue (current MRR from this tenant)

---

## 12. Technical Architecture — Onboarding Service

### 12.1 Database Schema (Onboarding-Specific Tables)

```sql
-- Tracks onboarding progress per tenant
CREATE TABLE tenant_onboarding (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id) UNIQUE,
  current_stage VARCHAR(30) NOT NULL DEFAULT 'account_created',
  stages_completed JSONB NOT NULL DEFAULT '[]',
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  metadata JSONB  -- stores choices made, time per stage, etc.
);

-- Invitation management
CREATE TABLE tenant_invitations (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  email VARCHAR(320) NOT NULL,
  role VARCHAR(30) NOT NULL,
  token VARCHAR(128) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, accepted, expired, revoked
  invited_by INT NOT NULL REFERENCES users(id),
  accepted_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP
);

-- Onboarding events for analytics
CREATE TABLE onboarding_events (
  id SERIAL PRIMARY KEY,
  tenant_id INT NOT NULL REFERENCES tenants(id),
  user_id INT REFERENCES users(id),
  event_type VARCHAR(50) NOT NULL,  -- 'stage_completed', 'integration_connected', etc.
  event_data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 12.2 API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/register` | POST | Create account (Stage 1) |
| `/api/auth/verify-email` | POST | Verify email code (Stage 1) |
| `/api/onboarding/company-profile` | PUT | Save company details (Stage 2) |
| `/api/onboarding/select-plan` | POST | Choose subscription tier (Stage 3) |
| `/api/onboarding/status` | GET | Get current onboarding progress |
| `/api/onboarding/skip-stage` | POST | Mark optional stage as skipped |
| `/api/tenants/:id/invitations` | POST | Send team invitation (Stage 6) |
| `/api/invitations/:token/accept` | POST | Accept invitation |
| `/api/onboarding/import` | POST | Upload CSV for data import (Stage 7) |
| `/api/onboarding/import/preview` | POST | Preview import results |
| `/api/onboarding/import/commit` | POST | Execute the import |

### 12.3 Background Jobs

| Job | Trigger | Action |
|---|---|---|
| `cleanup-unverified` | Every 6 hours | Delete accounts unverified for > 72 hours |
| `expire-invitations` | Every hour | Mark expired invitations as `status: expired` |
| `trial-reminders` | Daily at 9am AEST | Send trial expiry reminders (day 7, 12, 13) |
| `onboarding-nudges` | Daily at 10am AEST | Send re-engagement emails for stalled tenants |
| `trial-expiry` | Every hour | Downgrade expired trials to Starter tier |
| `seed-data-updates` | On platform master data change | Notify tenants of available catalogue updates |

---

## 13. Security Considerations

### 13.1 Tenant Isolation During Onboarding

Even during the onboarding process, strict tenant isolation is enforced:

- The verification code is scoped to the specific user and cannot be reused.
- The invitation token is cryptographically random (128 hex characters) and single-use.
- Subdomain provisioning validates uniqueness before DNS record creation.
- Integration OAuth callbacks include a `state` parameter with the tenant ID to prevent CSRF.
- File uploads during onboarding (logo) are immediately stored in the tenant's S3 prefix.

### 13.2 Rate Limiting

| Action | Limit | Window |
|---|---|---|
| Registration attempts (per IP) | 5 | 1 hour |
| Verification code requests (per email) | 3 | 1 hour |
| Invitation sends (per tenant) | 20 | 1 hour |
| Import uploads (per tenant) | 5 | 1 hour |
| Failed login attempts (per email) | 5 | 15 minutes (then lockout) |

### 13.3 Data Handling

- Passwords are hashed with bcrypt (cost factor 12) and never stored in plaintext.
- Integration credentials are encrypted at rest with AES-256-GCM using a per-tenant encryption key.
- ABN and business details are validated but not stored in logs.
- Onboarding analytics events do not contain PII — only tenant IDs and event types.

---

## 14. Future Enhancements

Once the core onboarding flow is operational, the following enhancements can be added incrementally:

| Enhancement | Value | Effort |
|---|---|---|
| **Video walkthrough per stage** | Reduces support tickets, improves completion rate | 1 week (content creation) |
| **In-app live chat during onboarding** | Real-time support for stuck users | 2 days (Intercom/Crisp integration) |
| **Automated Xero data pull** | Pre-populate CRM with existing Xero contacts on connection | 3 days |
| **Template marketplace** | Tenants share custom email/quote templates | 2 weeks |
| **Franchise onboarding wizard** | Streamlined flow for Spanline-specific franchises with pre-filled data | 1 week |
| **Mobile onboarding** | Responsive wizard optimised for phone/tablet | 3 days |
| **SSO (SAML/OIDC)** | Enterprise tenants use their own identity provider | 2 weeks |
| **Bulk tenant provisioning** | Platform admin creates multiple tenants at once (franchise rollout) | 1 week |

---

## 15. Summary

The tenant onboarding flow is designed to achieve **time-to-first-value under 30 minutes** while maintaining security, data isolation, and a professional experience. The seven-stage process balances mandatory setup (account, profile, plan) with optional-but-encouraged steps (integrations, team, first action). Automated nudges and analytics ensure no tenant falls through the cracks, while the platform admin dashboard provides visibility into the health of the entire tenant pipeline.

The onboarding experience is itself a product differentiator. In the construction software market, competitors like Buildxact, Tradify, and Knowify typically require 1–3 days of manual setup and data entry before a new customer can generate their first quote. By pre-seeding region-specific product data and providing a guided wizard, the Spanline platform can deliver value in a single session — a significant competitive advantage for franchise acquisition.

---

## References

[1] BrotCode, "SaaS Onboarding Architecture: Building Self-Service Tenant Provisioning," March 2026. https://brotcode.com/blog/engineering/saas-onboarding-self-service-tenant-provisioning/
