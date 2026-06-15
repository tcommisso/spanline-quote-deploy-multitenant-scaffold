#!/usr/bin/env python3
"""Add getProjectPaymentSchedule and getJobFinancialSummary procedures to xero-projects-router."""

filepath = "/home/ubuntu/spanline-quote/server/xero-projects-router.ts"

with open(filepath, "r") as f:
    content = f.read()

# Check if already patched
if "getProjectPaymentSchedule" in content:
    print("Already patched - getProjectPaymentSchedule exists")
    exit(0)

# Add missing schema imports
content = content.replace(
    "  constructionJobFinancials,\n} from \"../drizzle/schema\";",
    "  constructionJobFinancials,\n  purchaseOrderMilestones,\n  tradeInvoices,\n} from \"../drizzle/schema\";"
)

new_procedures = '''  // ─── Get Payment Schedule (Tasks) for a Project ─────────────────────────────
  /** Fetches FIXED tasks from a Xero project = client payment milestones */
  getProjectPaymentSchedule: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { milestones: [], project: null, invoices: [] };
      const auth = await getValidAccessToken();
      if (!auth) return { milestones: [], project: null, invoices: [] };
      // Find the project mapping for this job
      const [mapping] = await db
        .select()
        .from(xeroProjectMappings)
        .where(and(
          eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId),
          eq(xeroProjectMappings.jobId, input.jobId)
        ));
      if (!mapping) return { milestones: [], project: null, invoices: [] };
      try {
        // Fetch the project details
        const project = await xeroApiRequest<any>(
          `/projects/projects/${mapping.xeroProjectId}`
        );
        // Fetch all tasks for the project
        const tasksResult = await xeroApiRequest<{ pagination: any; items: any[] }>(
          `/projects/projects/${mapping.xeroProjectId}/tasks?pageSize=100`
        );
        // Filter to FIXED tasks (payment milestones) and map to a clean structure
        const milestones = (tasksResult.items || [])
          .filter((t: any) => t.chargeType === "FIXED")
          .map((t: any) => ({
            taskId: t.taskId,
            name: t.name,
            amount: t.rate?.value || 0,
            currency: t.rate?.currency || "AUD",
            status: t.status, // ACTIVE, INVOICED, LOCKED
            amountInvoiced: t.amountInvoiced?.value || 0,
            amountToBeInvoiced: t.amountToBeInvoiced?.value || 0,
            isFullyInvoiced: t.status === "INVOICED" || (t.amountToBeInvoiced?.value || 0) === 0,
          }));
        // Also fetch ACCREC invoices for this contact to check payment status
        let invoices: any[] = [];
        if (mapping.xeroContactId) {
          try {
            const invResult = await xeroApiRequest<{ Invoices: any[] }>(
              `/Invoices?ContactIDs=${mapping.xeroContactId}&Statuses=AUTHORISED,PAID`
            );
            invoices = (invResult.Invoices || [])
              .filter((inv: any) => inv.Type === "ACCREC")
              .map((inv: any) => ({
                invoiceId: inv.InvoiceID,
                invoiceNumber: inv.InvoiceNumber,
                reference: inv.Reference || "",
                total: inv.Total || 0,
                amountPaid: inv.AmountPaid || 0,
                amountDue: inv.AmountDue || 0,
                status: inv.Status,
                date: inv.DateString,
                dueDate: inv.DueDateString,
              }));
          } catch (e) {
            // Non-critical - continue without invoice details
          }
        }
        return {
          project: {
            projectId: project.projectId,
            name: project.name,
            status: project.status,
            estimate: project.estimate?.value || 0,
            totalInvoiced: project.totalInvoiced?.value || 0,
            totalToBeInvoiced: project.totalToBeInvoiced?.value || 0,
            deposit: project.deposit?.value || 0,
            depositApplied: project.depositApplied?.value || 0,
          },
          milestones,
          invoices,
        };
      } catch (err: any) {
        console.error("[Xero] Failed to fetch payment schedule:", err.message);
        return { milestones: [], project: null, invoices: [] };
      }
    }),
  // ─── Get Job Financial Summary (combined client + trade view) ────────────────
  getJobFinancialSummary: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      // Get the job's project mapping for client-side financials
      const auth = await getValidAccessToken();
      let mapping: any = null;
      if (auth) {
        const [m] = await db
          .select()
          .from(xeroProjectMappings)
          .where(and(
            eq(xeroProjectMappings.xeroConnectionId, auth.xeroConnectionId),
            eq(xeroProjectMappings.jobId, input.jobId)
          ));
        mapping = m || null;
      }
      // Get trade-side financials from PO milestones
      const poMilestones = await db
        .select()
        .from(purchaseOrderMilestones)
        .where(eq(purchaseOrderMilestones.jobId, input.jobId));
      // Get trade invoices for this job
      const tInvoices = await db
        .select()
        .from(tradeInvoices)
        .where(eq(tradeInvoices.jobId, input.jobId));
      // Calculate trade-side totals
      const tradePOTotal = poMilestones.reduce((sum, m) => sum + parseFloat(m.amount || "0"), 0);
      const tradeRetentionHeld = poMilestones
        .filter(m => m.status === "completed" || m.status === "approved")
        .reduce((sum, m) => sum + parseFloat(m.retentionAmount || "0"), 0);
      const tradeInvoicedTotal = tInvoices
        .filter(i => i.status !== "rejected")
        .reduce((sum, i) => sum + parseFloat(i.totalAmount || "0"), 0);
      const tradePaidTotal = tInvoices
        .filter(i => i.status === "paid")
        .reduce((sum, i) => sum + parseFloat(i.totalAmount || "0"), 0);
      return {
        clientSide: {
          contractValue: mapping ? parseFloat(mapping.totalInvoiced || "0") + parseFloat(mapping.estimatedCost || "0") : 0,
          invoiced: mapping ? parseFloat(mapping.totalInvoiced || "0") : 0,
          estimate: mapping ? parseFloat(mapping.estimatedCost || "0") : 0,
          xeroProjectLinked: !!mapping,
        },
        tradeSide: {
          poTotal: tradePOTotal,
          invoiced: tradeInvoicedTotal,
          paid: tradePaidTotal,
          retentionHeld: tradeRetentionHeld,
          remaining: tradePOTotal - tradePaidTotal,
          poCount: poMilestones.length,
          invoiceCount: tInvoices.length,
        },
        margin: mapping
          ? (parseFloat(mapping.estimatedCost || "0") || parseFloat(mapping.totalInvoiced || "0")) - tradePOTotal
          : 0,
      };
    }),
'''

# Find the closing `});` of the router (around line 1004)
lines = content.split('\n')
insert_at = None
for i, line in enumerate(lines):
    if line.strip() == '});' and i > 900:
        insert_at = i
        break

if insert_at is None:
    print("ERROR: Could not find router closing bracket")
    exit(1)

# Insert the new procedures before the closing bracket
lines.insert(insert_at, new_procedures)
content = '\n'.join(lines)

with open(filepath, "w") as f:
    f.write(content)

print(f"Successfully patched {filepath}")
print(f"Inserted new procedures at line {insert_at}")
