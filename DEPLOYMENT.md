# Spanline Costing & Quoting System — External Server Deployment Guide

## Overview

This is a full-stack web application built with:
- **Frontend:** React 19 + Tailwind CSS 4 + Vite
- **Backend:** Express 4 + tRPC 11 + Drizzle ORM
- **Database:** MySQL 8+ / TiDB (MySQL-compatible)
- **Runtime:** Node.js 22+ (LTS recommended)
- **Package Manager:** pnpm 10.4+

The application serves both the API and the built frontend from a single Express server on a single port.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 22.x LTS | Required for ES module support |
| pnpm | 10.4+ | `npm install -g pnpm@10` |
| MySQL | 8.0+ | Or TiDB / PlanetScale (MySQL-compatible) |
| S3-compatible storage | Any | For file uploads (AWS S3, MinIO, etc.) |

---

## Quick Start

```bash
# 1. Extract the ZIP
unzip spanline-quote-deploy.zip
cd spanline-quote

# 2. Install dependencies
pnpm install --frozen-lockfile

# 3. Copy and configure environment variables
cp env.example.txt .env
# Edit .env with your values (see Environment Variables section below)

# 4. Build the application
pnpm build

# 5. Create or migrate the database schema
# Fresh database:
pnpm exec drizzle-kit push
# Existing single-tenant database:
pnpm db:migrate:sql

# 6. Start the production server
NODE_ENV=production node dist/index.js
```

The server will start on port 3000 by default (or the PORT environment variable).

---

## Environment Variables

Create a `.env` file in the project root with the following variables:

### Required (Core)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string. Railway can use `MYSQL_URL` instead. | `mysql://user:pass@host:3306/dbname?ssl={"rejectUnauthorized":true}` |
| `MYSQL_URL` | Railway MySQL connection string fallback when `DATABASE_URL` is not set | `${{MySQL.MYSQL_URL}}` |
| `JWT_SECRET` | Secret for signing session cookies (min 32 chars) | `your-random-secret-string-here` |
| `PORT` | Server port (optional, defaults to 3000) | `3000` |
| `HOST_PORT` | Docker host port (optional, defaults to 3000) | `3000` |
| `NODE_ENV` | Must be `production` for production | `production` |
| `PUBLIC_APP_URL` | Canonical external URL used for emails and magic links | `https://app.example.com` |
| `ALLOWED_MAGIC_LINK_ORIGINS` | Comma-separated extra allowed tenant/custom domains for magic links | `https://tenant.example.com` |
| `TENANCY_MODE` | `single` during migration, `multi` after tenant isolation is complete | `single` |
| `DEFAULT_TENANT_SLUG` | Default tenant slug for legacy data backfill | `default` |
| `REQUIRE_AUTH_FOR_STORAGE_PROXY` | Require an authenticated app session for `/manus-storage/*` | `true` |

### Required (Authentication — Manus OAuth)

| Variable | Description |
|----------|-------------|
| `VITE_APP_ID` | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | Manus OAuth backend URL |
| `VITE_OAUTH_PORTAL_URL` | Manus login portal URL (frontend) |
| `OWNER_OPEN_ID` | Owner's Manus Open ID |
| `OWNER_NAME` | Owner's display name |

### Required (Storage & APIs — Manus Platform)

| Variable | Description |
|----------|-------------|
| `BUILT_IN_FORGE_API_URL` | Manus built-in API URL (storage, LLM, notifications) |
| `BUILT_IN_FORGE_API_KEY` | Bearer token for Manus built-in APIs (server-side) |
| `VITE_FRONTEND_FORGE_API_KEY` | Bearer token for frontend access to Manus APIs |
| `VITE_FRONTEND_FORGE_API_URL` | Manus built-in API URL for frontend |

### Optional (Integrations)

