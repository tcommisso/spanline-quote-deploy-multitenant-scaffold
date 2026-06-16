import { getDb } from "./db";
import { eq, desc, and, sql, like, or, inArray, isNull } from "drizzle-orm";
import {
  approvalProjects, approvalWorkflowTemplates, approvalLodgements,
  approvalDocuments, approvalDocumentVersions, approvalRfis,
  approvalConditions, approvalTasks, approvalInspections,
  approvalInspectionDefects, approvalFees, approvalCertificates,
  approvalAuditLog, approvalPathwayAssessments,
  type InsertApprovalProject, type InsertApprovalLodgement,
  type InsertApprovalDocument, type InsertApprovalDocumentVersion,
  type InsertApprovalRfi, type InsertApprovalCondition,
  type InsertApprovalTask, type InsertApprovalInspection,
  type InsertApprovalInspectionDefect, type InsertApprovalFee,
  type InsertApprovalCertificate, type InsertApprovalAuditLogEntry,
  type InsertApprovalPathwayAssessment, type InsertApprovalWorkflowTemplate,
} from "../drizzle/schema";
import { getProjectHbcfGateStatus } from "./hbcf-service";

// ─── Project Number Generator ───────────────────────────────────────────────
export async function generateProjectNumber(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [latest] = await db.select({ projectNumber: approvalProjects.projectNumber })
    .from(approvalProjects)
    .orderBy(desc(approvalProjects.id))
    .limit(1);
  const year = new Date().getFullYear().toString().slice(-2);
  if (!latest) return `BA-${year}-0001`;
  const match = latest.projectNumber.match(/BA-\d{2}-(\d{4})/);
  const next = match ? (parseInt(match[1]) + 1).toString().padStart(4, "0") : "0001";
  return `BA-${year}-${next}`;
}

// ─── Approval Projects ──────────────────────────────────────────────────────
export async function createApprovalProject(data: InsertApprovalProject) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(approvalProjects).values(data).$returningId();
  return result.id;
}

export async function getApprovalProjects(filters?: { status?: string; jurisdiction?: string; search?: string }) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(approvalProjects).orderBy(desc(approvalProjects.updatedAt));
  const conditions: any[] = [];
  if (filters?.status && filters.status !== "all") {
    conditions.push(eq(approvalProjects.overallStatus, filters.status as any));
  }
  if (filters?.jurisdiction && filters.jurisdiction !== "all") {
    conditions.push(eq(approvalProjects.jurisdiction, filters.jurisdiction as any));
  }
  if (filters?.search) {
    const term = `%${filters.search}%`;
    conditions.push(or(
      like(approvalProjects.name, term),
      like(approvalProjects.projectNumber, term),
      like(approvalProjects.clientName, term),
      like(approvalProjects.propertyAddress, term),
    ));
  }
  if (conditions.length > 0) {
    return db.select().from(approvalProjects).where(and(...conditions)).orderBy(desc(approvalProjects.updatedAt));
  }
  return query;
}

export async function getApprovalProjectById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [project] = await db.select().from(approvalProjects).where(eq(approvalProjects.id, id)).limit(1);
  return project || null;
}

export async function updateApprovalProject(id: number, data: Partial<InsertApprovalProject>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(approvalProjects).set(data).where(eq(approvalProjects.id, id));
}

export async function deleteApprovalProject(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(approvalProjects).where(eq(approvalProjects.id, id));
}

// ─── Workflow Templates ─────────────────────────────────────────────────────
export async function getWorkflowTemplates(jurisdiction?: string) {
  const db = await getDb();
  if (!db) return [];
  if (jurisdiction && jurisdiction !== "all") {
    return db.select().from(approvalWorkflowTemplates)
      .where(and(eq(approvalWorkflowTemplates.active, true), eq(approvalWorkflowTemplates.jurisdiction, jurisdiction as any)))
      .orderBy(desc(approvalWorkflowTemplates.updatedAt));
  }
  return db.select().from(approvalWorkflowTemplates)
    .where(eq(approvalWorkflowTemplates.active, true))
    .orderBy(desc(approvalWorkflowTemplates.updatedAt));
}

