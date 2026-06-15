# Spanline Quote — SaaS Multi-Tenancy Architecture Plan

**Prepared for:** Tony, Director — Spanline  
**Prepared by:** Manus AI  
**Date:** 15 May 2026  
**Status:** Strategic Planning Document  

---

## 1. Executive Summary

This document provides a comprehensive architecture plan for converting the Spanline Costing & Quoting System from a single-tenant application into a multi-tenant SaaS platform. The system currently serves a single Spanline franchise operation with 106 database tables, 38 server-side router files, approximately 28,000 lines of server code, and 72,000 lines of client code. It integrates with Xero, Stripe, SignWell, Vocphone, and S3 storage, and provides separate portals for internal staff, trade contractors, and end-clients.

Two approaches are evaluated in detail: **retrofitting the existing application** with a shared-database row-level tenancy model, and **building a new platform from scratch** with tenancy designed in from the ground up. The document concludes with a clear recommendation and a phased implementation roadmap.

---

## 2. Current Architecture Inventory

### 2.1 System Overview

The application runs as a single Node.js process (React 19 + Express 4 + tRPC 11) deployed on Manus WebDev hosting (Cloud Run). It uses a shared MySQL/TiDB database accessed via Drizzle ORM.

| Dimension | Current State |
|---|---|
| **Database tables** | 106 tables in a single MySQL schema |
| **Server router files** | 38 tRPC routers with ~500 procedures |
| **Server code** | ~28,200 lines of TypeScript |
| **Client code** | ~72,000 lines of TypeScript/React |
| **Schema definition** | 2,224 lines in `drizzle/schema.ts` |
| **Authentication** | Manus OAuth (staff), token-based (portals) |
| **Hosting** | Manus WebDev (Cloud Run, 1 vCPU, 512 MiB) |
| **Database** | TiDB (MySQL-compatible, managed) |
| **File storage** | S3 via Manus Forge proxy |

### 2.2 Authentication Architecture

The system currently uses three separate authentication mechanisms, none of which are tenant-aware:

| Auth Method | Users | Mechanism |
|---|---|---|
| **Manus OAuth** | Internal staff (admins, design advisers, construction users) | OAuth 2.0 callback → JWT session cookie |
| **Client Portal tokens** | End-clients viewing their project | Email-based magic link → `portal_sessions` table |
| **Trade Portal tokens** | Trade contractors (installers) | PIN + installer ID → `trade_portal_sessions` table |

### 2.3 External Integrations

Each integration currently assumes a single set of credentials. In a multi-tenant model, each tenant would need their own integration credentials.

| Integration | Purpose | Tenant Impact |
|---|---|---|
| **Xero** | Accounting, invoicing, project costs, payment reconciliation | Each tenant needs their own Xero organisation connection |
| **Stripe** | Subscription billing (CPC care plans) | Each tenant needs their own Stripe account (or Stripe Connect) |
| **SignWell** | Digital contract signatures | Per-tenant API key or shared with metadata |
| **Vocphone** | SMS sending, call logging | Per-tenant sender ID or shared pool |
| **Resend** | Transactional email | Per-tenant domain/sender or shared |
| **S3 Storage** | Document, photo, invoice file storage | Tenant-prefixed keys required |

### 2.4 Database Table Categories

The 106 tables can be grouped by their tenancy requirements:

| Category | Tables | Count | Tenancy Requirement |
|---|---|---|---|
| **Core business** | quotes, quote_components, quote_items, deck_quotes, eclipse_quotes, skylux_entries, etc. | ~18 | Must be tenant-scoped |
| **CRM** | crm_leads, crm_appointments, crm_contracts, crm_activities, crm_documents, etc. | ~14 | Must be tenant-scoped |
| **Construction** | construction_jobs, construction_progress, construction_assignments, construction_schedule_events, etc. | ~12 | Must be tenant-scoped |
| **Client portal** | portal_access, portal_sessions, portal_documents, portal_defects, portal_variations, etc. | ~12 | Must be tenant-scoped |
| **Trade portal** | trade_portal_access, trade_portal_sessions, trade_invoices, trade_messages, etc. | ~12 | Must be tenant-scoped |
| **Xero integration** | xero_connections, xero_contact_mappings, xero_invoice_mappings, xero_project_mappings, etc. | ~10 | Must be tenant-scoped |
| **Master data** | master_data, products, colour_groups, spec_mappings, eclipse_pricing, deck_products, etc. | ~12 | Shared global + tenant overrides |
| **System/config** | users, global_settings, branches, email_templates, sms_templates, etc. | ~10 | Mixed (users = tenant-scoped, templates = shared + overrides) |
| **Inbox/comms** | inbox_messages, inbox_tags, email_signatures, sms_messages, call_logs, etc. | ~8 | Must be tenant-scoped |

