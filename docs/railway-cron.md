# Railway Cron Jobs

Production scheduled work is triggered by Railway cron jobs calling the app's existing HTTP endpoints.

All cron requests must include:

```text
Authorization: Bearer ${SCHEDULED_JOB_SECRET}
Content-Type: application/json
```

Base URL:

```text
https://app.commissogroup.au
```

Unless noted otherwise, each scheduled endpoint processes every active tenant internally. Railway only needs one cron job per endpoint; do not create separate cron jobs per tenant.

Recommended jobs:

| Job | Endpoint | Schedule |
| --- | --- | --- |
| ACT DA Tracker poll | `POST /api/scheduled/da-tracker-poll` | Every 6 hours |
| NSW DA poll + T1Cloud scrape | `POST /api/scheduled/nsw-da-poll` | Daily |
| NSW competitor digest | `POST /api/scheduled/nsw-competitor-digest` | Monday 7am AEST |
| Weather poll | `POST /api/scheduled/weather-poll` | Daily 6am AEST |
| Xero payment sync | `POST /api/scheduled/xero-payment-sync` | Daily overnight |
| Xero financial sync | `POST /api/scheduled/xero-financial-sync` | Every 5 minutes while active |
| O365 email sync | `POST /api/scheduled/msgraph-email-sync` | Every 5 minutes |
| VOCPhone sync | `POST /api/scheduled/vocphone-sync` | Hourly |
| Quote expiry reminder | `POST /api/scheduled/quote-expiry-reminder` | Daily 9am AEST |
| Approvals overdue notify | `POST /api/scheduled/ba-overdue-notify` | Daily 8am AEST |
| Cost import process | `POST /api/scheduled/cost-import-process` | Every 2 minutes |
| Low-stock alert | `POST /api/scheduled/low-stock-alert` | Daily 7am AEST |
| Invitation expiry cleanup | `POST /api/scheduled/invitation-expiry` | Daily 2am AEST |
| RFI due notify | `POST /api/scheduled/rfi-due-notify` | Daily 8:30am AEST |
| Condition due reminder | `POST /api/scheduled/condition-due-reminder` | Daily 7am AEST |
| Overdue digest | `POST /api/scheduled/overdue-digest` | Daily morning |
| SMS reminders | `POST /api/scheduled/sms-reminders` | Daily |
| Missed calls digest | `POST /api/scheduled/missed-calls-digest` | Daily 8am AEST |

After configuring jobs, use Admin > Settings > API Health to confirm provider configuration and run manual connectivity checks.
