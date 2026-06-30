import { sql } from "drizzle-orm";
import { constructionJobs, crmLeads, type CrmLead, type ConstructionJob } from "../drizzle/schema";

export const ACTIVE_CONSTRUCTION_JOB_STATUSES = ["scheduled", "in_progress", "on_hold"] as const;
export const ACTIVE_CRM_CONSTRUCTION_STATUSES = ["contract", "building_authority", "construction", "won"] as const;

export type ConstructionJobStatus = ConstructionJob["status"];
export type CrmLeadStatus = CrmLead["status"];

export function isActiveConstructionJobStatus(status?: string | null): status is typeof ACTIVE_CONSTRUCTION_JOB_STATUSES[number] {
  return ACTIVE_CONSTRUCTION_JOB_STATUSES.includes(status as any);
}

export function isActiveCrmConstructionStatus(status?: string | null): status is typeof ACTIVE_CRM_CONSTRUCTION_STATUSES[number] {
  return ACTIVE_CRM_CONSTRUCTION_STATUSES.includes(status as any);
}

export function constructionStatusFromCrmStatus(
  crmStatus?: string | null,
  currentConstructionStatus?: string | null,
): ConstructionJobStatus | null {
  if (crmStatus === "completed") return "completed";
  if (crmStatus === "cancelled" || crmStatus === "lost") return "cancelled";
  if (isActiveCrmConstructionStatus(crmStatus)) {
    return isActiveConstructionJobStatus(currentConstructionStatus)
      ? currentConstructionStatus
      : "in_progress";
  }
  return (currentConstructionStatus as ConstructionJobStatus | null) || null;
}

export function crmStatusFromConstructionStatus(
  constructionStatus: ConstructionJobStatus,
  currentCrmStatus?: string | null,
): CrmLeadStatus | null {
  if (constructionStatus === "completed") return "completed";
  if (constructionStatus === "cancelled") return "cancelled";
  if (constructionStatus === "scheduled" || constructionStatus === "in_progress" || constructionStatus === "on_hold") {
    return isActiveCrmConstructionStatus(currentCrmStatus)
      ? currentCrmStatus as CrmLeadStatus
      : "construction";
  }
  return (currentCrmStatus as CrmLeadStatus | null) || null;
}

export function constructionLifecycleStatusSql() {
  return sql<ConstructionJobStatus>`CASE
    WHEN ${crmLeads.id} IS NOT NULL AND ${crmLeads.archived} = false AND ${crmLeads.status} = 'completed' THEN 'completed'
    WHEN ${crmLeads.id} IS NOT NULL AND ${crmLeads.archived} = false AND ${crmLeads.status} IN ('lost', 'cancelled') THEN 'cancelled'
    WHEN ${crmLeads.id} IS NOT NULL AND ${crmLeads.archived} = false AND ${crmLeads.status} IN ('contract', 'building_authority', 'construction', 'won') THEN
      CASE
        WHEN ${constructionJobs.status} IN ('scheduled', 'in_progress', 'on_hold') THEN ${constructionJobs.status}
        ELSE 'in_progress'
      END
    ELSE ${constructionJobs.status}
  END`;
}