---

## 3. Multi-Tenancy Patterns Evaluated

Three industry-standard patterns were evaluated for this application. Each pattern represents a different trade-off between data isolation, operational complexity, and cost [1] [2].

### 3.1 Pattern Comparison

| Pattern | Data Isolation | Cost per Tenant | Operational Complexity | Cross-Tenant Queries | Migration Effort |
|---|---|---|---|---|---|
| **Shared Database, Shared Schema (Row-Level)** | Low — enforced by application logic | Lowest | Lowest | Easy | Moderate |
| **Shared Database, Separate Schemas** | Medium — enforced by DB schemas | Medium | Medium | Possible but harder | High |
| **Database per Tenant** | Highest — physical separation | Highest | Highest | Very difficult | Highest |

### 3.2 Row-Level Tenancy (Recommended for Spanline)

In this pattern, a `tenantId` column is added to every tenant-scoped table. Every query includes a `WHERE tenantId = ?` filter. This is the most common pattern for B2B SaaS applications with fewer than 1,000 tenants and is recommended for Spanline because:

- The application already uses a single database with Drizzle ORM, making column addition straightforward.
- TiDB/MySQL does not natively support schema-level isolation the way PostgreSQL does.
- The business does not have regulatory requirements (e.g., HIPAA, SOC 2) that mandate physical data separation.
- Cross-tenant reporting (for a future "platform admin" view) is trivial with shared tables.
- Cost scales linearly rather than per-tenant.

The primary risk is **data leakage** — a missing `tenantId` filter on any query exposes data across tenants. This must be mitigated through middleware enforcement, automated testing, and code review discipline.

---

## 4. Approach A — Retrofit the Existing Application

### 4.1 Overview

This approach modifies the existing codebase in place, adding multi-tenancy as a layer on top of the current architecture. The existing 100,000+ lines of code are preserved and incrementally modified.

### 4.2 Database Changes

**New tables required:**

```
tenants
├── id (PK)
├── name (company name, e.g., "Spanline Canberra")
├── slug (URL-safe identifier, e.g., "spanline-canberra")
├── domain (optional custom domain)
├── plan (subscription tier: free, standard, premium)
├── status (active, suspended, cancelled)
├── settings (JSON — branding, defaults, feature flags)
├── xeroClientId, xeroClientSecret (per-tenant Xero credentials)
├── stripeAccountId (Stripe Connect account)
├── signwellApiKey
├── vocphoneCredentials (JSON)
├── createdAt, updatedAt

tenant_users (maps users to tenants with roles)
├── id (PK)
├── tenantId (FK → tenants)
├── userId (FK → users)
├── role (owner, admin, member)
├── createdAt
```

**Columns added to existing tables:** Every tenant-scoped table (approximately 90 of 106) receives a `tenantId INT NOT NULL` column with an index. This is a single ALTER TABLE operation per table, but on a production database with data, each ALTER must be carefully sequenced to avoid downtime.

**Migration SQL volume estimate:** Approximately 90 ALTER TABLE statements plus 2 CREATE TABLE statements, plus index creation. On TiDB, online DDL makes this feasible without downtime, but the migration script would be approximately 300–400 lines of SQL.

### 4.3 Server-Side Changes

**Middleware layer:** A new tRPC middleware intercepts every procedure call and injects `ctx.tenantId` from the authenticated user's tenant association. All existing `protectedProcedure` calls would chain through this middleware.

```typescript
// Conceptual middleware
const tenantProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const tenantUser = await db.select()
    .from(tenantUsers)
    .where(and(eq(tenantUsers.userId, ctx.user.id)))
    .limit(1);
  
  if (!tenantUser[0]) throw new TRPCError({ code: "FORBIDDEN" });
  
  return next({
    ctx: { ...ctx, tenantId: tenantUser[0].tenantId }
  });
});
```

