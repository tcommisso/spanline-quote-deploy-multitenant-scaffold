import { and, asc, desc, eq } from "drizzle-orm";
import {
  branches,
  constructionJobs,
  crmLeads,
  designAdvisors,
  portalContacts,
  tenantMemberships,
  users,
} from "../drizzle/schema";
import { appendTenantScope } from "./_core/tenant-scope";

type StaffRow = typeof designAdvisors.$inferSelect;
type PortalContactRow = typeof portalContacts.$inferSelect;
type BranchRow = typeof branches.$inferSelect;

type ContactSlotKey = "branch_admin" | "construction_manager" | "design_adviser" | "finance";
type ResolvedSource =
  | "manual_override"
  | "branch_default"
  | "job_design_adviser"
  | "crm_design_adviser"
  | "missing"
  | "extra";

type ContactSlot = {
  key: ContactSlotKey;
  role: string;
  placeholderName: string;
  sortOrder: number;
  branchDefaultField?: keyof Pick<
    BranchRow,
    "defaultBranchAdminStaffId" | "defaultConstructionManagerStaffId" | "defaultFinanceStaffId"
  >;
};

const CONTACT_SLOTS: ContactSlot[] = [
  {
    key: "branch_admin",
    role: "Branch Admin Contact",
    placeholderName: "Branch Admin Contact",
    sortOrder: 0,
    branchDefaultField: "defaultBranchAdminStaffId",
  },
  {
    key: "construction_manager",
    role: "Construction Manager Contact",
    placeholderName: "Construction Manager Contact",
    sortOrder: 1,
    branchDefaultField: "defaultConstructionManagerStaffId",
  },
  {
    key: "design_adviser",
    role: "Design Adviser Contact",
    placeholderName: "Design Adviser Contact",
    sortOrder: 2,
  },
  {
    key: "finance",
    role: "Finance Contact",
    placeholderName: "Finance Contact",
    sortOrder: 3,
    branchDefaultField: "defaultFinanceStaffId",
  },
];

export type ResolvedClientPortalContact = {
  id: number | string;
  constructionJobId: number;
  staffId: number | null;
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  profileDescription: string | null;
  photoUrl: string | null;
  sortOrder: number;
  slotKey: ContactSlotKey | "extra";
  source: ResolvedSource;
  sourceLabel: string;
  isDefaultSlot: boolean;
  isMissing: boolean;
  canEdit: boolean;
  branchId: number | null;
  branchName: string | null;
  warning: string | null;
};

function normalise(value?: string | null) {
  return value?.trim().toLowerCase() || "";
}

function normaliseRoleKey(role?: string | null): ContactSlotKey | null {
  const value = normalise(role).replace(/[_-]/g, " ");
  if (!value) return null;
  if (value.includes("design adviser") || value.includes("design advisor")) return "design_adviser";
  if (value.includes("construction") || value.includes("site supervisor") || value.includes("project manager")) {
    return "construction_manager";
  }
  if (value.includes("finance") || value.includes("account") || value.includes("invoice") || value.includes("billing")) {
    return "finance";
  }
  if (value.includes("branch admin") || value.includes("admin") || value.includes("office manager")) {
    return "branch_admin";
  }
  return null;
}

function sourceLabel(source: ResolvedSource) {
  switch (source) {
    case "manual_override":
      return "Job override";
    case "branch_default":
      return "Branch default";
    case "job_design_adviser":
      return "Job design adviser";
    case "crm_design_adviser":
      return "CRM design adviser";
    case "extra":
      return "Additional contact";
    case "missing":
    default:
      return "Setup required";
  }
}

function contactFromStaff(
  staff: StaffRow,
  slot: ContactSlot,
  jobId: number,
  source: ResolvedSource,
  branch: BranchRow | null,
  warning: string | null = null,
): ResolvedClientPortalContact {
  return {
    id: `default:${slot.key}`,
    constructionJobId: jobId,
    staffId: staff.id,
    name: staff.name,
    role: slot.role,
    phone: staff.phone || null,
    email: staff.email || null,
    profileDescription: staff.profileDescription || null,
    photoUrl: staff.photoUrl || null,
    sortOrder: slot.sortOrder,
    slotKey: slot.key,
    source,
    sourceLabel: sourceLabel(source),
    isDefaultSlot: true,
    isMissing: false,
    canEdit: false,
    branchId: branch?.id ?? staff.branchId ?? null,
    branchName: branch?.name ?? null,
    warning,
  };
}