| Variable | Description |
|----------|-------------|
| `SIGNWELL_API_KEY` | SignWell e-signature API key |
| `XERO_CLIENT_ID` | Xero accounting OAuth client ID |
| `XERO_CLIENT_SECRET` | Xero accounting OAuth client secret |
| `XERO_WEBHOOK_KEY` | Xero webhook signing key from the Developer Centre |
| `XERO_WEBHOOK_SYNC_MAX_PAGES` | Optional page limit for webhook-triggered accounting refreshes (default `10`) |
| `STRIPE_SECRET_KEY` | Stripe payment secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (frontend) |
| `MS_GRAPH_TENANT_ID` | Microsoft 365 tenant ID (for email) |
| `MS_GRAPH_CLIENT_ID` | Microsoft 365 app client ID |
| `MS_GRAPH_CLIENT_SECRET` | Microsoft 365 app client secret |
| `NYLAS_CLIENT_ID` | Nylas email integration client ID |
| `NYLAS_API_KEY` | Nylas API key |
| `NYLAS_API_URI` | Nylas API URI (default: `https://api.eu.nylas.com`) |
| `EMAIL_SENDER_ADDRESS` | Default email sender address |
| `EMAIL_SENDER_NAME` | Default email sender display name |
| `EMAIL_REPLY_TO` | Reply-to email address |
| `RESEND_API_KEY` | Optional legacy-only key for old Resend inbound/tracking webhooks; outbound email uses Microsoft Graph/O365 |
| `TEABLE_API_URL` | Teable API URL |
| `TEABLE_APP_TOKEN` | Teable app token |
| `ZAPIER_API_KEY` | Zapier webhook API key |
| `VOCPHONE_API_USERNAME` | VOCPhone API username |
| `VOCPHONE_API_PASSWORD` | VOCPhone API password |
| `VOCPHONE_SMS_SENDER` | VOCPhone SMS sender ID |
| `VAPID_PUBLIC_KEY` | Web push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web push VAPID private key |
| `VITE_VAPID_PUBLIC_KEY` | VAPID public key (frontend) |

### Frontend-only Variables (VITE_ prefix)

| Variable | Description |
|----------|-------------|
| `VITE_APP_TITLE` | Application title displayed in browser |
| `VITE_APP_LOGO` | URL to application logo |
| `VITE_ANALYTICS_ENDPOINT` | Analytics endpoint URL |
| `VITE_ANALYTICS_WEBSITE_ID` | Analytics website ID |

---

## Build Process

```bash
# Full build (frontend + backend)
pnpm build
```

This runs:
1. `vite build` — Compiles React frontend to `dist/public/`
2. `esbuild server/_core/index.ts` — Bundles server to `dist/index.js`

The production server (`dist/index.js`) serves the static frontend from `dist/public/` and handles all API routes under `/api/`.

---

## Database Setup

The application uses MySQL (or TiDB). The schema is defined in `drizzle/schema.ts`.

### Multi-tenant Migration

This package includes `drizzle/migrations/0001_multi_tenant_scaffold.sql`.
It creates `tenants`, `tenant_memberships`, `tenant_settings`, and nullable `tenantId` anchors on the core business tables.

For an existing single-tenant install, run this migration first with `TENANCY_MODE=single`. It creates a `default` tenant, backfills existing records to that tenant, and maps existing users into tenant memberships. After all tenant-owned routes are filtered and tested, switch `TENANCY_MODE=multi`.

### Option A: Drizzle Kit Push (Fresh Setup)

```bash
# Ensure DATABASE_URL or MYSQL_URL is set
pnpm exec drizzle-kit push
```

### Option B: Multi-tenant SQL Migration (Existing Install)

Use the included migration runner to apply `drizzle/migrations/0001_multi_tenant_scaffold.sql` to an existing single-tenant database:

```bash
pnpm db:migrate:sql
```

### Database Connection

The connection string format:
```
mysql://username:password@hostname:3306/database_name?ssl={"rejectUnauthorized":true}
```

For TiDB/PlanetScale, SSL is typically required.

---

## Production Deployment Options

### Option 1: Direct Node.js (PM2)

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start dist/index.js --name spanline-quote

# Save PM2 process list
pm2 save

# Setup PM2 startup script
pm2 startup
```

### Option 2: Docker

Create a `Dockerfile`:

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built application
COPY dist/ ./dist/

# Expose port
EXPOSE 3000

# Start
CMD ["node", "dist/index.js"]
```

Build and run:
```bash
# Build the app first (outside Docker)
pnpm build

# Build Docker image
docker build -t spanline-quote .

# Run container
docker run -d \
  --name spanline-quote \
  -p 3000:3000 \
  --env-file .env \
  spanline-quote
```

### Option 3: Railway

This package includes `railway.json`, which configures Railway to:

1. Build with Railpack using `corepack enable && pnpm install --frozen-lockfile && pnpm build`
2. Start with `pnpm start`
3. Use `/healthz` for the deployment health check