**Query modification:** Every database query in every router file must be modified to include a `tenantId` filter. With 38 router files and approximately 500 procedures, this is the most labour-intensive part of the retrofit.

**Estimated changes per router file:**

| Router | Procedures | Estimated Edits |
|---|---|---|
| `routers.ts` (main) | ~70 | ~120 query modifications |
| `construction-router.ts` | ~53 | ~90 query modifications |
| `crm-router.ts` | ~62 | ~100 query modifications |
| `trade-portal-router.ts` | ~30 | ~50 query modifications |
| `portal-router.ts` | ~25 | ~40 query modifications |
| Other 33 routers | ~260 | ~400 query modifications |
| **Total** | **~500** | **~800 query modifications** |

### 4.4 Client-Side Changes

The client-side changes are relatively minimal because tRPC procedures abstract the data layer. The primary changes are:

- **Tenant context provider** — a React context that holds the current tenant's branding, settings, and feature flags.
- **Tenant selector** — for users who belong to multiple tenants (e.g., a franchise owner managing several locations).
- **Branding customisation** — dynamic CSS variables, logo, and company name driven by tenant settings.
- **Subdomain routing** — resolving `acme.spanquote.com` to the correct tenant context.

### 4.5 Authentication Overhaul

The current Manus OAuth system is tied to a single application. For multi-tenancy, the authentication system must support:

- **Independent user registration** — tenants sign up their own staff without Manus accounts.
- **Email/password authentication** — the most common pattern for B2B SaaS.
- **Tenant-scoped sessions** — a user's session is always associated with a specific tenant.
- **Invitation flow** — tenant admins invite team members via email.

This is the single largest risk in the retrofit approach. Replacing Manus OAuth with a custom auth system (or integrating a service like Clerk, Auth0, or WorkOS) requires changes to the core authentication middleware, session management, and every component that calls `useAuth()`.

### 4.6 Retrofit Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| **Data leakage** — missing tenantId filter on any query | Critical | Automated test suite that verifies every query includes tenantId; Drizzle query wrapper |
| **Migration errors** — ALTER TABLE on 90 tables with existing data | High | Staged migration with rollback plan; test on clone database first |
| **Auth replacement** — removing Manus OAuth breaks all existing sessions | High | Parallel auth system with migration period; keep Manus OAuth as fallback |
| **Integration credentials** — Xero/Stripe per-tenant setup | Medium | Phased rollout; first tenant uses existing credentials |
| **Performance** — additional JOIN/WHERE on every query | Low | Composite indexes on (tenantId, id) for all tables; TiDB handles this well |
| **Regression** — 800+ query modifications introduce bugs | High | Comprehensive test coverage before migration; staged rollout by module |

### 4.7 Retrofit Effort Estimate

| Phase | Effort (Developer-Weeks) | Description |
|---|---|---|
| Tenant schema + migration | 2 | New tables, ALTER TABLE scripts, data migration |
| Auth system replacement | 3–4 | Custom auth or third-party integration, session management |
| Server middleware + query scoping | 6–8 | Modify all 500 procedures across 38 routers |
| Integration per-tenant credentials | 2 | Xero, Stripe, SignWell, Vocphone tenant isolation |
| Client-side tenant context + branding | 2 | Tenant provider, subdomain routing, dynamic branding |
| Testing + QA | 3–4 | Regression testing, data leakage testing, load testing |
| **Total** | **18–22 weeks** | For a single experienced full-stack developer |

---

## 5. Approach B — New Build

### 5.1 Overview

This approach builds a new application from scratch, designed for multi-tenancy from the ground up. The existing application's business logic, UI patterns, and domain knowledge are carried forward, but the codebase is rewritten with tenancy as a first-class architectural concern.

### 5.2 Recommended Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Frontend** | React 19 + Tailwind 4 + shadcn/ui | Carry forward existing UI components and design system |
| **Backend** | Node.js + tRPC 11 (or Next.js API routes) | Maintain type-safe API layer; familiar to existing codebase |
| **Database** | PostgreSQL (Supabase or Neon) | Row-Level Security (RLS) for automatic tenant filtering [3] |
| **ORM** | Drizzle ORM | Carry forward existing schema patterns |
| **Auth** | Clerk, Auth0, or custom JWT | Multi-tenant auth with organisation support |
| **Hosting** | Vercel, Railway, or AWS (ECS/Fargate) | Better suited for SaaS than single-instance Cloud Run |
| **Billing** | Stripe Connect | Platform billing + per-tenant payment processing |
| **File storage** | S3 with tenant-prefixed keys | Same pattern, better isolation |

