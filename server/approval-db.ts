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
import { appendTenantScope } from "./_core/tenant-scope";

function approvalProjectScope(id: number, tenantId?: number | null) {
  const conditions: any[] = [eq(approvalProjects.id, id)];
  appendTenantScope(conditions, approvalProjects.tenantId, tenantId);
  return and(...conditions);
}

function workflowTemplateScope(id: number, tenantId?: number | null) {
  const conditions: any[] = [eq(approvalWorkflowTemplates.id, id)];
  appendTenantScope(conditions, approvalWorkflowTemplates.tenantId, tenantId);
  return and(...conditions);
}

async function assertApprovalProjectAccess(projectId: number, tenantId?: number | null) {
  const project = await getApprovalProjectById(projectId, tenantId);
  if (!project) throw new Error("Approval project not found");
  return project;
}

async function getRowProjectId<T extends { projectId: number }>(
  table: any,
  idColumn: any,
  id: number,
): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db.select({ projectId: table.projectId }).from(table).where(eq(idColumn, id)).limit(1);
  return (row as T | undefined)?.projectId ?? null;
}

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

export async function getApprovalProjects(filters?: { status?: string; jurisdiction?: string; search?: string }, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  appendTenantScope(conditions, approvalProjects.tenantId, tenantId);
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
  return db.select().from(approvalProjects)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(approvalProjects.updatedAt));
}

export async function getApprovalProjectById(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return null;
  const [project] = await db.select().from(approvalProjects).where(approvalProjectScope(id, tenantId)).limit(1);
  return project || null;
}

export async function updateApprovalProject(id: number, data: Partial<InsertApprovalProject>, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(approvalProjects).set(data).where(approvalProjectScope(id, tenantId));
}

export async function deleteApprovalProject(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(approvalProjects).where(approvalProjectScope(id, tenantId));
}

// ─── Workflow Templates ─────────────────────────────────────────────────────
export async function getWorkflowTemplates(jurisdiction?: string, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(approvalWorkflowTemplates.active, true)];
  appendTenantScope(conditions, approvalWorkflowTemplates.tenantId, tenantId);
  if (jurisdiction && jurisdiction !== "all") {
    conditions.push(eq(approvalWorkflowTemplates.jurisdiction, jurisdiction as any));
  }
  return db.select().from(approvalWorkflowTemplates)
    .where(and(...conditions))
    .orderBy(desc(approvalWorkflowTemplates.updatedAt));
}

export async function getWorkflowTemplateById(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return null;
  const [template] = await db.select().from(approvalWorkflowTemplates).where(workflowTemplateScope(id, tenantId)).limit(1);
  return template || null;
}

export async function createWorkflowTemplate(data: InsertApprovalWorkflowTemplate) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(approvalWorkflowTemplates).values(data).$returningId();
  return result.id;
}

export async function updateWorkflowTemplate(id: number, data: Partial<InsertApprovalWorkflowTemplate>, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(approvalWorkflowTemplates).set(data).where(workflowTemplateScope(id, tenantId));
}

export async function deleteWorkflowTemplate(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(approvalWorkflowTemplates).set({ active: false }).where(workflowTemplateScope(id, tenantId));
}

// ─── Lodgements ─────────────────────────────────────────────────────────────
export async function createLodgement(data: InsertApprovalLodgement, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await assertApprovalProjectAccess(data.projectId, tenantId);
  const [result] = await db.insert(approvalLodgements).values(data).$returningId();
  return result.id;
}

export async function getLodgementsByProject(projectId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  await assertApprovalProjectAccess(projectId, tenantId);
  return db.select().from(approvalLodgements)
    .where(eq(approvalLodgements.projectId, projectId))
    .orderBy(desc(approvalLodgements.createdAt));
}

export async function getLodgementById(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return null;
  const [lodgement] = await db.select().from(approvalLodgements).where(eq(approvalLodgements.id, id)).limit(1);
  if (lodgement) await assertApprovalProjectAccess(lodgement.projectId, tenantId);
  return lodgement || null;
}

