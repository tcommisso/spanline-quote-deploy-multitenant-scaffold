# Multi-Tenant Audit Notes

Last updated: 2026-06-09

## Completed in this scaffold

- Tenant context and tenant membership procedures are available through `tenantProcedure` and `tenantAdminProcedure`.
- Core construction, inventory, stocktake, supplier, Xero accounting, Xero import, and App Central surfaces now use tenant-scoped procedures or tenant filters.
- Xero connections are linked to the app tenant through `xero_connections.appTenantId`.
- Xero Accounting API transaction rows, webhook events, cost-import batches/items, and budget-import batches/items carry app tenant ownership.
- Xero settings now exposes tenant-scoped sync operations health: transaction rows, unmatched lines, webhook events, sync logs, and latest import status.
- Tenant integration settings now cover `domain`, `email`, `msgraph`, `nylas`, `vocphone`, `signwell`, `zapier`, and `planning`.
- Outbound email uses Microsoft Graph/O365. Resend is no longer an active sender and is retained only for optional legacy inbound/tracking compatibility.
- Client portal, trade portal, CRM letter, Smartshop order, inbox, and scheduled digest emails now flow through the unified O365 sender path.
- Nylas, VOCPhone, SignWell, Zapier, and planning scrape/sync code paths now accept tenant-specific configuration and tenant-scoped records.
- ACT DA Tracker, NSW Planning Portal, T1Cloud scrapes, competitor watchlists, client DA matches, webhook subscriptions, webhook deliveries, and scheduled DA jobs are tenant-scoped.

## Remaining high-priority tenant gaps

- `deck_quotes`, `eclipse_quotes`, and `proposals` do not yet have direct `tenantId` columns. Some reporting can infer tenant through the user or linked CRM lead, but these records should get first-class tenant ownership before production multi-tenant rollout.
- Approval projects now carry `tenantId`, but many child approval workflow reads still infer tenant via project joins. Treat unjoined child-row admin actions as requiring follow-up review.
- Admin pages/functions are not fully tenantised yet. Tenant/account management, integration settings, inbox admin, calendar views, people, supplier categories, portal access, trade portal access, Nylas, VOCPhone, SignWell, and the planning intelligence surfaces are tenant-aware; legacy master-data/pricing/template/AI/deck/eclipse/proposal/DA-adviser admin surfaces still need a dedicated pass.
- Several legacy routers still import plain `protectedProcedure` or `adminProcedure` for tenant-owned data. The highest-risk families to review next are CRM/deck/eclipse/proposal, approvals, plan converter, site induction, subcontracting, supplier feedback, and global notification/reporting flows.
- Resend webhooks/inbound handlers and `resendEmailId` columns remain as legacy compatibility/tracking surfaces. They are not required for normal O365 email sending.

## Production checks before enabling multi-tenant mode

- Re-run migrations on a staging clone and verify all legacy rows are backfilled to the default tenant.
- Connect Xero separately per tenant and confirm OAuth callback stores the correct `appTenantId`.
- Trigger Xero webhook intent validation with `XERO_WEBHOOK_KEY` set and confirm invalid signatures return 401.
- Run tenant A / tenant B smoke tests for App Central, Xero settings, supplier sync, import history, job financials, and unmatched transaction reporting.
- Reconnect Xero after scope changes so existing refresh tokens include `accounting.banktransactions.read`.
- Configure each tenant's O365/Graph mailbox under tenant integration settings before testing outbound email.
- Run tenant A / tenant B smoke tests for portal magic links, trade magic links, CRM letters, Smartshop notifications, Nylas calendar sync, VOCPhone webhooks, SignWell callbacks, Zapier lead ingestion, and planning scrapes.