export async function getWorkflowTemplateById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [template] = await db.select().from(approvalWorkflowTemplates).where(eq(approvalWorkflowTemplates.id, id)).limit(1);
  return template || null;
}

export async function createWorkflowTemplate(data: InsertApprovalWorkflowTemplate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(approvalWorkflowTemplates).values(data).$returningId();
  return result.id;
}

export async function updateWorkflowTemplate(id: number, data: Partial<InsertApprovalWorkflowTemplate>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(approvalWorkflowTemplates).set(data).where(eq(approvalWorkflowTemplates.id, id));
}

export async function deleteWorkflowTemplate(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(approvalWorkflowTemplates).set({ active: false }).where(eq(approvalWorkflowTemplates.id, id));
}

// ─── Lodgements ─────────────────────────────────────────────────────────────
export async function createLodgement(data: InsertApprovalLodgement) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(approvalLodgements).values(data).$returningId();
  return result.id;
}

export async function getLodgementsByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(approvalLodgements)
    .where(eq(approvalLodgements.projectId, projectId))
    .orderBy(desc(approvalLodgements.createdAt));
}

export async function getLodgementById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [lodgement] = await db.select().from(approvalLodgements).where(eq(approvalLodgements.id, id)).limit(1);
  return lodgement || null;
}

export async function updateLodgement(id: number, data: Partial<InsertApprovalLodgement>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(approvalLodgements).set(data).where(eq(approvalLodgements.id, id));
}

// ─── Documents ──────────────────────────────────────────────────────────────
export async function createDocument(data: InsertApprovalDocument) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(approvalDocuments).values(data).$returningId();
  return result.id;
}

export async function getDocumentsByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(approvalDocuments)
    .where(eq(approvalDocuments.projectId, projectId))
    .orderBy(desc(approvalDocuments.updatedAt));
}

export async function getDocumentById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [doc] = await db.select().from(approvalDocuments).where(eq(approvalDocuments.id, id)).limit(1);
  return doc || null;
}

export async function updateDocument(id: number, data: Partial<InsertApprovalDocument>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(approvalDocuments).set(data).where(eq(approvalDocuments.id, id));
}

export async function createDocumentVersion(data: InsertApprovalDocumentVersion) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(approvalDocumentVersions).values(data).$returningId();
  // Update parent document
  await db.update(approvalDocuments).set({
    currentVersionId: result.id,
    versionCount: sql`${approvalDocuments.versionCount} + 1`,
  }).where(eq(approvalDocuments.id, data.documentId));
  return result.id;
}

export async function getDocumentVersions(documentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(approvalDocumentVersions)
    .where(eq(approvalDocumentVersions.documentId, documentId))
    .orderBy(desc(approvalDocumentVersions.versionNumber));
}

// ─── RFIs ───────────────────────────────────────────────────────────────────
export async function createRfi(data: InsertApprovalRfi) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(approvalRfis).values(data).$returningId();
  return result.id;
}

export async function getRfisByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(approvalRfis)
    .where(eq(approvalRfis.projectId, projectId))
    .orderBy(desc(approvalRfis.createdAt));
}

export async function getRfiById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [rfi] = await db.select().from(approvalRfis).where(eq(approvalRfis.id, id)).limit(1);
  return rfi || null;
}

export async function updateRfi(id: number, data: Partial<InsertApprovalRfi>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(approvalRfis).set(data).where(eq(approvalRfis.id, id));
}

/**
 * Find open/in_progress RFIs that match a subject line (for email reply ingestion).
 * Matches by RFI number pattern [RFI-xxx] or by subject substring.
 */
