# AGENTS.md

## Operating Mode
- Treat the user's request as permission to implement unless they explicitly ask for discussion only.
- Read the relevant code before proposing or editing.
- Prefer existing project patterns over new abstractions.

## Pass Summaries
After each meaningful pass, report:
- What changed or was learned
- Remaining risks or gaps
- Recommended next action
- Whether to continue, test, refactor, deploy, or stop

## Worktree Safety
- Do not overwrite or revert user changes unless explicitly asked.
- Avoid destructive commands such as `git reset --hard`, `git checkout --`, or broad deletes.
- Before editing files with existing uncommitted changes, inspect them first.

## Scope Control
- Keep changes focused on the user's request.
- Avoid unrelated refactors, formatting churn, or dependency changes.
- Add abstractions only when they remove real complexity or match existing project style.

## Multi-Tenancy First
- Treat the application architecture as multi-tenant by default.
- Every user-facing feature, data model, query, background job, file/object path, cache key, webhook, and integration should account for tenant boundaries.
- Never assume global data access unless the code explicitly belongs to a system-admin or cross-tenant reporting workflow.
- Scope reads, writes, searches, exports, imports, notifications, audit logs, and analytics by tenant.
- Preserve tenant isolation in authorization checks, database constraints, API handlers, background workers, queues, storage, logs, and observability.
- Avoid adding shared mutable state, singleton records, or global settings unless they are clearly platform-level and safe across tenants.
- When introducing migrations or seed data, make tenant ownership explicit where applicable.
- For security-sensitive changes, consider whether a bug could expose, modify, or infer another tenant's data.

## Scheduled API Work
- Treat recurring external API calls, polling, syncs, imports, exports, refreshes, and maintenance tasks as scheduled cron jobs by default.
- Do not hide recurring API work behind page loads, user navigation, ad hoc admin actions, or ordinary request handlers.
- Make the schedule, owner, tenant scope, retry behavior, timeout, rate-limit handling, and failure logging explicit.
- Keep scheduled API jobs idempotent so they can safely retry or resume after partial failure.
- Store cursors, sync windows, and last-run state per tenant where applicable.
- Use request-driven API calls only when the user action genuinely requires immediate interactive behavior; recurring or batch follow-up work should still be moved into a scheduled job.

## Verification
- Run the smallest meaningful test or check after changes.
- If tests cannot be run, explain why and state the residual risk.
- For UI work, verify visually where possible across desktop and mobile viewports.

## Commit, Push, and Deploy
- For completed implementation work, finish the pass by committing and pushing the reviewed changes unless the user explicitly asks not to.
- For production-facing fixes or features, deploy after pushing when the repository and Railway context are available.
- Verify deployment completion before reporting success. A queued deploy is not enough; confirm the deployment reaches a successful/running state.
- Keep commits focused and describe the actual change. Do not bundle unrelated edits into the same commit.
- If the worktree contains unrelated user changes, leave them untouched and commit only the files required for the current task.

## Frontend Responsiveness
- Design and test every user-facing page at mobile, tablet, and desktop widths.
- Use responsive layout primitives such as flexible grids, wrapping rows, `minmax()`, `clamp()`, and sensible `min-width`/`max-width` constraints.
- Do not rely on fixed desktop widths for primary layouts, tables, dialogs, nav bars, forms, or toolbars.
- Ensure text, buttons, inputs, cards, and tables do not overflow, overlap, or become unusable on small screens.
- Prefer mobile-first CSS, then layer wider-screen enhancements with clear breakpoints.
- Make touch targets large enough for mobile use and preserve keyboard accessibility.
- For dense data, provide mobile-appropriate layouts such as stacked rows, horizontal scroll with clear affordance, or priority columns.

## Page Style Consistency
- Match new pages to the existing application shell, spacing scale, typography, color palette, component style, and interaction patterns.
- Reuse existing layout components, design tokens, UI primitives, icons, buttons, forms, tables, cards, tabs, and modals before creating new ones.
- Keep page hierarchy consistent: similar pages should use similar heading levels, action placement, filters, empty states, loading states, and error states.
- Do not introduce a new visual theme, one-off color system, border radius style, shadow treatment, or typography scale unless the request explicitly calls for redesign.
- Keep primary actions, secondary actions, destructive actions, and navigation in predictable locations across pages.
- Ensure repeated elements such as headers, sidebars, breadcrumbs, page titles, status badges, and footers behave consistently across breakpoints.
- Avoid page-specific CSS that duplicates or subtly diverges from existing shared styles.

## Dependencies
- Do not add new packages unless clearly justified.
- Prefer existing libraries, framework utilities, or standard tooling already in the repo.
- If adding a dependency, explain why it is needed.

## Code Quality
- Keep code typed, lint-clean, and consistent with local conventions.
- Avoid hidden global state and brittle string parsing when structured APIs are available.
- Add comments only where they clarify non-obvious logic.

## Security
- Never print, commit, or expose secrets.
- Treat auth, payments, file uploads, and database writes as high-risk areas.
- Validate inputs at trust boundaries.

## Database and Migrations
- Do not change schema casually.
- Preserve existing data.
- Include rollback or migration notes for risky changes.
- Apply SQL updates through the Railway CLI whenever production database access is required and the CLI context is available.
- Prefer the repo migration runner, for example `railway run --service <mysql-service> -- node scripts/apply-sql-migration.mjs drizzle/migrations/<migration>.sql`, so Railway-managed variables are used instead of copying database credentials manually.
- Run SQL migrations from the database service context when local execution needs the public database URL, and verify by rerunning the migration or checking the migration table.
- Do not print, paste, or commit database credentials while applying migrations.

## Final Response
End with:
- Files changed
- Tests/checks run
- Any known gaps
- Recommended next step
