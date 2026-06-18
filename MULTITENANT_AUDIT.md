# Multi-Tenant Audit Notes

Last updated: 2026-06-18

## Completed in this scaffold

- Tenant context and tenant membership procedures are available through `tenantProcedure` and `tenantAdminProcedure`.
- Core construction, inventory, stocktake, supplier, Xero accounting, Xero import, and App Central surfaces now use tenant-scoped procedures or tenant filters.
- Xero connections are linked to the app tenant through `xero_connections.appTenantId`.
- Xero Accounting API transaction rows, webhook events, cost-import batches/items, and budget-import batches/items carry app tenant ownership.
- Xero settings now exposes tenant-scoped sync operations health: transaction rows, unmatched lines, webhook events, sync logs, and latest import status.
- Xero Projects sync now requires tenant context and scopes project import/push, contact sync, full batch background sync, sync cancellation/status polling, failure detail reads, transaction drilldowns, and failure notifications through the active tenant's Xero connection.
- Tenant integration settings now cover `domain`, `email`, `msgraph`, `nylas`, `vocphone`, `signwell`, `zapier`, and `planning`.
- Tenant app settings now avoid legacy global-setting fallback when true multi-tenant mode is enabled and a tenant is known. Authenticated company/settings reads and writes require tenant context.
- Outbound email uses Microsoft Graph/O365. Resend is no longer an active sender and is retained only for optional legacy inbound/tracking compatibility.
- Client portal, trade portal, CRM letter, Smartshop order, inbox, and scheduled digest emails now flow through the unified O365 sender path.
- Nylas, VOCPhone, SignWell, Zapier, and planning scrape/sync code paths now accept tenant-specific configuration and tenant-scoped records.
- ACT DA Tracker, NSW Planning Portal, T1Cloud scrapes, competitor watchlists, client DA matches, webhook subscriptions, webhook deliveries, and scheduled DA jobs are tenant-scoped.
- Deck quotes, Eclipse quotes, and proposals now carry first-class `tenantId` ownership. Their list/get/create/update/delete/archive/duplicate, proposal quote selection, proposal section status sync, and render/photo/calibration paths are tenant-scoped.
- Security screen quotes, quote items, quote option rows, quote cost rows, and screen pricing/admin reference data now carry tenant ownership and have a legacy backfill migration so imported single-tenant screen data remains visible in strict tenant mode.
- AI learning/settings prompts, knowledge chunks, feedback, few-shot examples, and corrections now require tenant-aware procedures and read/write against the active tenant.
- Site induction form configuration now carries tenant ownership. Site induction list/get/create/update/delete/reminder/PDF flows are tenant-scoped through the parent construction job, and trade portal induction access is constrained by the portal tenant.
- Plan conversions now carry first-class `tenantId` ownership. User/admin lists, job lists, create/update/delete, upload/extract/confirm/PDF/element update flows, and repair backfills are scoped to the active tenant.
- Approval workflow templates now carry first-class `tenantId` ownership. Template list/get/create/update/delete/duplicate/seed flows are scoped to the active tenant, and gate readiness reads the tenant-scoped template attached to the approval project.
- Approval RFI reply ingestion now matches open RFIs through the receiving mailbox tenant, stores inbound attachments under tenant-prefixed object keys, and updates linked inbox messages/RFIs with tenant guards. Client portal approval timelines now match approval projects through the portal/job tenant.
- Project subcontracts now carry first-class `tenantId` ownership. Subcontract create/list/get/update/delete/send/preview/installer-selection/claim-status flows are scoped to the active tenant through job, installer, or subcontract ownership.
- Email image libraries and plan-converter product/reference images now carry first-class `tenantId` ownership. Upload/list/search/update/delete/reorder/category bulk-update flows are scoped to the active tenant, and stored object keys are written beneath tenant-specific prefixes.
- CRM now requires active tenant context at the router boundary. Lead/quote notes and CRM document mutations are guarded through their parent lead/quote, CRM document/template uploads use tenant-prefixed storage keys, and CRM email templates now carry tenant ownership with tenant+letter-type uniqueness.
- Supplier feedback and scorecard flows were reviewed and already require tenant-scoped supplier access plus tenant-owned feedback rows.
- The system tenant repair tool now includes single-tenant membership repair, so imported/global users can be linked into the active tenant without adding tenant ownership to the global `users` table.
- The system tenant repair tool now sweeps recent tenant-owned support tables too, including portal CMS rows, process templates, and inbox support configuration, so single-tenant imported rows can be recovered if they are missing tenant ownership.
- Legacy master-data and pricing catalogue surfaces now carry tenant ownership and tenant-scoped procedures. This includes master data tabs, product catalogue rows, product CSV import/export, catalogue import, Skylux matrix pricing, colour groups, and colour-group members, with a migration to backfill existing rows to the active tenant.
- Climbo accounts and Google reviews now carry tenant ownership. Review account CRUD, review requests, manual review creation, review lists, and review stats are tenant-scoped, with a migration to backfill existing review data to the active tenant.
- Invitation admin flows now require tenant-admin context. Create/list/revoke/resend/bulk-create operations are scoped to the active tenant, invite acceptance attaches the user to the invited tenant membership, and invitation lookup has tenant-aware indexes.
- Engineering/specification text blocks now carry tenant ownership. Admin CRUD, image association, reordering, plan-converter reads, and active/category filtering are scoped to the active tenant, with a migration to backfill existing blocks.
- DA portal commission ledger, DA invoices, and DA personal details now carry tenant ownership. DA/admin commission, invoice, payment, dashboard summary, and Xero bill push flows are scoped to the active tenant, with a migration to backfill existing DA portal data.
- CPC plans, client portal subscriptions, and CPC service history now carry tenant ownership. Portal plan checkout/subscription reads, admin plan CRUD, and admin subscription/payment/stat reporting are scoped to the active tenant, with a migration to backfill existing CPC rows.
- AI render cost logs now carry tenant ownership. Render logging records the source tenant and the admin render-cost summary, adviser, project, monthly trend, and recent-log reports are scoped to the active tenant, with a migration to backfill existing logs.
- User profile availability is now tenant-scoped: schedule blocks, time-off, notification preferences, and "my assignments" reads/writes are bound to the active tenant. Notification preferences gained a tenant column and backfill migration.
- Portal CMS content is now tenant-scoped: client/trade/DA portal news and client portal product offers carry tenant ownership, admin CMS writes are tenant-bound, and all public portal reads filter to the active portal tenant. Existing news/products are backfilled by migration.
- Process templates are now tenant-scoped: Smartshop/order kit templates and construction Kanban seed templates carry tenant ownership, template list/get/update/delete/duplicate/apply flows are tenant-filtered, and existing templates are backfilled to the active tenant by migration.
- Inbox support configuration is now tenant-scoped: inbox tags, email signatures, inbox settings, and SLA rules carry tenant ownership, signature/tag/settings/SLA admin operations are tenant-filtered, Graph/legacy inbound auto-tags and auto-replies use the mailbox tenant, and the scheduled SLA checker iterates active tenants. Existing inbox support rows are backfilled by migration.
- Patio planner projects now carry tenant ownership. Planner CRUD, admin cleanup, quote-prefill, AI render generation/history/favourites/batch generation, portal render gallery reads, and render-cost project joins are scoped to the active tenant, and newly uploaded patio photos/renders use tenant-prefixed object keys. Existing patio projects are backfilled by migration.
- Security screen quote creation now uses the real `status` database column for quote status, fixing the failed `ss_quotes.ssQuoteStatus` insert generated when creating a quote from a lead or from the new quote form.
- The system tenant repair list now has schema-coverage parity for all current `tenantId` and `appTenantId` tables, including CPC, DA portal, review, render-log, screen-pricing, and legacy pricing/catalogue tables. The API Health repair preview now reports row counts requiring repair, and `pnpm tenant:repair:dry-run` / `pnpm tenant:repair:apply` provide a Railway-friendly repair command for production schema drift.