export async function findRfiBySubjectMatch(subject: string) {
  const db = await getDb();
  if (!db) return null;

  // Try to extract RFI number from subject (e.g. "[RFI-5]" or "RFI #5")
  const rfiNumberMatch = subject.match(/\[?RFI[- #]*(\d+)\]?/i);
  if (rfiNumberMatch) {
    const rfiNum = rfiNumberMatch[1];
    const [match] = await db.select().from(approvalRfis)
      .where(and(
        eq(approvalRfis.rfiNumber, rfiNum),
        inArray(approvalRfis.status, ["open", "in_progress", "overdue"])
      ))
      .limit(1);
    if (match) return match;
  }

  // Fallback: try to match by subject substring (strip Re:/Fwd: prefixes)
  const cleanSubject = subject.replace(/^(Re:|Fwd:|FW:|RE:)\s*/gi, "").trim();
  if (cleanSubject.length > 5) {
    const [match] = await db.select().from(approvalRfis)
      .where(and(
        like(approvalRfis.subject, `%${cleanSubject.slice(0, 80)}%`),
        inArray(approvalRfis.status, ["open", "in_progress", "overdue"])
      ))
      .limit(1);
    if (match) return match;
  }

  return null;
}

// ─── Conditions ─────────────────────────────────────────────────────────────
export async function createCondition(data: InsertApprovalCondition) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(approvalConditions).values(data).$returningId();
  return result.id;
}

export async function getConditionsByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(approvalConditions)
    .where(eq(approvalConditions.projectId, projectId))
    .orderBy(approvalConditions.conditionNumber);
}

export async function updateCondition(id: number, data: Partial<InsertApprovalCondition>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(approvalConditions).set(data).where(eq(approvalConditions.id, id));
}

// ─── Tasks ──────────────────────────────────────────────────────────────────
export async function createTask(data: InsertApprovalTask) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(approvalTasks).values(data).$returningId();
  return result.id;
}

export async function getTasksByProject(projectId: number, includeCompleted = false) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(approvalTasks.projectId, projectId)];
  if (!includeCompleted) {
    conditions.push(sql`${approvalTasks.status} != 'completed'`);
    conditions.push(sql`${approvalTasks.status} != 'skipped'`);
  }
  return db.select().from(approvalTasks)
    .where(and(...conditions))
    .orderBy(approvalTasks.priority, approvalTasks.dueAt);
}

export async function updateTask(id: number, data: Partial<InsertApprovalTask>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(approvalTasks).set(data).where(eq(approvalTasks.id, id));
}

// ─── Inspections ────────────────────────────────────────────────────────────
export async function createInspection(data: InsertApprovalInspection) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(approvalInspections).values(data).$returningId();
  return result.id;
}

export async function getInspectionsByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(approvalInspections)
    .where(eq(approvalInspections.projectId, projectId))
    .orderBy(approvalInspections.scheduledDate);
}

export async function updateInspection(id: number, data: Partial<InsertApprovalInspection>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(approvalInspections).set(data).where(eq(approvalInspections.id, id));
}

// ─── Inspection Defects ─────────────────────────────────────────────────────
export async function createDefect(data: InsertApprovalInspectionDefect) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(approvalInspectionDefects).values(data).$returningId();
  // Update inspection defect count
  await db.update(approvalInspections).set({
    hasDefects: true,
    defectCount: sql`${approvalInspections.defectCount} + 1`,
  }).where(eq(approvalInspections.id, data.inspectionId));
  return result.id;
}

export async function getDefectsByInspection(inspectionId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(approvalInspectionDefects)
    .where(eq(approvalInspectionDefects.inspectionId, inspectionId))
    .orderBy(desc(approvalInspectionDefects.createdAt));
}

export async function updateDefect(id: number, data: Partial<InsertApprovalInspectionDefect>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(approvalInspectionDefects).set(data).where(eq(approvalInspectionDefects.id, id));
}

// ─── Fees ───────────────────────────────────────────────────────────────────
export async function createFee(data: InsertApprovalFee) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(approvalFees).values(data).$returningId();
  return result.id;
}

export async function getFeesByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(approvalFees)
    .where(eq(approvalFees.projectId, projectId))
    .orderBy(desc(approvalFees.createdAt));
}

export async function updateFee(id: number, data: Partial<InsertApprovalFee>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(approvalFees).set(data).where(eq(approvalFees.id, id));
}

// ─── Certificates ───────────────────────────────────────────────────────────
export async function createCertificate(data: InsertApprovalCertificate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(approvalCertificates).values(data).$returningId();
  return result.id;
}