### 5.3 Why PostgreSQL for the New Build

The single most impactful architectural decision for a new build is switching from MySQL/TiDB to PostgreSQL. PostgreSQL's **Row-Level Security (RLS)** provides database-enforced tenant isolation that cannot be bypassed by application bugs [3]:

```sql
-- Example RLS policy
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON quotes
  USING (tenant_id = current_setting('app.current_tenant_id')::int);
```

With RLS, even if a developer forgets to add a `WHERE tenantId = ?` clause, the database itself prevents cross-tenant data access. This eliminates the single largest risk of the retrofit approach.

### 5.4 Schema Design (New Build)

The new schema would be designed with tenancy from the start. Key differences from the current schema:

**Tenant hierarchy:**
```
platform_config (global settings, pricing tiers)
  └── tenants (each franchise/company)
       ├── tenant_users (staff within that tenant)
       ├── tenant_integrations (Xero, Stripe per tenant)
       ├── tenant_settings (branding, defaults, feature flags)
       └── [all business tables with tenant_id FK]
```

**Master data strategy:** Product catalogues, pricing matrices, and spec mappings would use a two-tier model:

- **Platform-level master data** — maintained by the platform owner (Spanline corporate), shared across all tenants as read-only defaults.
- **Tenant-level overrides** — each tenant can customise pricing, add products, or modify defaults for their region.

This is particularly important for Spanline's franchise model, where each location may have different pricing but shares the same product catalogue.

### 5.5 Module Reuse Assessment

Not everything needs to be rewritten. Significant portions of the existing codebase can be carried forward:

| Module | Lines of Code | Reuse Potential | Notes |
|---|---|---|---|
| **UI components** (shadcn/ui, custom) | ~8,000 | 90% reusable | Copy directly; add tenant branding wrapper |
| **Quote calculation logic** | ~5,000 | 85% reusable | Core business logic is tenant-agnostic |
| **Spec sheet / check measure** | ~4,000 | 80% reusable | Product data becomes tenant-aware |
| **CRM workflow** | ~6,000 | 70% reusable | Lead/appointment logic carries forward |
| **Construction management** | ~8,000 | 70% reusable | Job/progress/schedule logic carries forward |
| **Xero integration** | ~12,000 | 60% reusable | Must be refactored for per-tenant connections |
| **Portal pages** (client + trade) | ~15,000 | 75% reusable | UI carries forward; auth changes |
| **Auth system** | ~2,000 | 0% reusable | Complete replacement required |
| **Database queries** | ~10,000 | 40% reusable | All queries need tenant scoping |

**Overall reuse estimate:** Approximately 60–65% of the existing code logic can be carried forward, though it will need modification for tenant context injection.

### 5.6 New Build Effort Estimate

| Phase | Effort (Developer-Weeks) | Description |
|---|---|---|
| Architecture + schema design | 2 | Database design, API contracts, auth flow design |
| Platform scaffolding | 2 | Project setup, auth, tenant management, billing |
| Core quoting engine | 4 | Quote creation, calculation, spec sheets (ported) |
| CRM module | 3 | Leads, appointments, contracts (ported) |
| Construction module | 4 | Jobs, progress, scheduling, financials (ported) |
| Client portal | 2 | Portal access, documents, defects, maintenance |
| Trade portal | 2 | Trade auth, schedule, invoices, photos, messages |
| Xero integration | 3 | Per-tenant Xero connection, sync, reconciliation |
| Stripe/billing | 2 | Platform billing + tenant payment processing |
| Admin/platform dashboard | 2 | Tenant management, platform analytics, master data |
| Testing + QA | 3–4 | Unit tests, integration tests, tenant isolation tests |
| Data migration | 2 | Migrate existing Spanline data to new schema |
| **Total** | **31–36 weeks** | For a single experienced full-stack developer |

---

## 6. Comparison of Approaches