function contactFromManual(
  contact: PortalContactRow,
  slotKey: ContactSlotKey | "extra",
  source: ResolvedSource,
  branch: BranchRow | null,
): ResolvedClientPortalContact {
  const slotSortOrder = slotKey === "extra"
    ? 100 + (contact.sortOrder || 0)
    : CONTACT_SLOTS.find((slot) => slot.key === slotKey)?.sortOrder ?? (contact.sortOrder || 0);

  return {
    id: contact.id,
    constructionJobId: contact.constructionJobId,
    staffId: contact.staffId || null,
    name: contact.name,
    role: contact.role,
    phone: contact.phone || null,
    email: contact.email || null,
    profileDescription: contact.profileDescription || null,
    photoUrl: contact.photoUrl || null,
    sortOrder: slotSortOrder,
    slotKey,
    source,
    sourceLabel: sourceLabel(source),
    isDefaultSlot: slotKey !== "extra",
    isMissing: false,
    canEdit: true,
    branchId: branch?.id ?? null,
    branchName: branch?.name ?? null,
    warning: null,
  };
}

function missingContact(slot: ContactSlot, jobId: number, branch: BranchRow | null, warning: string): ResolvedClientPortalContact {
  return {
    id: `missing:${slot.key}`,
    constructionJobId: jobId,
    staffId: null,
    name: slot.placeholderName,
    role: slot.role,
    phone: null,
    email: null,
    profileDescription: "Contact details to be confirmed.",
    photoUrl: null,
    sortOrder: slot.sortOrder,
    slotKey: slot.key,
    source: "missing",
    sourceLabel: sourceLabel("missing"),
    isDefaultSlot: true,
    isMissing: true,
    canEdit: false,
    branchId: branch?.id ?? null,
    branchName: branch?.name ?? null,
    warning,
  };
}

function contactFromDesignUser(
  user: { id: number; name: string | null; email: string | null } | null,
  name: string | null,
  slot: ContactSlot,
  jobId: number,
  source: ResolvedSource,
  branch: BranchRow | null,
): ResolvedClientPortalContact | null {
  const displayName = user?.name || name || user?.email || null;
  if (!displayName) return null;
  return {
    id: `default:${slot.key}`,
    constructionJobId: jobId,
    staffId: null,
    name: displayName,
    role: slot.role,
    phone: null,
    email: user?.email || null,
    profileDescription: "Your design contact for specification and contract questions.",
    photoUrl: null,
    sortOrder: slot.sortOrder,
    slotKey: slot.key,
    source,
    sourceLabel: sourceLabel(source),
    isDefaultSlot: true,
    isMissing: false,
    canEdit: false,
    branchId: branch?.id ?? null,
    branchName: branch?.name ?? null,
    warning: "Add this design adviser to People to show phone, profile, and photo details.",
  };
}