export async function getCertificatesByProject(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(approvalCertificates)
    .where(eq(approvalCertificates.projectId, projectId))
    .orderBy(desc(approvalCertificates.issuedAt));
}

// ─── Pathway Assessments ────────────────────────────────────────────────────
export async function createPathwayAssessment(data: InsertApprovalPathwayAssessment) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Supersede previous assessments for this project
  await db.update(approvalPathwayAssessments)
    .set({ supersededAt: new Date() })
    .where(and(eq(approvalPathwayAssessments.projectId, data.projectId), isNull(approvalPathwayAssessments.supersededAt)));
  const [result] = await db.insert(approvalPathwayAssessments).values(data).$returningId();
  return result.id;
}

export async function getLatestPathwayAssessment(projectId: number) {
  const db = await getDb();
  if (!db) return null;
  const [assessment] = await db.select().from(approvalPathwayAssessments)
    .where(and(eq(approvalPathwayAssessments.projectId, projectId), isNull(approvalPathwayAssessments.supersededAt)))
    .orderBy(desc(approvalPathwayAssessments.assessedAt))
    .limit(1);
  return assessment || null;
}

// ─── Audit Log ──────────────────────────────────────────────────────────────
export async function createAuditEntry(data: InsertApprovalAuditLogEntry) {
  const db = await getDb();
  if (!db) return;
  await db.insert(approvalAuditLog).values(data);
}

export async function getAuditLogByProject(projectId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(approvalAuditLog)
    .where(eq(approvalAuditLog.projectId, projectId))
    .orderBy(desc(approvalAuditLog.createdAt))
    .limit(limit);
}

// ─── Dashboard Aggregates ───────────────────────────────────────────────────
export async function getApprovalsDashboardStats() {
  const db = await getDb();
  if (!db) return { total: 0, intake: 0, active: 0, onHold: 0, completed: 0, openRfis: 0, overdueRfis: 0, pendingInspections: 0 };
  
  const [projectStats] = await db.select({
    total: sql<number>`COUNT(*)`,
    intake: sql<number>`SUM(CASE WHEN ${approvalProjects.overallStatus} = 'intake' THEN 1 ELSE 0 END)`,
    active: sql<number>`SUM(CASE WHEN ${approvalProjects.overallStatus} = 'active' THEN 1 ELSE 0 END)`,
    onHold: sql<number>`SUM(CASE WHEN ${approvalProjects.overallStatus} = 'on_hold' THEN 1 ELSE 0 END)`,
    completed: sql<number>`SUM(CASE WHEN ${approvalProjects.overallStatus} = 'completed' THEN 1 ELSE 0 END)`,
  }).from(approvalProjects);

  const [rfiStats] = await db.select({
    openRfis: sql<number>`SUM(CASE WHEN ${approvalRfis.status} IN ('open', 'in_progress') THEN 1 ELSE 0 END)`,
    overdueRfis: sql<number>`SUM(CASE WHEN ${approvalRfis.status} = 'overdue' THEN 1 ELSE 0 END)`,
  }).from(approvalRfis);

  const [inspectionStats] = await db.select({
    pendingInspections: sql<number>`SUM(CASE WHEN ${approvalInspections.status} IN ('required', 'scheduled', 'booked') THEN 1 ELSE 0 END)`,
  }).from(approvalInspections);

  return {
    total: projectStats?.total || 0,
    intake: projectStats?.intake || 0,
    active: projectStats?.active || 0,
    onHold: projectStats?.onHold || 0,
    completed: projectStats?.completed || 0,
    openRfis: rfiStats?.openRfis || 0,
    overdueRfis: rfiStats?.overdueRfis || 0,
    pendingInspections: inspectionStats?.pendingInspections || 0,
  };
}

