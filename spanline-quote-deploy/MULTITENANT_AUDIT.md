# Multi-Tenant Audit Notes

Last updated: 2026-06-09

## Completed in this scaffold

- Tenant context and tenant membership procedures are available through `tenantProcedure` and `tenantAdminProcedure`.
- Core construction, inventory, stocktake, supplier, Xero accounting, Xero import, and App Central surfaces now use tenant-scoped procedures or tenant filters.
- Xero connections are linked to the app tenant through `xero_connections.appTenantId`.
- Xero Accounting API transaction rows, webhook events, cost-import batches/items, and budget-import batches/items carry app tenant ownership.
- Xero settings now exposes tenant-scoped sync operations health: transaction rows, unmatched lines, webhook events, sync logs, and latest import status.

## Remaining high-priority tenant gaps

- `deck_quotes`, `eclipse_quotes`, and `proposals` do not yet have direct `tenantId` columns. Some reporting can infer tenant through the user or linked CRM lead, but these records should get first-class tenant ownership before production multi-tenant rollout.
- `approval_projects` and related approval workflow records do not yet have direct tenant ownership. App Central counts linked approval projects through CRM/job references only; unlinked approval projects should be treated as not tenant-safe until this is fixed.
- Several legacy routers still import plain `protectedProcedure` for tenant-owned data. The highest-risk families to review next are CRM/deck/eclipse/proposal, approvals, inbox/email, plan converter, site induction, subcontracting, supplier feedback, and public/scheduled notification flows.
- Some scheduled jobs operate globally by design. In a multi-tenant SaaS deployment they should either iterate tenants explicitly or record tenant-aware side effects.

## Production checks before enabling multi-tenant mode

- Re-run migrations on a staging clone and verify all legacy rows are backfilled to the default tenant.
- Connect Xero separately per tenant and confirm OAuth callback stores the correct `appTenantId`.
- Trigger Xero webhook intent validation with `XERO_WEBHOOK_KEY` set and confirm invalid signatures return 401.
- Run tenant A / tenant B smoke tests for App Central, Xero settings, supplier sync, import history, job financials, and unmatched transaction reporting.
- Reconnect Xero after scope changes so existing refresh tokens include `accounting.banktransactions.read`.