| Dimension | Retrofit (Approach A) | New Build (Approach B) |
|---|---|---|
| **Effort** | 18–22 weeks | 31–36 weeks |
| **Risk of data leakage** | High (application-enforced only) | Low (database-enforced via RLS) |
| **Technical debt** | Accumulates on existing debt | Clean slate |
| **Time to first tenant** | ~10 weeks (MVP with limited modules) | ~16 weeks (MVP with core modules) |
| **Ongoing maintenance** | Higher (tenancy bolted on) | Lower (tenancy native) |
| **Feature parity** | Immediate (existing features preserved) | Gradual (features ported in phases) |
| **Auth flexibility** | Constrained by Manus OAuth migration | Full control from day one |
| **Database performance** | Good (TiDB handles row-level well) | Better (PostgreSQL RLS + connection pooling) |
| **Scalability ceiling** | Medium (single Cloud Run instance) | High (horizontal scaling, CDN, edge) |
| **Master data management** | Retrofitted (complex) | Native two-tier model |
| **White-labelling** | Possible but limited | Full subdomain + branding support |

---

## 7. Recommendation

**For Spanline's situation, the recommended approach is a Hybrid strategy:**

### Phase 1 — Continue Single-Tenant (Now → 3 months)
Continue developing the current application for the Canberra operation. Complete the remaining feature roadmap (mobile portal improvements, Xero reconciliation, CRM enhancements). This maximises immediate business value.

### Phase 2 — New Build Foundation (Months 4–7)
Begin the new multi-tenant platform as a parallel project. Start with the platform scaffolding, authentication, tenant management, and the core quoting engine. Use PostgreSQL with RLS from day one. Port the existing UI components and business logic.

### Phase 3 — Feature Parity (Months 8–12)
Port the remaining modules (CRM, construction, portals, Xero) to the new platform. Run both systems in parallel — the existing app for Canberra, the new platform for onboarding additional franchises.

### Phase 4 — Migration (Months 12–14)
Migrate the Canberra operation to the new platform. Decommission the old single-tenant application.

**Why not retrofit?** The retrofit approach is faster to start but creates long-term maintenance burden. With 800+ query modifications needed and no database-level isolation guarantee, the risk of data leakage between tenants is significant. For a system handling financial data (quotes, invoices, payments), this risk is unacceptable without extensive automated testing infrastructure that would itself take weeks to build.

**Why hybrid?** The current application continues to deliver value while the new platform is built in parallel. There is no disruption to the Canberra operation, and the new platform can be validated with a second franchise before migrating the primary operation.

---

## 8. Tenant Onboarding Flow (New Build)

The following describes the self-service tenant onboarding experience for the new platform:

**Step 1 — Signup:** A franchise owner visits the platform landing page, enters their company name, email, and creates an account. A new tenant record is created with a `trial` plan.

**Step 2 — Configuration:** The tenant admin configures their company details: business name, ABN, logo, default region, and contact information. The system seeds default master data (product catalogue, pricing matrices) from the platform-level defaults.

**Step 3 — Integration Setup:** The tenant admin connects their Xero organisation via OAuth. Optionally connects Stripe for client payment processing. SMS sender ID is configured.

**Step 4 — Team Invitations:** The tenant admin invites team members (design advisers, construction managers, office staff) via email. Each invitation includes a role assignment.

**Step 5 — Data Import:** The tenant can import existing client data, quotes, and job records via CSV upload or API.

**Step 6 — Go Live:** The tenant activates their subscription (Stripe Checkout), and the system transitions from trial to active. Portal URLs are provisioned (e.g., `acme.spanquote.com`).

---

## 9. Billing Architecture

### 9.1 Platform Billing (Spanline Corporate → Tenants)

| Tier | Price (Suggested) | Features |
|---|---|---|
| **Starter** | $199/month | Quoting, basic CRM, 3 users |
| **Professional** | $499/month | Full CRM, construction management, portals, 10 users |
| **Enterprise** | $999/month | All features, unlimited users, priority support, API access |

Implementation uses **Stripe Subscriptions** with metered billing for overages (additional users, storage, SMS credits).

### 9.2 Tenant Payment Processing (Tenants → Their Clients)

For tenants who want to accept payments from their clients (e.g., deposit collection, progress payments), the platform uses **Stripe Connect** in the "destination charges" model:

- Each tenant connects their own Stripe account via Stripe Connect onboarding.
- The platform creates charges on behalf of the tenant.
- The platform can optionally take an application fee (percentage of each transaction).

This keeps each tenant's financial data in their own Stripe dashboard while allowing the platform to facilitate payments.