// ─── Gate Check ─────────────────────────────────────────────────────────────
export async function checkGateReadiness(projectId: number, gateNumber: number) {
  const db = await getDb();
  if (!db) return { ready: false, blockers: [] as string[] };
  
  // Check blocking RFIs
  const blockingRfis = await db.select().from(approvalRfis)
    .where(and(
      eq(approvalRfis.projectId, projectId),
      eq(approvalRfis.isBlocking, true),
      eq(approvalRfis.blockingGate, gateNumber),
      sql`${approvalRfis.status} NOT IN ('closed', 'responded')`,
    ));

  // Check blocking conditions
  const blockingConditions = await db.select().from(approvalConditions)
    .where(and(
      eq(approvalConditions.projectId, projectId),
      eq(approvalConditions.isBlocking, true),
      eq(approvalConditions.blockingGate, gateNumber),
      sql`${approvalConditions.status} NOT IN ('satisfied', 'waived', 'not_applicable')`,
    ));

  // Check blocking inspections
  const blockingInspections = await db.select().from(approvalInspections)
    .where(and(
      eq(approvalInspections.projectId, projectId),
      eq(approvalInspections.isBlocking, true),
      eq(approvalInspections.blockingGate, gateNumber),
      sql`${approvalInspections.status} NOT IN ('passed', 'cancelled')`,
    ));

  // Check blocking tasks
  const blockingTasks = await db.select().from(approvalTasks)
    .where(and(
      eq(approvalTasks.projectId, projectId),
      eq(approvalTasks.gateNumber, gateNumber),
      sql`${approvalTasks.status} NOT IN ('completed', 'skipped')`,
    ));

  const blockers: string[] = [];
  if (blockingRfis.length > 0) blockers.push(`${blockingRfis.length} open RFI(s) blocking Gate ${gateNumber}`);
  if (blockingConditions.length > 0) blockers.push(`${blockingConditions.length} unsatisfied condition(s) blocking Gate ${gateNumber}`);
  if (blockingInspections.length > 0) blockers.push(`${blockingInspections.length} pending inspection(s) blocking Gate ${gateNumber}`);
  if (blockingTasks.length > 0) blockers.push(`${blockingTasks.length} incomplete task(s) at Gate ${gateNumber}`);

  const [project] = await db.select().from(approvalProjects).where(eq(approvalProjects.id, projectId)).limit(1);
  let isConstructionCommencementGate = gateNumber >= 3;
  if (project?.workflowTemplateId) {
    const [template] = await db.select().from(approvalWorkflowTemplates)
      .where(eq(approvalWorkflowTemplates.id, project.workflowTemplateId))
      .limit(1);
    const gate = ((template?.gates as any[]) || []).find((item: any) => Number(item.gateNumber) === gateNumber);
    const gateText = [
      gate?.name,
      gate?.description,
      ...((gate?.blockingConditions as string[]) || []),
    ].join(" ").toLowerCase();
    isConstructionCommencementGate = /cc issued|cdc issued|ba issued|construction authorised|construction authorized|commencement|construction certificate/.test(gateText);
  }

  if (isConstructionCommencementGate) {
    const hbcfStatus = await getProjectHbcfGateStatus(projectId);
    blockers.push(...hbcfStatus.blockers);
  }

  return { ready: blockers.length === 0, blockers };
}


// ─── Timeline ─────────────────────────────────────────────────────────────────
export interface TimelineEvent {
  id: string;
  type: "project" | "lodgement" | "inspection" | "task" | "rfi" | "gate" | "milestone";
  title: string;
  date: Date | null;
  endDate?: Date | null;
  status: string;
  color: string;
  icon: string;
  metadata?: Record<string, any>;
}

/**
 * Aggregate all date-based events for a project into a timeline.
 * Returns events sorted by date (nulls at end).
 */