## Remaining high-priority tenant gaps

- Approval projects now carry `tenantId`, and the highest-risk workflow template/gate/RFI email paths have been tenant-scoped. Continue treating newly added approval child-row admin actions as requiring parent-project tenant checks during review.
- Admin pages/functions are not fully tenantised yet. Tenant/account management, integration settings, inbox admin/support settings, calendar views, people, invitations, supplier categories, portal access, trade portal access, CPC subscriptions, Nylas, VOCPhone, SignWell, planning intelligence, quote/proposal records, AI learning/settings, reviews, text blocks, DA portal financials, process templates, and legacy master-data/pricing catalogue surfaces are tenant-aware; remaining legacy admin template surfaces still need a dedicated pass.
- Several legacy routers still import plain `protectedProcedure` or `adminProcedure` for tenant-owned data. The highest-risk families to review next are remaining approvals child actions, legacy admin template/DA-adviser surfaces, and global notification/reporting flows.
- Resend webhooks/inbound handlers and `resendEmailId` columns remain as legacy compatibility/tracking surfaces. They are not required for normal O365 email sending.

## Production checks before enabling multi-tenant mode

- Re-run migrations on a staging clone and verify all legacy rows are backfilled to the default tenant.
- Production audit on 2026-06-18 found one active tenant and older production schema drift where several tenant-owned tables were still missing tenant columns. `pnpm tenant:repair:apply` was run against Railway production, creating 48 missing tenant columns and assigning 1,549 rows to tenant 1. Follow-up dry-run reported zero missing tenant columns and zero rows needing tenant repair.
- Connect Xero separately per tenant and confirm OAuth callback stores the correct `appTenantId`.
- Trigger Xero webhook intent validation with `XERO_WEBHOOK_KEY` set and confirm invalid signatures return 401.
- Run tenant A / tenant B smoke tests for App Central, Xero settings, supplier sync, import history, job financials, and unmatched transaction reporting.
- Reconnect Xero after scope changes so existing refresh tokens include `accounting.banktransactions.read`.
- Configure each tenant's O365/Graph mailbox under tenant integration settings before testing outbound email.
- Run tenant A / tenant B smoke tests for portal magic links, trade magic links, CRM letters, Smartshop notifications, Nylas calendar sync, VOCPhone webhooks, SignWell callbacks, Zapier lead ingestion, and planning scrapes.