export async function updateLodgement(id: number, data: Partial<InsertApprovalLodgement>, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const projectId = await getRowProjectId(approvalLodgements, approvalLodgements.id, id);
  if (!projectId) throw new Error("Lodgement not found");
  await assertApprovalProjectAccess(projectId, tenantId);
  await db.update(approvalLodgements).set(data).where(eq(approvalLodgements.id, id));
}

// ─── Documents ──────────────────────────────────────────────────────────────
export async function createDocument(data: InsertApprovalDocument, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await assertApprovalProjectAccess(data.projectId, tenantId);
  const [result] = await db.insert(approvalDocuments).values(data).$returningId();
  return result.id;
}

export async function getDocumentsByProject(projectId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  await assertApprovalProjectAccess(projectId, tenantId);
  return db.select().from(approvalDocuments)
    .where(eq(approvalDocuments.projectId, projectId))
    .orderBy(desc(approvalDocuments.updatedAt));
}

export async function getDocumentById(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return null;
  const [doc] = await db.select().from(approvalDocuments).where(eq(approvalDocuments.id, id)).limit(1);
  if (doc) await assertApprovalProjectAccess(doc.projectId, tenantId);
  return doc || null;
}

export async function updateDocument(id: number, data: Partial<InsertApprovalDocument>, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const projectId = await getRowProjectId(approvalDocuments, approvalDocuments.id, id);
  if (!projectId) throw new Error("Document not found");
  await assertApprovalProjectAccess(projectId, tenantId);
  await db.update(approvalDocuments).set(data).where(eq(approvalDocuments.id, id));
}

export async function createDocumentVersion(data: InsertApprovalDocumentVersion, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const doc = await getDocumentById(data.documentId, tenantId);
  if (!doc) throw new Error("Document not found");
  const [result] = await db.insert(approvalDocumentVersions).values(data).$returningId();
  // Update parent document
  await db.update(approvalDocuments).set({
    currentVersionId: result.id,
    versionCount: sql`${approvalDocuments.versionCount} + 1`,
  }).where(eq(approvalDocuments.id, data.documentId));
  return result.id;
}

export async function getDocumentVersions(documentId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  const doc = await getDocumentById(documentId, tenantId);
  if (!doc) return [];
  return db.select().from(approvalDocumentVersions)
    .where(eq(approvalDocumentVersions.documentId, documentId))
    .orderBy(desc(approvalDocumentVersions.versionNumber));
}

// ─── RFIs ───────────────────────────────────────────────────────────────────
export async function createRfi(data: InsertApprovalRfi, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await assertApprovalProjectAccess(data.projectId, tenantId);
  const [result] = await db.insert(approvalRfis).values(data).$returningId();
  return result.id;
}

export async function getRfisByProject(projectId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  await assertApprovalProjectAccess(projectId, tenantId);
  return db.select().from(approvalRfis)
    .where(eq(approvalRfis.projectId, projectId))
    .orderBy(desc(approvalRfis.createdAt));
}

export async function getRfiById(id: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return null;
  const [rfi] = await db.select().from(approvalRfis).where(eq(approvalRfis.id, id)).limit(1);
  if (rfi) await assertApprovalProjectAccess(rfi.projectId, tenantId);
  return rfi || null;
}

export async function updateRfi(id: number, data: Partial<InsertApprovalRfi>, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const projectId = await getRowProjectId(approvalRfis, approvalRfis.id, id);
  if (!projectId) throw new Error("RFI not found");
  await assertApprovalProjectAccess(projectId, tenantId);
  await db.update(approvalRfis).set(data).where(eq(approvalRfis.id, id));
}

/**
 * Find open/in_progress RFIs that match a subject line (for email reply ingestion).
 * Matches by RFI number pattern [RFI-xxx] or by subject substring.
 */
async function findOpenRfiByConditions(conditions: any[], tenantId?: number | null) {
  const db = await getDb();
  if (!db) return null;
  appendTenantScope(conditions, approvalProjects.tenantId, tenantId);
  const [match] = await db
    .select({ rfi: approvalRfis })
    .from(approvalRfis)
    .innerJoin(approvalProjects, eq(approvalRfis.projectId, approvalProjects.id))
    .where(and(...conditions))
    .limit(1);
  return match?.rfi || null;
}

