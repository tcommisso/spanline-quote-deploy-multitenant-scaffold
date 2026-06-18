# Railway Cron Jobs

Production scheduled work is handled by one Railway cron service running the app-owned dispatcher:

```text
pnpm scheduled:dispatch
```

Set the Railway cron schedule to:

```text
* * * * *
```

The dispatcher runs once, checks the current `Australia/Sydney` time, calls only the jobs that are due, and exits. This keeps all external-service polling in one place while avoiding a separate Railway service for every endpoint.

Required variables for the cron service:

```text
PUBLIC_APP_URL=https://app.commissogroup.au
SCHEDULED_JOB_SECRET=<same value used by the web app>
```

Optional variables:

```text
SCHEDULED_APP_URL=https://app.commissogroup.au
SCHEDULED_DISPATCH_JOB=vocphone-sync
SCHEDULED_DISPATCH_ALL=true
SCHEDULED_DISPATCH_VERBOSE=true
SCHEDULED_DISPATCH_TIMEOUT_MS=120000
```

All dispatched requests include:

```text
Authorization: Bearer ${SCHEDULED_JOB_SECRET}
Content-Type: application/json
```

Unless noted otherwise, each scheduled endpoint processes every active tenant internally. Do not create separate cron jobs per tenant.

## Dispatcher Schedule

| Job | Endpoint | Cadence |
| --- | --- | --- |
| Cost import process | `POST /api/scheduled/cost-import-process` | Every 2 minutes |
| Xero financial sync | `POST /api/scheduled/xero-financial-sync` | Every 5 minutes |
| O365 email sync | `POST /api/scheduled/msgraph-email-sync` | Every 5 minutes |
| Inbox SLA check | `POST /api/scheduled/inbox-sla-check` | Every 15 minutes |
| VOCPhone call sync | `POST /api/scheduled/vocphone-sync` | Hourly |
| ACT DA Tracker poll | `POST /api/scheduled/da-tracker-poll` | Every 6 hours |
| NSW DA poll + T1Cloud scrape | `POST /api/scheduled/nsw-da-poll` | Daily 7:15am AEST/AEDT |
| NSW competitor digest | `POST /api/scheduled/nsw-competitor-digest` | Monday 7:20am AEST/AEDT |
| Weather poll | `POST /api/scheduled/weather-poll` | Daily 6am AEST/AEDT |
| Xero payment sync | `POST /api/scheduled/xero-payment-sync` | Daily 1am AEST/AEDT |
| Xero completion-date sync | `POST /api/scheduled/xero-completion-date-sync` | Daily 1:30am AEST/AEDT |
| Invitation expiry cleanup | `POST /api/scheduled/invitation-expiry` | Daily 2am AEST/AEDT |
| SMS reminders | `POST /api/scheduled/sms-reminders` | Daily 6:20am AEST/AEDT |
| Low-stock alert | `POST /api/scheduled/low-stock-alert` | Daily 7am AEST/AEDT |
| Condition due reminder | `POST /api/scheduled/condition-due-reminder` | Daily 7:05am AEST/AEDT |
| Overdue digest | `POST /api/scheduled/overdue-digest` | Daily 7:30am AEST/AEDT |
| Approvals overdue notify | `POST /api/scheduled/ba-overdue-notify` | Daily 8am AEST/AEDT |
| Missed calls digest | `POST /api/scheduled/missed-calls-digest` | Daily 8:05am AEST/AEDT |
| RFI due notify | `POST /api/scheduled/rfi-due-notify` | Daily 8:30am AEST/AEDT |
| Quote expiry reminder | `POST /api/scheduled/quote-expiry-reminder` | Daily 9am AEST/AEDT |
| Signature reminders | `POST /api/scheduled/signature-reminders` | Daily 9:15am AEST/AEDT |

## On-Demand Or Event-Driven Services

These external services are intentionally not polled on a schedule:

| Service | Reason |
| --- | --- |
| Xero webhook | Event-driven via `POST /api/xero/webhook`; webhooks queue changes that the financial worker picks up. |
| Zapier lead API | Inbound webhook at `POST /api/v1/leads`. |
| SignWell | Webhooks plus on-demand document actions. |
| Nylas | On-demand calendar connection and appointment sync. |
| OpenAI | On-demand Engini, transcription, and render calls. |
| LocationIQ / OpenStreetMap / parcel APIs | On-demand address, map, and parcel lookups. |
| HBCF OneGov / Direct | On-demand certificate/profile lookups and manual sync actions. |

After configuring the cron service, use **Admin > System > API Health** to confirm provider configuration, run manual connectivity checks, and review last poll/test status.