Recommended Railway setup:

1. Create a new Railway project and add a MySQL database service.
2. Add the app service from the GitHub repo or uploaded source package.
3. Set `DATABASE_URL` to the MySQL service's `MYSQL_URL`, or set `MYSQL_URL` directly.
4. Set the required core auth variables: `JWT_SECRET`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `OWNER_OPEN_ID`, `PUBLIC_APP_URL`, `TENANCY_MODE`, and `DEFAULT_TENANT_SLUG`.
5. Create the schema for a fresh Railway MySQL database:

```bash
pnpm exec drizzle-kit push
```

For an existing single-tenant database instead, run the tenant scaffold migration once:

```bash
pnpm db:migrate:sql
```

6. Generate a Railway domain, then update `PUBLIC_APP_URL` and any OAuth/webhook callback URLs to that public URL.

Do not enable `TENANCY_MODE=multi` for production users until tenant isolation has been verified across the remaining admin/master-data surfaces.

### Option 4: Render / Fly.io

These platforms also support Node.js apps. Ensure:
1. `pnpm build` runs as the build command
2. `pnpm start` or `node dist/index.js` is the start command
3. `/healthz` is configured as the health check path
4. All environment variables are configured in the platform dashboard

---

## Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name altaspan.business www.altaspan.business;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

For HTTPS, use Certbot/Let's Encrypt:
```bash
sudo certbot --nginx -d altaspan.business -d www.altaspan.business
```

---

## Webhook Endpoints

The following webhook endpoints must be accessible from external services:

| Endpoint | Service | Notes |
|----------|---------|-------|
| `/api/stripe/webhook` | Stripe | Requires raw body parsing |
| `/api/xero/webhook` | Xero | Configure Invoice and Credit Note events; uses `XERO_WEBHOOK_KEY` signature verification |
| `/api/webhooks/vocphone` | VOCPhone | Call event notifications |
| `/api/webhooks/signwell` | SignWell | Document signing events |
| `/api/resend/webhook` | Resend | Optional legacy email delivery tracking only |
| `/api/resend/inbound` | Resend | Optional legacy inbound inbox feed only; Microsoft Graph mailbox sync is the primary inbound path |
| `/api/webhooks/inbox` | Inbox | Inbound email processing |
| `/api/zapier/leads` | Zapier | Lead ingestion |

Xero does not currently deliver Bank Transaction webhook events, so keep the scheduled Xero financial sync enabled for spend-money/non-chargeable project expenses.

---

## Health Check

The server exposes a dedicated health endpoint. For load balancer and platform health checks, use:
```
GET /healthz -> 200 OK
```

---

## Scheduled Tasks

The application includes internal scheduled tasks (cron-like) that run within the Node.js process:
- Quote expiry reminders
- Overdue payment notifications
- Weather polling
- DA tracker polling
- Cost import processing
- Low stock alerts
- And more...

These start automatically when the server boots. No external cron configuration is needed.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `Cannot find module` errors | Run `pnpm install --frozen-lockfile` |
| Database connection refused | Check `DATABASE_URL` and ensure MySQL is accessible |
| Build fails | Ensure Node.js 22+ and pnpm 10+ are installed |
| Blank page in browser | Check `VITE_*` env vars are set before build |
| Auth redirect fails | Verify `OAUTH_SERVER_URL` and `VITE_OAUTH_PORTAL_URL` |
| File uploads fail | Check `BUILT_IN_FORGE_API_URL` and `BUILT_IN_FORGE_API_KEY` |

---

## Important Notes

1. **Manus Platform Dependency:** This application was built on the Manus platform and uses Manus OAuth for authentication and Manus Forge APIs for storage/LLM/notifications. To run fully independently, you would need to replace these integrations with alternatives (e.g., Auth0 for auth, AWS S3 for storage, OpenAI for LLM).

2. **VITE_ variables are baked into the frontend at build time.** If you change any `VITE_*` variable, you must rebuild (`pnpm build`).

3. **The `server/_core/` directory** contains framework-level code (OAuth, context, storage proxy, LLM helpers). Avoid modifying unless replacing platform integrations.

4. **Database migrations** are managed via `webdev_execute_sql` in the Manus platform. For external deployment, use `pnpm exec drizzle-kit push` for a fresh database or `pnpm db:migrate:sql` for the included multi-tenant migration against an existing install.