---

## 10. Data Isolation Architecture (New Build)

### 10.1 Database Layer

PostgreSQL Row-Level Security ensures that every query is automatically filtered by tenant:

```sql
-- Set tenant context at the start of each request
SET LOCAL app.current_tenant_id = '42';

-- RLS policy automatically filters all queries
SELECT * FROM quotes;  -- Only returns tenant 42's quotes
```

### 10.2 File Storage Layer

S3 keys are prefixed with the tenant ID:

```
s3://spanquote-files/
  tenant-42/
    documents/contract-123.pdf
    photos/site-456.jpg
  tenant-57/
    documents/contract-789.pdf
```

### 10.3 Integration Layer

Each tenant's external service credentials are stored in the `tenant_integrations` table (encrypted at rest). The application resolves credentials per-request based on the tenant context:

```typescript
const xeroClient = await getXeroClientForTenant(ctx.tenantId);
const stripeClient = await getStripeClientForTenant(ctx.tenantId);
```

---

## 11. Implementation Roadmap (Recommended Hybrid Approach)

| Phase | Timeline | Deliverables | Dependencies |
|---|---|---|---|
| **1a. Continue current app** | Now → Month 3 | Complete mobile portal, Xero reconciliation, CRM features | None |
| **1b. Architecture design** | Month 2–3 | Finalised schema, API contracts, tech stack selection | Decision on hosting platform |
| **2a. Platform scaffolding** | Month 4–5 | Auth, tenant management, billing, admin dashboard | PostgreSQL instance provisioned |
| **2b. Core quoting engine** | Month 5–7 | Quote creation, calculation, spec sheets, proposals | Platform scaffolding complete |
| **3a. CRM + Construction** | Month 7–9 | Leads, appointments, jobs, progress, scheduling | Core engine complete |
| **3b. Portals** | Month 9–10 | Client portal, trade portal (mobile-first) | Construction module complete |
| **3c. Integrations** | Month 10–11 | Per-tenant Xero, Stripe Connect, SMS, email | Portals complete |
| **4. Migration** | Month 12–14 | Canberra data migration, parallel running, cutover | All modules at feature parity |

---

## 12. Key Decisions Required

Before proceeding with implementation, the following decisions need to be made:

| Decision | Options | Impact |
|---|---|---|
| **Hosting platform** | Manus WebDev (current), Vercel, Railway, AWS | Determines scaling ceiling and deployment model |
| **Auth provider** | Custom JWT, Clerk, Auth0, WorkOS | Determines onboarding speed and SSO capability |
| **Database** | Stay on TiDB (retrofit), PostgreSQL (new build) | Determines RLS availability and tenant isolation |
| **Pricing model** | Per-user, per-tenant flat, usage-based | Determines billing complexity |
| **White-labelling depth** | Subdomain only, full branding, custom domains | Determines frontend complexity |
| **Master data ownership** | Platform-controlled, tenant-controlled, hybrid | Determines product catalogue architecture |
| **Target market** | Spanline franchises only, broader construction industry | Determines feature generality |

---

## 13. Glossary

| Term | Definition |
|---|---|
| **Tenant** | A single company/franchise using the platform (e.g., "Spanline Canberra") |
| **Platform** | The SaaS application itself, managed by the platform owner |
| **RLS** | Row-Level Security — a PostgreSQL feature that enforces data isolation at the database level |
| **Stripe Connect** | Stripe's platform for marketplace/SaaS payment processing |
| **White-labelling** | Allowing tenants to customise branding (logo, colours, domain) |

---

## References

[1] Bytebase, "Multi-Tenant Database Architecture Patterns Explained," March 2025. https://www.bytebase.com/blog/multi-tenant-database-architecture-patterns-explained/

[2] BrotCode, "Multi-Tenancy Patterns: Shared Database vs. Database per Tenant," February 2026. https://brotcode.com/blog/engineering/multi-tenancy-patterns-shared-vs-database-per-tenant/

[3] OneUptime, "How to Implement Multi-Tenancy in Node.js Applications," January 2026. https://oneuptime.com/blog/post/2026-01-27-nodejs-multi-tenancy/view

---

*This document is a strategic planning resource. Implementation details will be refined during the architecture design phase. All effort estimates assume a single experienced full-stack developer and should be adjusted for team size and parallel workstreams.*