export async function getProjectTimeline(projectId: number): Promise<TimelineEvent[]> {
  const db = await getDb();
  if (!db) return [];

  const events: TimelineEvent[] = [];

  // Project milestones
  const [project] = await db.select().from(approvalProjects).where(eq(approvalProjects.id, projectId)).limit(1);
  if (!project) return [];

  events.push({
    id: `project-created-${project.id}`,
    type: "project",
    title: `Project Created: ${project.name}`,
    date: project.createdAt,
    status: project.overallStatus,
    color: "#3b82f6",
    icon: "folder",
  });

  if (project.targetStartDate) {
    events.push({
      id: `project-target-${project.id}`,
      type: "milestone",
      title: "Target Construction Start",
      date: project.targetStartDate,
      status: "target",
      color: "#8b5cf6",
      icon: "flag",
    });
  }

  if (project.completedAt) {
    events.push({
      id: `project-completed-${project.id}`,
      type: "milestone",
      title: "Project Completed",
      date: project.completedAt,
      status: "completed",
      color: "#10b981",
      icon: "check-circle",
    });
  }

  // Lodgements
  const lodgements = await db.select().from(approvalLodgements).where(eq(approvalLodgements.projectId, projectId));
  for (const l of lodgements) {
    if (l.submittedAt) {
      events.push({
        id: `lodgement-submitted-${l.id}`,
        type: "lodgement",
        title: `${l.lodgementType} Submitted`,
        date: l.submittedAt,
        endDate: l.determinationAt,
        status: l.status,
        color: "#f59e0b",
        icon: "send",
        metadata: { lodgementId: l.id, externalRef: l.externalReferenceNumber },
      });
    }
    if (l.determinationAt) {
      events.push({
        id: `lodgement-determined-${l.id}`,
        type: "lodgement",
        title: `${l.lodgementType} ${l.determinationOutcome || "Determined"}`,
        date: l.determinationAt,
        status: l.determinationOutcome || l.status,
        color: l.determinationOutcome === "approved" ? "#10b981" : l.determinationOutcome === "refused" ? "#ef4444" : "#f59e0b",
        icon: l.determinationOutcome === "approved" ? "check" : "alert-circle",
        metadata: { lodgementId: l.id },
      });
    }
  }

  // Inspections
  const inspections = await db.select().from(approvalInspections).where(eq(approvalInspections.projectId, projectId));
  for (const insp of inspections) {
    events.push({
      id: `inspection-${insp.id}`,
      type: "inspection",
      title: `${insp.title}`,
      date: insp.scheduledDate || insp.inspectedAt,
      status: insp.status,
      color: insp.status === "passed" ? "#10b981" : insp.status === "failed" ? "#ef4444" : "#6366f1",
      icon: "clipboard-check",
      metadata: { inspectionId: insp.id, result: insp.result },
    });
  }

  // Tasks with due dates
  const tasks = await db.select().from(approvalTasks).where(eq(approvalTasks.projectId, projectId));
  for (const t of tasks) {
    if (t.dueAt) {
      events.push({
        id: `task-${t.id}`,
        type: "task",
        title: t.title,
        date: t.dueAt,
        endDate: t.completedAt,
        status: t.status,
        color: t.status === "completed" ? "#10b981" : t.priority === "urgent" ? "#ef4444" : "#64748b",
        icon: "check-square",
        metadata: { taskId: t.id, priority: t.priority, gateNumber: t.gateNumber },
      });
    }
  }

  // RFIs
  const rfis = await db.select().from(approvalRfis).where(eq(approvalRfis.projectId, projectId));
  for (const r of rfis) {
    events.push({
      id: `rfi-${r.id}`,
      type: "rfi",
      title: `RFI #${r.rfiNumber || r.id}: ${r.subject}`,
      date: r.receivedAt || r.createdAt,
      endDate: r.respondedAt,
      status: r.status,
      color: r.status === "closed" ? "#10b981" : r.status === "overdue" ? "#ef4444" : "#f97316",
      icon: "help-circle",
      metadata: { rfiId: r.id, isBlocking: r.isBlocking, dueAt: r.dueAt },
    });
  }

  // Sort by date (nulls at end)
  events.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });

  return events;
}

