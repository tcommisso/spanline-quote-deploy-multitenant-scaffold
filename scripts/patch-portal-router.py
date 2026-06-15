import re

with open("server/portal-router.ts", "r") as f:
    content = f.read()

# Add xeroProjectMappings to the schema import
content = content.replace(
    "constructionJobs, constructionProgress, clientActivities",
    "constructionJobs, constructionProgress, clientActivities, xeroProjectMappings"
)

# Add xero-client import after the crypto import
content = content.replace(
    'import crypto from "crypto";',
    'import crypto from "crypto";\nimport { getXeroProjectTasks, getXeroInvoices, XeroTask } from "./xero-client";'
)

# Add the getPaymentSchedule procedure before the closing of the router
new_procedure = '''
  // ─── Payment Schedule (from Xero Projects) ────────────────────────────────
  getPaymentSchedule: protectedPortalProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const jobId = ctx.portalAccess.constructionJobId;
    
    // Find the Xero project mapping for this job
    const [mapping] = await db
      .select()
      .from(xeroProjectMappings)
      .where(eq(xeroProjectMappings.constructionJobId, jobId))
      .limit(1);
    
    if (!mapping || !mapping.xeroProjectId) {
      return { schedule: [], summary: null, hasXeroProject: false };
    }
    
    try {
      // Fetch tasks from Xero Projects API
      const tasks = await getXeroProjectTasks(mapping.xeroProjectId);
      
      // Filter to FIXED charge type tasks (these are payment milestones)
      const milestones = tasks
        .filter((t: XeroTask) => t.chargeType === "FIXED" || t.chargeType === "NON_CHARGEABLE")
        .map((t: XeroTask) => ({
          id: t.taskId,
          name: t.name,
          amount: t.rate?.value || 0,
          currency: t.rate?.currency || "AUD",
          status: t.status,
          amountInvoiced: t.totalInvoiced?.value || 0,
          amountToBeInvoiced: t.totalToBeInvoiced?.value || 0,
          isInvoiced: (t.totalInvoiced?.value || 0) > 0,
          isPaid: t.status === "LOCKED" || t.status === "INVOICED",
        }));
      
      // Calculate summary
      const totalContract = milestones.reduce((sum: number, m: any) => sum + m.amount, 0);
      const totalInvoiced = milestones.reduce((sum: number, m: any) => sum + m.amountInvoiced, 0);
      const totalPaid = milestones.filter((m: any) => m.isPaid).reduce((sum: number, m: any) => sum + m.amountInvoiced, 0);
      const totalRemaining = totalContract - totalInvoiced;
      
      return {
        schedule: milestones,
        summary: {
          totalContract,
          totalInvoiced,
          totalPaid,
          totalRemaining,
          progressPercent: totalContract > 0 ? Math.round((totalInvoiced / totalContract) * 100) : 0,
        },
        hasXeroProject: true,
      };
    } catch (error) {
      console.error("[Portal] Failed to fetch Xero payment schedule:", error);
      return { schedule: [], summary: null, hasXeroProject: true, error: "Unable to load payment schedule" };
    }
  }),
'''

# Insert before the closing of the router
content = content.replace(
    "});\nexport type PortalRouter = typeof portalRouter;",
    new_procedure + "});\nexport type PortalRouter = typeof portalRouter;"
)

with open("server/portal-router.ts", "w") as f:
    f.write(content)

print("Patched portal-router.ts successfully")