export async function findRfiBySubjectMatch(subject: string, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return null;

  // Try to extract RFI number from subject (e.g. "[RFI-5]" or "RFI #5")
  const rfiNumberMatch = subject.match(/\[?RFI[- #]*(\d+)\]?/i);
  if (rfiNumberMatch) {
    const rfiNum = rfiNumberMatch[1];
    const match = await findOpenRfiByConditions([
        eq(approvalRfis.rfiNumber, rfiNum),
        inArray(approvalRfis.status, ["open", "in_progress", "overdue"])
      ], tenantId);
    if (match) return match;
  }

  // Fallback: try to match by subject substring (strip Re:/Fwd: prefixes)
  const cleanSubject = subject.replace(/^(Re:|Fwd:|FW:|RE:)\s*/gi, "").trim();
  if (cleanSubject.length > 5) {
    const match = await findOpenRfiByConditions([
        like(approvalRfis.subject, `%${cleanSubject.slice(0, 80)}%`),
        inArray(approvalRfis.status, ["open", "in_progress", "overdue"])
      ], tenantId);
    if (match) return match;
  }

  return null;
}

// ─── Conditions ─────────────────────────────────────────────────────────────
export async function createCondition(data: InsertApprovalCondition, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await assertApprovalProjectAccess(data.projectId, tenantId);
  const [result] = await db.insert(approvalConditions).values(data).$returningId();
  return result.id;
}

export async function getConditionsByProject(projectId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  await assertApprovalProjectAccess(projectId, tenantId);
  return db.select().from(approvalConditions)
    .where(eq(approvalConditions.projectId, projectId))
    .orderBy(approvalConditions.conditionNumber);
}

export async function updateCondition(id: number, data: Partial<InsertApprovalCondition>, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const projectId = await getRowProjectId(approvalConditions, approvalConditions.id, id);
  if (!projectId) throw new Error("Condition not found");
  await assertApprovalProjectAccess(projectId, tenantId);
  await db.update(approvalConditions).set(data).where(eq(approvalConditions.id, id));
}

// ─── Tasks ──────────────────────────────────────────────────────────────────
export async function createTask(data: InsertApprovalTask, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await assertApprovalProjectAccess(data.projectId, tenantId);
  const [result] = await db.insert(approvalTasks).values(data).$returningId();
  return result.id;
}

export async function getTasksByProject(projectId: number, includeCompleted = false, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  await assertApprovalProjectAccess(projectId, tenantId);
  const conditions = [eq(approvalTasks.projectId, projectId)];
  if (!includeCompleted) {
    conditions.push(sql`${approvalTasks.status} != 'completed'`);
    conditions.push(sql`${approvalTasks.status} != 'skipped'`);
  }
  return db.select().from(approvalTasks)
    .where(and(...conditions))
    .orderBy(approvalTasks.priority, approvalTasks.dueAt);
}

export async function updateTask(id: number, data: Partial<InsertApprovalTask>, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const projectId = await getRowProjectId(approvalTasks, approvalTasks.id, id);
  if (!projectId) throw new Error("Task not found");
  await assertApprovalProjectAccess(projectId, tenantId);
  await db.update(approvalTasks).set(data).where(eq(approvalTasks.id, id));
}

// ─── Inspections ────────────────────────────────────────────────────────────
export async function createInspection(data: InsertApprovalInspection, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await assertApprovalProjectAccess(data.projectId, tenantId);
  const [result] = await db.insert(approvalInspections).values(data).$returningId();
  return result.id;
}

export async function getInspectionsByProject(projectId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  await assertApprovalProjectAccess(projectId, tenantId);
  return db.select().from(approvalInspections)
    .where(eq(approvalInspections.projectId, projectId))
    .orderBy(approvalInspections.scheduledDate);
}

export async function updateInspection(id: number, data: Partial<InsertApprovalInspection>, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const projectId = await getRowProjectId(approvalInspections, approvalInspections.id, id);
  if (!projectId) throw new Error("Inspection not found");
  await assertApprovalProjectAccess(projectId, tenantId);
  await db.update(approvalInspections).set(data).where(eq(approvalInspections.id, id));
}

// ─── Inspection Defects ─────────────────────────────────────────────────────
export async function createDefect(data: InsertApprovalInspectionDefect, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await assertApprovalProjectAccess(data.projectId, tenantId);
  const [result] = await db.insert(approvalInspectionDefects).values(data).$returningId();
  // Update inspection defect count
  await db.update(approvalInspections).set({
    hasDefects: true,
    defectCount: sql`${approvalInspections.defectCount} + 1`,
  }).where(eq(approvalInspections.id, data.inspectionId));
  return result.id;
}

export async function getDefectsByInspection(inspectionId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  const projectId = await getRowProjectId(approvalInspections, approvalInspections.id, inspectionId);
  if (!projectId) return [];
  await assertApprovalProjectAccess(projectId, tenantId);
  return db.select().from(approvalInspectionDefects)
    .where(eq(approvalInspectionDefects.inspectionId, inspectionId))
    .orderBy(desc(approvalInspectionDefects.createdAt));
}

export async function updateDefect(id: number, data: Partial<InsertApprovalInspectionDefect>, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [defect] = await db.select({ projectId: approvalInspectionDefects.projectId })
    .from(approvalInspectionDefects)
    .where(eq(approvalInspectionDefects.id, id))
    .limit(1);
  if (!defect?.projectId) throw new Error("Defect not found");
  await assertApprovalProjectAccess(defect.projectId, tenantId);
  await db.update(approvalInspectionDefects).set(data).where(eq(approvalInspectionDefects.id, id));
}

// ─── Fees ───────────────────────────────────────────────────────────────────
export async function createFee(data: InsertApprovalFee, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await assertApprovalProjectAccess(data.projectId, tenantId);
  const [result] = await db.insert(approvalFees).values(data).$returningId();
  return result.id;
}

export async function getFeesByProject(projectId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  await assertApprovalProjectAccess(projectId, tenantId);
  return db.select().from(approvalFees)
    .where(eq(approvalFees.projectId, projectId))
    .orderBy(desc(approvalFees.createdAt));
}

export async function updateFee(id: number, data: Partial<InsertApprovalFee>, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const projectId = await getRowProjectId(approvalFees, approvalFees.id, id);
  if (!projectId) throw new Error("Fee not found");
  await assertApprovalProjectAccess(projectId, tenantId);
  await db.update(approvalFees).set(data).where(eq(approvalFees.id, id));
}

// ─── Certificates ───────────────────────────────────────────────────────────
export async function createCertificate(data: InsertApprovalCertificate, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await assertApprovalProjectAccess(data.projectId, tenantId);
  const [result] = await db.insert(approvalCertificates).values(data).$returningId();
  return result.id;
}

export async function getCertificatesByProject(projectId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  await assertApprovalProjectAccess(projectId, tenantId);
  return db.select().from(approvalCertificates)
    .where(eq(approvalCertificates.projectId, projectId))
    .orderBy(desc(approvalCertificates.issuedAt));
}

// ─── Pathway Assessments ────────────────────────────────────────────────────
export async function createPathwayAssessment(data: InsertApprovalPathwayAssessment, tenantId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await assertApprovalProjectAccess(data.projectId, tenantId);
  // Supersede previous assessments for this project
  await db.update(approvalPathwayAssessments)
    .set({ supersededAt: new Date() })
    .where(and(eq(approvalPathwayAssessments.projectId, data.projectId), isNull(approvalPathwayAssessments.supersededAt)));
  const [result] = await db.insert(approvalPathwayAssessments).values(data).$returningId();
  return result.id;
}

export async function getLatestPathwayAssessment(projectId: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return null;
  await assertApprovalProjectAccess(projectId, tenantId);
  const [assessment] = await db.select().from(approvalPathwayAssessments)
    .where(and(eq(approvalPathwayAssessments.projectId, projectId), isNull(approvalPathwayAssessments.supersededAt)))
    .orderBy(desc(approvalPathwayAssessments.assessedAt))
    .limit(1);
  return assessment || null;
}

// ─── Audit Log ──────────────────────────────────────────────────────────────
export async function createAuditEntry(data: InsertApprovalAuditLogEntry, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return;
  await assertApprovalProjectAccess(data.projectId, tenantId);
  await db.insert(approvalAuditLog).values(data);
}

export async function getAuditLogByProject(projectId: number, limit = 50, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return [];
  await assertApprovalProjectAccess(projectId, tenantId);
  return db.select().from(approvalAuditLog)
    .where(eq(approvalAuditLog.projectId, projectId))
    .orderBy(desc(approvalAuditLog.createdAt))
    .limit(limit);
}

// ─── Dashboard Aggregates ───────────────────────────────────────────────────
export async function getApprovalsDashboardStats(tenantId?: number | null) {
  const db = await getDb();
  if (!db) return { total: 0, intake: 0, active: 0, onHold: 0, completed: 0, openRfis: 0, overdueRfis: 0, pendingInspections: 0 };
  const projectConditions: any[] = [];
  appendTenantScope(projectConditions, approvalProjects.tenantId, tenantId);
  const projectWhere = projectConditions.length > 0 ? and(...projectConditions) : undefined;
  
  const [projectStats] = await db.select({
    total: sql<number>`COUNT(*)`,
    intake: sql<number>`SUM(CASE WHEN ${approvalProjects.overallStatus} = 'intake' THEN 1 ELSE 0 END)`,
    active: sql<number>`SUM(CASE WHEN ${approvalProjects.overallStatus} = 'active' THEN 1 ELSE 0 END)`,
    onHold: sql<number>`SUM(CASE WHEN ${approvalProjects.overallStatus} = 'on_hold' THEN 1 ELSE 0 END)`,
    completed: sql<number>`SUM(CASE WHEN ${approvalProjects.overallStatus} = 'completed' THEN 1 ELSE 0 END)`,
  }).from(approvalProjects).where(projectWhere);

  const [rfiStats] = await db.select({
    openRfis: sql<number>`SUM(CASE WHEN ${approvalRfis.status} IN ('open', 'in_progress') THEN 1 ELSE 0 END)`,
    overdueRfis: sql<number>`SUM(CASE WHEN ${approvalRfis.status} = 'overdue' THEN 1 ELSE 0 END)`,
  }).from(approvalRfis)
    .leftJoin(approvalProjects, eq(approvalRfis.projectId, approvalProjects.id))
    .where(projectWhere);

  const [inspectionStats] = await db.select({
    pendingInspections: sql<number>`SUM(CASE WHEN ${approvalInspections.status} IN ('required', 'scheduled', 'booked') THEN 1 ELSE 0 END)`,
  }).from(approvalInspections)
    .leftJoin(approvalProjects, eq(approvalInspections.projectId, approvalProjects.id))
    .where(projectWhere);

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
export async function checkGateReadiness(projectId: number, gateNumber: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return { ready: false, blockers: [] as string[] };
  await assertApprovalProjectAccess(projectId, tenantId);
  
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

  const [project] = await db.select().from(approvalProjects).where(approvalProjectScope(projectId, tenantId)).limit(1);
  let isConstructionCommencementGate = gateNumber >= 3;
  if (project?.workflowTemplateId) {
    const [template] = await db.select().from(approvalWorkflowTemplates)
      .where(workflowTemplateScope(project.workflowTemplateId, tenantId))
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
    const hbcfStatus = await getProjectHbcfGateStatus(projectId, tenantId);
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
export async function getProjectTimeline(projectId: number, tenantId?: number | null): Promise<TimelineEvent[]> {
  const db = await getDb();
  if (!db) return [];

  const events: TimelineEvent[] = [];

  // Project milestones
  const project = await getApprovalProjectById(projectId, tenantId);
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
export async function getCrossProjectCalendarEvents(month: number, year: number, tenantId?: number | null) {
  const db = await getDb();
  if (!db) return { events: [], projects: [] };

  const projectConditions = [
    or(
      eq(approvalProjects.overallStatus, "active"),
      eq(approvalProjects.overallStatus, "intake"),
      eq(approvalProjects.overallStatus, "on_hold")
    ),
  ];
  appendTenantScope(projectConditions, approvalProjects.tenantId, tenantId);

  const projects = await db
    .select({ id: approvalProjects.id, name: approvalProjects.name, status: approvalProjects.overallStatus })
    .from(approvalProjects)
    .where(and(...projectConditions));

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