// ─── Cross-Project Calendar Events ─────────────────────────────────────────
export async function getCrossProjectCalendarEvents(month: number, year: number) {
  const db = await getDb();
  if (!db) return { events: [], projects: [] };

  const projects = await db
    .select({ id: approvalProjects.id, name: approvalProjects.name, status: approvalProjects.overallStatus })
    .from(approvalProjects)
    .where(
      or(
        eq(approvalProjects.overallStatus, "active"),
        eq(approvalProjects.overallStatus, "intake"),
        eq(approvalProjects.overallStatus, "on_hold")
      )
    );

  const projectIds = projects.map(p => p.id);
  if (projectIds.length === 0) return { events: [], projects };

  type CalendarEvent = {
    id: string;
    date: string;
    type: "lodgement" | "inspection" | "rfi_due" | "task_due" | "determination" | "expiry";
    label: string;
    projectId: number;
    projectName: string;
    status: string;
    isOverdue: boolean;
  };

  const events: CalendarEvent[] = [];
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const now = new Date();

  const inMonth = (d: Date | null | undefined): string | null => {
    if (!d) return null;
    const iso = new Date(d).toISOString().split("T")[0];
    return iso.startsWith(monthStr) ? iso : null;
  };

  const projectMap = new Map(projects.map(p => [p.id, p.name]));

  // 1. Lodgement events
  const lodgements = await db.select().from(approvalLodgements).where(inArray(approvalLodgements.projectId, projectIds));
  for (const l of lodgements) {
    const pName = projectMap.get(l.projectId) || "Unknown";
    const submittedDate = inMonth(l.submittedAt);
    if (submittedDate) {
      events.push({ id: `lodgement-submit-${l.id}`, date: submittedDate, type: "lodgement", label: `${l.lodgementType || "Application"} Submitted — ${pName}`, projectId: l.projectId, projectName: pName, status: l.status, isOverdue: false });
    }
    const detDate = inMonth(l.determinationAt);
    if (detDate) {
      events.push({ id: `lodgement-det-${l.id}`, date: detDate, type: "determination", label: `Determination: ${l.determinationOutcome || "pending"} — ${pName}`, projectId: l.projectId, projectName: pName, status: l.determinationOutcome || l.status, isOverdue: false });
    }
    const expDate = inMonth(l.expiresAt);
    if (expDate) {
      events.push({ id: `lodgement-exp-${l.id}`, date: expDate, type: "expiry", label: `Approval Expires — ${pName}`, projectId: l.projectId, projectName: pName, status: "expiry", isOverdue: new Date(expDate) < now });
    }
  }

  // 2. Inspection events
  const inspections = await db.select().from(approvalInspections).where(inArray(approvalInspections.projectId, projectIds));
  for (const i of inspections) {
    const pName = projectMap.get(i.projectId) || "Unknown";
    const schedDate = inMonth(i.scheduledDate);
    if (schedDate) {
      events.push({ id: `inspection-${i.id}`, date: schedDate, type: "inspection", label: `${i.inspectionType} Inspection — ${pName}`, projectId: i.projectId, projectName: pName, status: i.status, isOverdue: i.status === "required" && new Date(schedDate) < now });
    }
  }

  // 3. RFI due dates
  const rfis = await db.select().from(approvalRfis).where(inArray(approvalRfis.projectId, projectIds));
  for (const r of rfis) {
    const pName = projectMap.get(r.projectId) || "Unknown";
    const dueDate = inMonth(r.dueAt);
    if (dueDate) {
      events.push({ id: `rfi-due-${r.id}`, date: dueDate, type: "rfi_due", label: `RFI #${r.rfiNumber || r.id} Due: ${r.subject} — ${pName}`, projectId: r.projectId, projectName: pName, status: r.status, isOverdue: (r.status === "open" || r.status === "overdue") && new Date(dueDate) < now });
    }
  }

  // 4. Task due dates
  const tasks = await db.select().from(approvalTasks).where(inArray(approvalTasks.projectId, projectIds));
  for (const t of tasks) {
    const pName = projectMap.get(t.projectId) || "Unknown";
    const dueDate = inMonth(t.dueAt);
    if (dueDate && t.status !== "completed" && t.status !== "skipped") {
      events.push({ id: `task-due-${t.id}`, date: dueDate, type: "task_due", label: `Task: ${t.title} — ${pName}`, projectId: t.projectId, projectName: pName, status: t.status, isOverdue: (t.status === "pending" || t.status === "in_progress") && new Date(dueDate) < now });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return { events, projects };
}