export async function resolveClientPortalContacts(db: any, jobId: number, tenantId?: number | null) {
  const jobConditions: any[] = [eq(constructionJobs.id, jobId)];
  appendTenantScope(jobConditions, constructionJobs.tenantId, tenantId);

  const leadJoinConditions: any[] = [eq(crmLeads.id, constructionJobs.leadId)];
  appendTenantScope(leadJoinConditions, crmLeads.tenantId, tenantId);

  const [jobRow] = await db.select({
    id: constructionJobs.id,
    leadId: constructionJobs.leadId,
    designAdviserId: constructionJobs.designAdviserId,
    designAdviserName: constructionJobs.designAdviserName,
    leadBranchId: crmLeads.branchId,
    leadDesignAdvisor: crmLeads.designAdvisor,
  })
    .from(constructionJobs)
    .leftJoin(crmLeads, and(...leadJoinConditions))
    .where(and(...jobConditions))
    .limit(1);

  if (!jobRow) return [];

  const staffConditions: any[] = [eq(designAdvisors.archived, false)];
  appendTenantScope(staffConditions, designAdvisors.tenantId, tenantId);
  const staffRows = await db.select()
    .from(designAdvisors)
    .where(and(...staffConditions))
    .orderBy(asc(designAdvisors.name));

  const staffById = new Map<number, StaffRow>();
  const staffByUserId = new Map<number, StaffRow>();
  const staffByName = new Map<string, StaffRow>();
  for (const staff of staffRows as StaffRow[]) {
    staffById.set(staff.id, staff);
    if (staff.userId) staffByUserId.set(staff.userId, staff);
    const nameKey = normalise(staff.name);
    if (nameKey && !staffByName.has(nameKey)) staffByName.set(nameKey, staff);
  }

  const branchConditions: any[] = [];
  appendTenantScope(branchConditions, branches.tenantId, tenantId);
  const branchRows = await db.select()
    .from(branches)
    .where(branchConditions.length ? and(...branchConditions) : undefined)
    .orderBy(desc(branches.isActive), asc(branches.name));

  const branchesById = new Map<number, BranchRow>((branchRows as BranchRow[]).map((branch) => [branch.id, branch]));
  const designAdvisorName = jobRow.designAdviserName || jobRow.leadDesignAdvisor || null;
  const designAdvisorStaff =
    (jobRow.designAdviserId ? staffByUserId.get(jobRow.designAdviserId) : null)
    || staffByName.get(normalise(designAdvisorName));

  let branch: BranchRow | null = jobRow.leadBranchId ? branchesById.get(jobRow.leadBranchId) || null : null;
  if (!branch && designAdvisorStaff?.branchId) {
    branch = branchesById.get(designAdvisorStaff.branchId) || null;
  }
  if (!branch) {
    branch = (branchRows as BranchRow[]).find((row) => row.isActive) || (branchRows as BranchRow[])[0] || null;
  }

  let designAdvisorUser: { id: number; name: string | null; email: string | null } | null = null;
  if (!designAdvisorStaff && jobRow.designAdviserId) {
    const userConditions = [eq(users.id, jobRow.designAdviserId)];
    const [userRow] = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
      .from(users)
      .innerJoin(tenantMemberships, eq(tenantMemberships.userId, users.id))
      .where(and(
        ...userConditions,
        eq(tenantMemberships.tenantId, tenantId || 0),
      ))
      .limit(1);
    designAdvisorUser = userRow || null;
  }

  const manualContacts = await db.select()
    .from(portalContacts)
    .where(eq(portalContacts.constructionJobId, jobId))
    .orderBy(asc(portalContacts.sortOrder));

  const manualBySlot = new Map<ContactSlotKey, PortalContactRow>();
  const extras: PortalContactRow[] = [];
  for (const contact of manualContacts as PortalContactRow[]) {
    const slotKey = normaliseRoleKey(contact.role);
    if (slotKey && !manualBySlot.has(slotKey)) {
      manualBySlot.set(slotKey, contact);
    } else {
      extras.push(contact);
    }
  }

  const resolved: ResolvedClientPortalContact[] = [];

  for (const slot of CONTACT_SLOTS) {
    const manual = manualBySlot.get(slot.key);
    if (manual) {
      resolved.push(contactFromManual(manual, slot.key, "manual_override", branch));
      continue;
    }

    if (slot.key === "design_adviser") {
      if (designAdvisorStaff) {
        resolved.push(contactFromStaff(
          designAdvisorStaff,
          slot,
          jobId,
          jobRow.designAdviserId ? "job_design_adviser" : "crm_design_adviser",
          branch,
        ));
        continue;
      }

      const designContact = contactFromDesignUser(
        designAdvisorUser,
        designAdvisorName,
        slot,
        jobId,
        jobRow.designAdviserId ? "job_design_adviser" : "crm_design_adviser",
        branch,
      );
      if (designContact) {
        resolved.push(designContact);
        continue;
      }

      resolved.push(missingContact(slot, jobId, branch, "No design adviser is linked to this job or CRM lead."));
      continue;
    }

    const defaultStaffId = slot.branchDefaultField && branch ? branch[slot.branchDefaultField] : null;
    const defaultStaff = defaultStaffId ? staffById.get(defaultStaffId) : null;
    if (defaultStaff) {
      resolved.push(contactFromStaff(defaultStaff, slot, jobId, "branch_default", branch));
      continue;
    }

    const warning = branch
      ? `${slot.role} is not configured for ${branch.name}.`
      : `${slot.role} needs a branch default, but this job is not linked to a branch.`;
    resolved.push(missingContact(slot, jobId, branch, warning));
  }

  for (const extra of extras) {
    resolved.push(contactFromManual(extra, "extra", "extra", branch));
  }

  return resolved.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}
