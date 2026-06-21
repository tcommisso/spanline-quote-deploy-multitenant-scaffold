import {
  router,
  tenantProcedure as protectedProcedure,
  tenantAdminProcedure as adminProcedure,
} from "./_core/trpc";
import { z } from "zod";
import * as approvalDb from "./approval-db";
import { storagePut } from "./storage";
import { randomBytes } from "crypto";
import { ALL_TEMPLATES } from "./seed-workflow-templates";
import { getDb } from "./db";
import { constructionScheduleEvents, constructionJobs, approvalProjects, approvalConditions, approvalDocuments, approvalDocumentVersions, approvalTasks, approvalRfis, approvalInspections, crmLeads, quotes } from "../drizzle/schema";
import { eq, desc, isNull, and, ne, sql } from "drizzle-orm";
import { appendTenantScope } from "./_core/tenant-scope";
import {
  HBCF_REQUIRED_THRESHOLD,
  createOrUpdateHbcfCertificate,
  getHbcfBuilderProfile,
  getProjectHbcfGateStatus,
  listHbcfCertificates,
  listHbcfCompetitorMatches,
  runHbcfCompetitorMatching,
  syncProjectHbcfFromApi,
  upsertHbcfBuilderProfile,
} from "./hbcf-service";

function hbcfFlagForValue(value?: string | null) {
  const amount = Number(value || 0);
  if (Number.isFinite(amount) && amount >= HBCF_REQUIRED_THRESHOLD) {
    return {
      hbcfRequired: true,
      hbcfStatus: "required",
      hbcfRequirementReason: `Project value $${amount.toFixed(2)} is at or above the $${HBCF_REQUIRED_THRESHOLD.toLocaleString()} HBCF threshold`,
      hbcfFlaggedAt: new Date(),
    };
  }
  return {};
}

function appendExactQuoteTenantScope(conditions: any[], column: any, tenantId: number | null | undefined) {
  conditions.push(tenantId ? eq(column, tenantId) : sql`1 = 0`);
}

function isCommencementCertificateType(certificateType: string) {
  return /^(CC|CDC|BA|CCC)$/i.test(certificateType) ||
    /construction certificate|construction commencement|commencement certificate|complying development|building approval/i.test(certificateType);
}

export const approvalRouter = router({
  // ─── Dashboard ──────────────────────────────────────────────────────────────
  dashboardStats: protectedProcedure.query(async ({ ctx }) => {
    return approvalDb.getApprovalsDashboardStats(ctx.tenant!.id);
  }),

  // ─── Projects ───────────────────────────────────────────────────────────────
  projects: router({
    list: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        jurisdiction: z.string().optional(),
        search: z.string().optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        return approvalDb.getApprovalProjects(input, ctx.tenant!.id);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return approvalDb.getApprovalProjectById(input.id, ctx.tenant!.id);
      }),

    create: protectedProcedure
      .input(z.object({
        name: z.string().min(1),
        jurisdiction: z.enum(["NSW", "ACT"]),
        propertyAddress: z.string().optional(),
        propertySuburb: z.string().optional(),
        propertyState: z.string().optional(),
        propertyPostcode: z.string().optional(),
        lotNumber: z.string().optional(),
        dpNumber: z.string().optional(),
        sectionNumber: z.string().optional(),
        blockNumber: z.string().optional(),
        zoning: z.string().optional(),
        buildingClass: z.string().optional(),
        estimatedCost: z.string().optional(),
        descriptionOfWork: z.string().optional(),
        clientName: z.string().optional(),
        clientContactId: z.number().optional(),
        applicantName: z.string().optional(),
        applicantContactId: z.number().optional(),
        certifierName: z.string().optional(),
        certifierContactId: z.number().optional(),
        projectManagerId: z.number().optional(),
        projectManagerName: z.string().optional(),
        crmJobId: z.number().optional(),
        crmLeadId: z.number().optional(),
        riskFlags: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const projectNumber = await approvalDb.generateProjectNumber();
        const id = await approvalDb.createApprovalProject({
          ...input,
          tenantId: ctx.tenant!.id,
          ...hbcfFlagForValue(input.estimatedCost),
          projectNumber,
          createdByUserId: ctx.user.id,
        });
        await approvalDb.createAuditEntry({
          projectId: id,
          eventType: "project_created",
          entityType: "project",
          entityId: id,
          summary: `Project ${projectNumber} created: ${input.name}`,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
        }, ctx.tenant!.id);
        return { id, projectNumber };
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        data: z.record(z.string(), z.any()),
      }))
      .mutation(async ({ ctx, input }) => {
        const updates = { ...input.data } as any;
        if (updates.estimatedCost !== undefined) {
          Object.assign(updates, hbcfFlagForValue(updates.estimatedCost));
          if (Number(updates.estimatedCost || 0) < HBCF_REQUIRED_THRESHOLD && updates.hbcfRequired !== true) {
            updates.hbcfRequired = false;
            updates.hbcfStatus = "not_required";
            updates.hbcfRequirementReason = null;
            updates.hbcfFlaggedAt = null;
          }
        }
        await approvalDb.updateApprovalProject(input.id, updates, ctx.tenant!.id);
        await approvalDb.createAuditEntry({
          projectId: input.id,
          eventType: "project_updated",
          entityType: "project",
          entityId: input.id,
          summary: `Project updated: ${Object.keys(updates).join(", ")}`,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
          details: updates,
        }, ctx.tenant!.id);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await approvalDb.deleteApprovalProject(input.id, ctx.tenant!.id);
        return { success: true };
      }),

    // Advance workflow state
    advanceState: protectedProcedure
      .input(z.object({
        id: z.number(),
        newState: z.string(),
        newGate: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const project = await approvalDb.getApprovalProjectById(input.id, ctx.tenant!.id);
        if (!project) throw new Error("Project not found");

        // If advancing to a new gate, check gate readiness
        if (input.newGate !== undefined && input.newGate > (project.currentGate || 0)) {
          const gateCheck = await approvalDb.checkGateReadiness(input.id, input.newGate, ctx.tenant!.id);
          if (!gateCheck.ready) {
            throw new Error(`Gate ${input.newGate} not ready: ${gateCheck.blockers.join("; ")}`);
          }
        }

        await approvalDb.updateApprovalProject(input.id, {
          currentState: input.newState,
          currentGate: input.newGate ?? project.currentGate,
          overallStatus: "active",
        }, ctx.tenant!.id);

        await approvalDb.createAuditEntry({
          projectId: input.id,
          eventType: "status_change",
          entityType: "project",
          entityId: input.id,
          summary: `State advanced: ${project.currentState} → ${input.newState}`,
          previousValue: project.currentState || undefined,
          newValue: input.newState,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
        }, ctx.tenant!.id);
        return { success: true };
      }),

    // Check gate readiness
    checkGate: protectedProcedure
      .input(z.object({ id: z.number(), gateNumber: z.number() }))
      .query(async ({ ctx, input }) => {
        return approvalDb.checkGateReadiness(input.id, input.gateNumber, ctx.tenant!.id);
      }),
  }),

  // ─── Pathway Assessments ──────────────────────────────────────────────────
  pathwayAssessments: router({
    getLatest: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        return approvalDb.getLatestPathwayAssessment(input.projectId, ctx.tenant!.id);
      }),

    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        checklistResponses: z.any(),
        recommendedPathway: z.string().optional(),
        confidence: z.enum(["high", "medium", "low"]).optional(),
        assumptions: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await approvalDb.createPathwayAssessment({
          ...input,
          assessedByUserId: ctx.user.id,
          assessedByName: ctx.user.name || "Unknown",
        }, ctx.tenant!.id);
        // Update project with recommended pathway
        if (input.recommendedPathway) {
          await approvalDb.updateApprovalProject(input.projectId, {
            recommendedPathway: input.recommendedPathway,
            pathwayConfidence: input.confidence,
            pathwayAssumptions: input.assumptions,
          }, ctx.tenant!.id);
        }
        await approvalDb.createAuditEntry({
          projectId: input.projectId,
          eventType: "pathway_assessed",
          entityType: "pathway_assessment",
          entityId: id,
          summary: `Pathway assessed: ${input.recommendedPathway || "pending"} (${input.confidence || "unknown"} confidence)`,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
        }, ctx.tenant!.id);
        return { id };
      }),
  }),

  // ─── Workflow Templates ───────────────────────────────────────────────────
  workflowTemplates: router({
    list: protectedProcedure
      .input(z.object({ jurisdiction: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        return approvalDb.getWorkflowTemplates(input?.jurisdiction, ctx.tenant!.id);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return approvalDb.getWorkflowTemplateById(input.id, ctx.tenant!.id);
      }),

    create: protectedProcedure
      .input(z.object({
        jurisdiction: z.enum(["NSW", "ACT"]),
        pathwayCode: z.string(),
        name: z.string(),
        description: z.string().optional(),
        states: z.any(),
        transitions: z.any(),
        gates: z.any(),
        documentChecklist: z.any().optional(),
        intakeChecklist: z.any().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await approvalDb.createWorkflowTemplate({
          ...input,
          tenantId: ctx.tenant!.id,
          createdByUserId: ctx.user.id,
        });
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(async ({ ctx, input }) => {
        await approvalDb.updateWorkflowTemplate(input.id, input.data as any, ctx.tenant!.id);
        return { success: true };
      }),
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await approvalDb.deleteWorkflowTemplate(input.id, ctx.tenant!.id);
        return { success: true };
      }),

    duplicate: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const source = await approvalDb.getWorkflowTemplateById(input.id, ctx.tenant!.id);
        if (!source) throw new Error("Template not found");
        const newId = await approvalDb.createWorkflowTemplate({
          tenantId: ctx.tenant!.id,
          jurisdiction: source.jurisdiction,
          pathwayCode: source.pathwayCode + "_COPY",
          name: source.name + " (Copy)",
          description: source.description,
          states: source.states,
          transitions: source.transitions,
          gates: source.gates,
          documentChecklist: source.documentChecklist,
          intakeChecklist: source.intakeChecklist,
          createdByUserId: ctx.user.id,
        });
        return { id: newId };
      }),

    seed: protectedProcedure.mutation(async ({ ctx }) => {
      // Seed all default templates (skip if already exist by pathwayCode)
      const existing = await approvalDb.getWorkflowTemplates(undefined, ctx.tenant!.id);
      const existingCodes = new Set((existing || []).map((t: any) => t.pathwayCode));
      let seeded = 0;
      for (const tpl of ALL_TEMPLATES) {
        if (existingCodes.has(tpl.pathwayCode)) continue;
        await approvalDb.createWorkflowTemplate({
          tenantId: ctx.tenant!.id,
          jurisdiction: tpl.jurisdiction,
          pathwayCode: tpl.pathwayCode,
          name: tpl.name,
          description: tpl.description,
          states: tpl.states,
          transitions: tpl.transitions,
          gates: tpl.gates,
          documentChecklist: tpl.documentChecklist,
          createdByUserId: ctx.user.id,
        });
        seeded++;
      }
      return { seeded, total: ALL_TEMPLATES.length };
    }),
  }),

  // ─── Lodgements ───────────────────────────────────────────────────────────
  lodgements: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        return approvalDb.getLodgementsByProject(input.projectId, ctx.tenant!.id);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return approvalDb.getLodgementById(input.id, ctx.tenant!.id);
      }),

    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        lodgementType: z.string(),
        externalPortal: z.string().optional(),
        authorityName: z.string().optional(),
        applicantName: z.string().optional(),
        assignedToUserId: z.number().optional(),
        assignedToName: z.string().optional(),
        estimatedFees: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await approvalDb.createLodgement({
          ...input,
          createdByUserId: ctx.user.id,
        }, ctx.tenant!.id);
        await approvalDb.createAuditEntry({
          projectId: input.projectId,
          eventType: "lodgement_created",
          entityType: "lodgement",
          entityId: id,
          summary: `Lodgement created: ${input.lodgementType}`,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
        }, ctx.tenant!.id);
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), projectId: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(async ({ ctx, input }) => {
        await approvalDb.updateLodgement(input.id, input.data as any, ctx.tenant!.id);
        await approvalDb.createAuditEntry({
          projectId: input.projectId,
          eventType: "lodgement_updated",
          entityType: "lodgement",
          entityId: input.id,
          summary: `Lodgement updated: ${Object.keys(input.data).join(", ")}`,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
          details: input.data,
        }, ctx.tenant!.id);
        return { success: true };
      }),
  }),

  // ─── Documents ────────────────────────────────────────────────────────────
  documents: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        return approvalDb.getDocumentsByProject(input.projectId, ctx.tenant!.id);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return approvalDb.getDocumentById(input.id, ctx.tenant!.id);
      }),

    versions: protectedProcedure
      .input(z.object({ documentId: z.number() }))
      .query(async ({ ctx, input }) => {
        return approvalDb.getDocumentVersions(input.documentId, ctx.tenant!.id);
      }),

    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        lodgementId: z.number().optional(),
        documentType: z.string(),
        title: z.string(),
        description: z.string().optional(),
        signatureRequired: z.boolean().optional(),
        checklistRequired: z.boolean().optional(),
        checklistStage: z.string().optional(),
        preparedByParty: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await approvalDb.createDocument({
          ...input,
          createdByUserId: ctx.user.id,
        }, ctx.tenant!.id);
        await approvalDb.createAuditEntry({
          projectId: input.projectId,
          eventType: "document_created",
          entityType: "document",
          entityId: id,
          summary: `Document created: ${input.title} (${input.documentType})`,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
        }, ctx.tenant!.id);
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), projectId: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(async ({ ctx, input }) => {
        await approvalDb.updateDocument(input.id, input.data as any, ctx.tenant!.id);
        return { success: true };
      }),

    uploadVersion: protectedProcedure
      .input(z.object({
        documentId: z.number(),
        projectId: z.number(),
        fileName: z.string(),
        fileMimeType: z.string(),
        fileBase64: z.string(),
        revisionNotes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.fileBase64, "base64");
        const suffix = randomBytes(4).toString("hex");
        const fileKey = `approvals/${input.projectId}/${input.documentId}/${suffix}-${input.fileName}`;
        const { url } = await storagePut(fileKey, buffer, input.fileMimeType);

        // Get current version count
        const doc = await approvalDb.getDocumentById(input.documentId, ctx.tenant!.id);
        const versionNumber = (doc?.versionCount || 0) + 1;

        const versionId = await approvalDb.createDocumentVersion({
          documentId: input.documentId,
          versionNumber,
          fileKey,
          fileUrl: url,
          fileName: input.fileName,
          fileMimeType: input.fileMimeType,
          fileSize: buffer.length,
          revisionNotes: input.revisionNotes,
          uploadedByUserId: ctx.user.id,
          uploadedByName: ctx.user.name || "Unknown",
        }, ctx.tenant!.id);

        // Update document status to draft
        await approvalDb.updateDocument(input.documentId, { status: "draft" }, ctx.tenant!.id);

        await approvalDb.createAuditEntry({
          projectId: input.projectId,
          eventType: "document_upload",
          entityType: "document",
          entityId: input.documentId,
          summary: `Version ${versionNumber} uploaded: ${input.fileName}`,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
        }, ctx.tenant!.id);

        return { versionId, url, versionNumber };
      }),
    generatePack: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        lodgementId: z.number().optional(),
        format: z.enum(["zip", "pdf_index"]),
        documentIds: z.array(z.number()).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Get all documents for this project (or specific lodgement)
        const allDocs = await approvalDb.getDocumentsByProject(input.projectId, ctx.tenant!.id);
        const docs = input.documentIds
          ? allDocs.filter((d: any) => input.documentIds!.includes(d.id))
          : input.lodgementId
            ? allDocs.filter((d: any) => d.lodgementId === input.lodgementId)
            : allDocs;

        // Get latest version for each document
        const packItems: { title: string; fileName: string; fileUrl: string; documentType: string; status: string }[] = [];
        for (const doc of docs) {
          const versions = await approvalDb.getDocumentVersions(doc.id, ctx.tenant!.id);
          if (versions.length > 0) {
            const latest = versions[versions.length - 1];
            packItems.push({
              title: doc.title,
              fileName: latest.fileName,
              fileUrl: latest.fileUrl,
              documentType: doc.documentType,
              status: doc.status || "draft",
            });
          }
        }

        // Generate a pack manifest (the actual ZIP assembly happens client-side using the URLs)
        await approvalDb.createAuditEntry({
          projectId: input.projectId,
          eventType: "pack_generated",
          entityType: "document",
          entityId: 0,
          summary: `Document pack generated (${input.format}): ${packItems.length} documents`,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
        }, ctx.tenant!.id);

        return {
          format: input.format,
          generatedAt: new Date().toISOString(),
          documentCount: packItems.length,
          items: packItems,
        };
      }),
  }),

  // ─── RFIs ─────────────────────────────────────────────────────────────────
  rfis: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        return approvalDb.getRfisByProject(input.projectId, ctx.tenant!.id);
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return approvalDb.getRfiById(input.id, ctx.tenant!.id);
      }),

    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        lodgementId: z.number().optional(),
        subject: z.string(),
        description: z.string().optional(),
        requestedBy: z.string().optional(),
        assignedToUserId: z.number().optional(),
        assignedToName: z.string().optional(),
        dueAt: z.string().optional(),
        isBlocking: z.boolean().optional(),
        blockingGate: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await approvalDb.createRfi({
          ...input,
          dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
          receivedAt: new Date(),
          createdByUserId: ctx.user.id,
        }, ctx.tenant!.id);
        await approvalDb.createAuditEntry({
          projectId: input.projectId,
          eventType: "rfi_created",
          entityType: "rfi",
          entityId: id,
          summary: `RFI created: ${input.subject}`,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
        }, ctx.tenant!.id);
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), projectId: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(async ({ ctx, input }) => {
        await approvalDb.updateRfi(input.id, input.data as any, ctx.tenant!.id);
        await approvalDb.createAuditEntry({
          projectId: input.projectId,
          eventType: "rfi_updated",
          entityType: "rfi",
          entityId: input.id,
          summary: `RFI updated: ${Object.keys(input.data).join(", ")}`,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
          details: input.data,
        }, ctx.tenant!.id);
        return { success: true };
      }),
  }),

  // ─── Conditions ───────────────────────────────────────────────────────────
  conditions: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        return approvalDb.getConditionsByProject(input.projectId, ctx.tenant!.id);
      }),

    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        lodgementId: z.number().optional(),
        conditionNumber: z.string().optional(),
        title: z.string(),
        description: z.string().optional(),
        category: z.enum(["pre_commencement", "during_works", "prior_to_occupation", "ongoing", "other"]).optional(),
        isBlocking: z.boolean().optional(),
        blockingGate: z.number().optional(),
        assignedToUserId: z.number().optional(),
        assignedToName: z.string().optional(),
        dueAt: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await approvalDb.createCondition({
          ...input,
          dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
          createdByUserId: ctx.user.id,
        }, ctx.tenant!.id);
        await approvalDb.createAuditEntry({
          projectId: input.projectId,
          eventType: "condition_created",
          entityType: "condition",
          entityId: id,
          summary: `Condition created: ${input.title}`,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
        }, ctx.tenant!.id);
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), projectId: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(async ({ ctx, input }) => {
        await approvalDb.updateCondition(input.id, input.data as any, ctx.tenant!.id);
        if (input.data.status === "satisfied") {
          await approvalDb.createAuditEntry({
            projectId: input.projectId,
            eventType: "condition_satisfied",
            entityType: "condition",
            entityId: input.id,
            summary: `Condition satisfied`,
            userId: ctx.user.id,
            userName: ctx.user.name || "Unknown",
          }, ctx.tenant!.id);
        }
        return { success: true };
      }),

    satisfy: protectedProcedure
      .input(z.object({
        id: z.number(),
        projectId: z.number(),
        evidenceNotes: z.string().optional(),
        evidenceFiles: z.array(z.object({
          fileName: z.string(),
          fileMimeType: z.string(),
          fileBase64: z.string(),
        })).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // Upload evidence files and collect document IDs
        const evidenceDocumentIds: number[] = [];
        if (input.evidenceFiles && input.evidenceFiles.length > 0) {
          for (const file of input.evidenceFiles) {
            const buffer = Buffer.from(file.fileBase64, "base64");
            const suffix = randomBytes(4).toString("hex");
            const fileKey = `approvals/${input.projectId}/conditions/${input.id}/${suffix}-${file.fileName}`;
            const { url } = await storagePut(fileKey, buffer, file.fileMimeType);

            // Create a document record for this evidence
            const docId = await approvalDb.createDocument({
              projectId: input.projectId,
              documentType: "condition_evidence",
              title: `Evidence: ${file.fileName}`,
              status: "approved",
              createdByUserId: ctx.user.id,
            }, ctx.tenant!.id);
            await approvalDb.createDocumentVersion({
              documentId: docId,
              versionNumber: 1,
              fileKey,
              fileUrl: url,
              fileName: file.fileName,
              fileMimeType: file.fileMimeType,
              fileSize: buffer.length,
              uploadedByUserId: ctx.user.id,
              uploadedByName: ctx.user.name || "Unknown",
            }, ctx.tenant!.id);
            evidenceDocumentIds.push(docId);
          }
        }

        // Update condition to satisfied
        await approvalDb.updateCondition(input.id, {
          status: "satisfied",
          satisfiedAt: new Date(),
          satisfiedByUserId: ctx.user.id,
          satisfiedByName: ctx.user.name || "Unknown",
          evidenceNotes: input.evidenceNotes || null,
          evidenceDocumentIds: evidenceDocumentIds.length > 0 ? evidenceDocumentIds : undefined,
        }, ctx.tenant!.id);

        // Audit
        await approvalDb.createAuditEntry({
          projectId: input.projectId,
          eventType: "condition_satisfied",
          entityType: "condition",
          entityId: input.id,
          summary: `Condition satisfied with ${evidenceDocumentIds.length} evidence file(s)`,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
        }, ctx.tenant!.id);

        // Auto-update blocking flags: check if all blocking conditions on this project are now satisfied
        const allConditions = await approvalDb.getConditionsByProject(input.projectId, ctx.tenant!.id);
        const blockingUnsatisfied = allConditions.filter(
          (c: any) => c.isBlocking && c.status !== "satisfied" && c.status !== "waived" && c.status !== "not_applicable"
        );

        return {
          success: true,
          evidenceDocumentIds,
          allBlockingCleared: blockingUnsatisfied.length === 0,
          remainingBlocking: blockingUnsatisfied.length,
        };
      }),
    // Batch import conditions from consent PDF via LLM
    importFromPdf: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        lodgementId: z.number().optional(),
        fileBase64: z.string(),
        fileName: z.string(),
        fileMimeType: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { invokeLLM } = await import("./_core/llm");
        // Upload PDF to S3 for LLM access
        const buffer = Buffer.from(input.fileBase64, "base64");
        const suffix = randomBytes(4).toString("hex");
        const fileKey = `approvals/${input.projectId}/consent-imports/${suffix}-${input.fileName}`;
        const { url: pdfUrl } = await storagePut(fileKey, buffer, input.fileMimeType || "application/pdf");

        // Send to LLM with structured output
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an expert at reading Australian development consent documents (DA, CDC, CC, S68 approvals). Extract ALL conditions from the document. For each condition, identify:\n- conditionNumber: the condition number as written (e.g. "1", "2a", "3(i)")\n- title: a concise 5-15 word summary of the condition\n- description: the full text of the condition\n- category: one of "pre_commencement", "during_works", "prior_to_occupation", "ongoing", "other" based on when the condition must be satisfied\n- isBlocking: true if the condition must be satisfied before work can proceed (pre-commencement conditions are typically blocking)\n- blockingGate: 1 for pre-commencement, 3 for prior-to-occupation, null for others\n\nReturn ALL conditions found. If the document has sections/headings that indicate timing (e.g. "Prior to Issue of Construction Certificate", "During Construction", "Prior to Occupation"), use those to determine the category.`,
            },
            {
              role: "user",
              content: [
                { type: "text" as const, text: `Parse all conditions from this consent document: ${input.fileName}` },
                { type: "file_url" as const, file_url: { url: pdfUrl, mime_type: "application/pdf" as const } },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "consent_conditions",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  conditions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        conditionNumber: { type: "string", description: "The condition number" },
                        title: { type: "string", description: "Short summary title" },
                        description: { type: "string", description: "Full condition text" },
                        category: { type: "string", enum: ["pre_commencement", "during_works", "prior_to_occupation", "ongoing", "other"] },
                        isBlocking: { type: "boolean" },
                        blockingGate: { type: ["number", "null"] },
                      },
                      required: ["conditionNumber", "title", "description", "category", "isBlocking", "blockingGate"],
                      additionalProperties: false,
                    },
                  },
                  documentTitle: { type: "string", description: "Title or reference of the consent document" },
                  totalConditions: { type: "number", description: "Total number of conditions found" },
                },
                required: ["conditions", "documentTitle", "totalConditions"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices?.[0]?.message?.content;
        if (!content) throw new Error("LLM returned no content");

        const parsed = JSON.parse(content as string);
        return {
          conditions: parsed.conditions || [],
          documentTitle: parsed.documentTitle || input.fileName,
          totalConditions: parsed.totalConditions || 0,
          pdfUrl,
        };
      }),
    // Bulk create conditions from parsed PDF results
    bulkCreate: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        lodgementId: z.number().optional(),
        conditions: z.array(z.object({
          conditionNumber: z.string(),
          title: z.string(),
          description: z.string(),
          category: z.enum(["pre_commencement", "during_works", "prior_to_occupation", "ongoing", "other"]),
          isBlocking: z.boolean(),
          blockingGate: z.number().nullable(),
          dueAt: z.string().optional(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const createdIds: number[] = [];
        for (const c of input.conditions) {
          const id = await approvalDb.createCondition({
            projectId: input.projectId,
            lodgementId: input.lodgementId,
            conditionNumber: c.conditionNumber,
            title: c.title,
            description: c.description,
            category: c.category,
            isBlocking: c.isBlocking,
            blockingGate: c.blockingGate ?? undefined,
            dueAt: c.dueAt ? new Date(c.dueAt) : undefined,
            createdByUserId: ctx.user.id,
          }, ctx.tenant!.id);
          createdIds.push(id);
        }
        await approvalDb.createAuditEntry({
          projectId: input.projectId,
          eventType: "conditions_bulk_imported",
          entityType: "condition",
          entityId: createdIds[0] || 0,
          summary: `${createdIds.length} conditions imported from consent PDF`,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
        }, ctx.tenant!.id);
        return { createdCount: createdIds.length, ids: createdIds };
      }),
  }),

  // ─── Tasks ────────────────────────────────────────────────────────────────
  tasks: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number(), includeCompleted: z.boolean().optional() }))
      .query(async ({ ctx, input }) => {
        return approvalDb.getTasksByProject(input.projectId, input.includeCompleted, ctx.tenant!.id);
      }),

    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        lodgementId: z.number().optional(),
        title: z.string(),
        description: z.string().optional(),
        taskType: z.enum(["document", "review", "signature", "lodgement", "payment", "inspection", "notification", "gate_check", "custom"]).optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        assignedToUserId: z.number().optional(),
        assignedToName: z.string().optional(),
        dueAt: z.string().optional(),
        gateNumber: z.number().optional(),
        workflowState: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await approvalDb.createTask({
          ...input,
          dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
          createdByUserId: ctx.user.id,
        }, ctx.tenant!.id);
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), projectId: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(async ({ ctx, input }) => {
        const updateData: any = { ...input.data };
        if (input.data.status === "completed") {
          updateData.completedAt = new Date();
        }
        await approvalDb.updateTask(input.id, updateData, ctx.tenant!.id);
        return { success: true };
      }),
    generateFromGate: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        gateNumber: z.number(),
        tasks: z.array(z.object({
          title: z.string(),
          taskType: z.enum(["document", "review", "signature", "lodgement", "payment", "inspection", "notification", "gate_check", "custom"]),
          gateNumber: z.number(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        let count = 0;
        for (const task of input.tasks) {
          await approvalDb.createTask({
            projectId: input.projectId,
            title: task.title,
            taskType: task.taskType,
            gateNumber: task.gateNumber,
            priority: "medium",
            autoGenerated: true,
            createdByUserId: ctx.user.id,
          }, ctx.tenant!.id);
          count++;
        }
        await approvalDb.createAuditEntry({
          projectId: input.projectId,
          eventType: "tasks_generated",
          entityType: "task",
          entityId: 0,
          summary: `${count} tasks auto-generated for Gate ${input.gateNumber}`,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
        }, ctx.tenant!.id);
        return { count };
      }),
  }),

  // ─── Inspections ──────────────────────────────────────────────────────────
  inspections: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        return approvalDb.getInspectionsByProject(input.projectId, ctx.tenant!.id);
      }),

    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        lodgementId: z.number().optional(),
        inspectionType: z.string(),
        title: z.string(),
        description: z.string().optional(),
        scheduledDate: z.string().optional(),
        scheduledTime: z.string().optional(),
        inspectorName: z.string().optional(),
        isBlocking: z.boolean().optional(),
        blockingGate: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await approvalDb.createInspection({
          ...input,
          scheduledDate: input.scheduledDate ? new Date(input.scheduledDate) : undefined,
          createdByUserId: ctx.user.id,
        }, ctx.tenant!.id);
        await approvalDb.createAuditEntry({
          projectId: input.projectId,
          eventType: "inspection_created",
          entityType: "inspection",
          entityId: id,
          summary: `Inspection scheduled: ${input.title} (${input.inspectionType})`,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
        }, ctx.tenant!.id);

        // Auto-populate into construction project plan (schedule events)
        try {
          const db = await getDb();
          if (db) {
            const [project] = await db.select({ crmJobId: approvalProjects.crmJobId, crmLeadId: approvalProjects.crmLeadId })
              .from(approvalProjects)
              .where(and(eq(approvalProjects.id, input.projectId), eq(approvalProjects.tenantId, ctx.tenant!.id)));
            let jobId: number | null = null;
            if (project?.crmJobId) {
              const [job] = await db.select({ id: constructionJobs.id })
                .from(constructionJobs)
                .where(and(eq(constructionJobs.id, project.crmJobId), eq(constructionJobs.tenantId, ctx.tenant!.id)));
              if (job) jobId = job.id;
            } else if (project?.crmLeadId) {
              // Find construction job by leadId
              const [job] = await db.select({ id: constructionJobs.id })
                .from(constructionJobs)
                .where(and(eq(constructionJobs.leadId, project.crmLeadId), eq(constructionJobs.tenantId, ctx.tenant!.id)));
              if (job) jobId = job.id;
            }
            if (jobId) {
              const startDate = input.scheduledDate ? new Date(input.scheduledDate) : new Date();
              await db.insert(constructionScheduleEvents).values({
                tenantId: ctx.tenant!.id,
                jobId,
                title: `[Approval] ${input.title}`,
                description: `${input.inspectionType} inspection — auto-created from Building Approvals module`,
                startTime: startDate,
                allDay: true,
                eventType: "inspection",
                createdBy: ctx.user.id,
              });
            }
          }
        } catch (e) {
          // Non-critical: log but don't fail the inspection creation
          console.error("[Approvals] Failed to auto-populate inspection into project plan:", e);
        }

        return { id };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), projectId: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(async ({ ctx, input }) => {
        await approvalDb.updateInspection(input.id, input.data as any, ctx.tenant!.id);
        if (input.data.result) {
          await approvalDb.createAuditEntry({
            projectId: input.projectId,
            eventType: "inspection_result",
            entityType: "inspection",
            entityId: input.id,
            summary: `Inspection result: ${input.data.result}`,
            userId: ctx.user.id,
            userName: ctx.user.name || "Unknown",
          }, ctx.tenant!.id);
        }
        return { success: true };
      }),

    defects: router({
      list: protectedProcedure
        .input(z.object({ inspectionId: z.number() }))
        .query(async ({ ctx, input }) => {
          return approvalDb.getDefectsByInspection(input.inspectionId, ctx.tenant!.id);
        }),

      create: protectedProcedure
        .input(z.object({
          inspectionId: z.number(),
          projectId: z.number(),
          title: z.string(),
          description: z.string().optional(),
          severity: z.enum(["minor", "major", "critical"]).optional(),
          assignedToUserId: z.number().optional(),
          assignedToName: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          const id = await approvalDb.createDefect(input, ctx.tenant!.id);
          return { id };
        }),

      update: protectedProcedure
        .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
        .mutation(async ({ ctx, input }) => {
          await approvalDb.updateDefect(input.id, input.data as any, ctx.tenant!.id);
          return { success: true };
        }),
    }),
  }),

  // ─── Fees ─────────────────────────────────────────────────────────────────
  fees: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        return approvalDb.getFeesByProject(input.projectId, ctx.tenant!.id);
      }),

    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        lodgementId: z.number().optional(),
        feeType: z.string(),
        description: z.string(),
        amount: z.string(),
        gstInclusive: z.boolean().optional(),
        dueAt: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const id = await approvalDb.createFee({
          ...input,
          dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
          createdByUserId: ctx.user.id,
        }, ctx.tenant!.id);
        return { id };
      }),

    update: protectedProcedure
      .input(z.object({ id: z.number(), data: z.record(z.string(), z.any()) }))
      .mutation(async ({ ctx, input }) => {
        await approvalDb.updateFee(input.id, input.data as any, ctx.tenant!.id);
        return { success: true };
      }),
  }),

  // ─── Certificates ─────────────────────────────────────────────────────────
  certificates: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        return approvalDb.getCertificatesByProject(input.projectId, ctx.tenant!.id);
      }),

    create: protectedProcedure
      .input(z.object({
        projectId: z.number(),
        lodgementId: z.number().optional(),
        certificateType: z.string(),
        certificateNumber: z.string().optional(),
        issuedBy: z.string().optional(),
        issuedAt: z.string().optional(),
        expiresAt: z.string().optional(),
        notes: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (isCommencementCertificateType(input.certificateType)) {
          const gateStatus = await getProjectHbcfGateStatus(input.projectId, ctx.tenant!.id);
          if (gateStatus.required && !gateStatus.issued) {
            throw new Error(gateStatus.blockers[0] || "Issued HBCF certificate is required before this certificate can be issued");
          }
        }
        const id = await approvalDb.createCertificate({
          ...input,
          issuedAt: input.issuedAt ? new Date(input.issuedAt) : undefined,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
          createdByUserId: ctx.user.id,
        }, ctx.tenant!.id);
        await approvalDb.createAuditEntry({
          projectId: input.projectId,
          eventType: "certificate_issued",
          entityType: "certificate",
          entityId: id,
          summary: `Certificate issued: ${input.certificateType} ${input.certificateNumber || ""}`,
          userId: ctx.user.id,
          userName: ctx.user.name || "Unknown",
        }, ctx.tenant!.id);
        return { id };
      }),
  }),

  // ─── HBCF ─────────────────────────────────────────────────────────────────
  hbcf: router({
    profile: router({
      get: protectedProcedure.query(async ({ ctx }) => {
        return getHbcfBuilderProfile(ctx.tenant!.id);
      }),
      update: adminProcedure
        .input(z.object({
          builderName: z.string().min(1),
          tradingName: z.string().nullable().optional(),
          abn: z.string().nullable().optional(),
          licenceNumber: z.string().nullable().optional(),
          insurerName: z.string().nullable().optional(),
          annualLimit: z.string().optional(),
          annualLimitUsed: z.string().optional(),
          annualLimitYear: z.number().int().optional(),
          apiEnabled: z.boolean().optional(),
          apiBaseUrl: z.string().nullable().optional(),
          apiKeyRef: z.string().nullable().optional(),
          apiMonthlyLimit: z.number().int().min(1).max(2500).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          const id = await upsertHbcfBuilderProfile(ctx.tenant!.id, {
            ...input,
            annualLimit: input.annualLimit || "0",
            annualLimitUsed: input.annualLimitUsed || "0",
            updatedByUserId: ctx.user!.id,
          } as any);
          return { id };
        }),
    }),

    gateStatus: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await approvalDb.getApprovalProjectById(input.projectId, ctx.tenant!.id);
        if (!project) throw new Error("Project not found");
        return getProjectHbcfGateStatus(input.projectId, ctx.tenant!.id);
      }),

    certificates: router({
      list: protectedProcedure
        .input(z.object({
          projectId: z.number().optional(),
          quoteId: z.number().optional(),
          leadId: z.number().optional(),
        }).optional())
        .query(async ({ ctx, input }) => {
          return listHbcfCertificates({
            tenantId: ctx.tenant!.id,
            projectId: input?.projectId,
            quoteId: input?.quoteId,
            leadId: input?.leadId,
          });
        }),
      manualUpsert: protectedProcedure
        .input(z.object({
          approvalProjectId: z.number().optional(),
          quoteId: z.number().optional(),
          crmLeadId: z.number().optional(),
          certificateNumber: z.string().optional(),
          policyNumber: z.string().optional(),
          status: z.string().default("issued"),
          builderName: z.string().optional(),
          builderLicenceNumber: z.string().optional(),
          insurerName: z.string().optional(),
          ownerName: z.string().optional(),
          propertyAddress: z.string().optional(),
          propertySuburb: z.string().optional(),
          propertyPostcode: z.string().optional(),
          contractPrice: z.string().optional(),
          issuedAt: z.string().optional(),
          expiresAt: z.string().optional(),
          certificateUrl: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          const db = await getDb();
          if (!db) throw new Error("Database not available");
          if (input.approvalProjectId) {
            const project = await approvalDb.getApprovalProjectById(input.approvalProjectId, ctx.tenant!.id);
            if (!project) throw new Error("Project not found");
          }
          if (input.quoteId) {
            const quoteConditions: any[] = [eq(quotes.id, input.quoteId)];
            appendExactQuoteTenantScope(quoteConditions, quotes.tenantId, ctx.tenant!.id);
            const [quote] = await db.select({ id: quotes.id }).from(quotes).where(and(...quoteConditions)).limit(1);
            if (!quote) throw new Error("Quote not found");
          }
          if (input.crmLeadId) {
            const leadConditions: any[] = [eq(crmLeads.id, input.crmLeadId)];
            appendTenantScope(leadConditions, crmLeads.tenantId, ctx.tenant!.id);
            const [lead] = await db.select({ id: crmLeads.id }).from(crmLeads).where(and(...leadConditions)).limit(1);
            if (!lead) throw new Error("Lead not found");
          }
          const id = await createOrUpdateHbcfCertificate({
            ...input,
            tenantId: ctx.tenant!.id,
            source: "manual",
            syncStatus: "not_synced",
            issuedAt: input.issuedAt ? new Date(input.issuedAt) : undefined,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
            createdByUserId: ctx.user.id,
          } as any);
          if (input.approvalProjectId) {
            await approvalDb.createAuditEntry({
              projectId: input.approvalProjectId,
              eventType: "hbcf_certificate_recorded",
              entityType: "hbcf_certificate",
              entityId: id,
              summary: `HBCF certificate recorded: ${input.certificateNumber || input.policyNumber || "manual entry"}`,
              userId: ctx.user.id,
              userName: ctx.user.name || "Unknown",
              details: input,
            }, ctx.tenant!.id);
          }
          return { id };
        }),
      syncProject: protectedProcedure
        .input(z.object({ projectId: z.number() }))
        .mutation(async ({ ctx, input }) => {
          const project = await approvalDb.getApprovalProjectById(input.projectId, ctx.tenant!.id);
          if (!project) throw new Error("Project not found");
          return syncProjectHbcfFromApi(input.projectId, ctx.tenant!.id, ctx.user.id);
        }),
    }),

    competitorMatches: router({
      run: protectedProcedure
        .input(z.object({
          leadIds: z.array(z.number()).optional(),
          forceRefresh: z.boolean().optional(),
        }).optional())
        .mutation(async ({ ctx, input }) => {
          return runHbcfCompetitorMatching({
            tenantId: ctx.tenant!.id,
            leadIds: input?.leadIds,
            forceRefresh: input?.forceRefresh,
          });
        }),
      list: protectedProcedure
        .input(z.object({
          leadId: z.number().optional(),
          limit: z.number().min(1).max(200).optional(),
          offset: z.number().min(0).optional(),
        }).optional())
        .query(async ({ ctx, input }) => {
          return listHbcfCompetitorMatches({
            tenantId: ctx.tenant!.id,
            leadId: input?.leadId,
            limit: input?.limit,
            offset: input?.offset,
          });
        }),
    }),
  }),

  // ─── Timeline ─────────────────────────────────────────────────────────────
  timeline: protectedProcedure
    .input(z.object({ projectId: z.number() }))
    .query(async ({ ctx, input }) => {
      return approvalDb.getProjectTimeline(input.projectId, ctx.tenant!.id);
    }),

  // ─── Audit Log ────────────────────────────────────────────────────────────
  auditLog: protectedProcedure
    .input(z.object({ projectId: z.number(), limit: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      return approvalDb.getAuditLogByProject(input.projectId, input.limit, ctx.tenant!.id);
    }),

  // ─── Cross-Project Calendar Events ────────────────────────────────────────
  calendarEvents: protectedProcedure
    .input(z.object({ month: z.number().min(1).max(12), year: z.number() }))
    .query(async ({ ctx, input }) => {
      return approvalDb.getCrossProjectCalendarEvents(input.month, input.year, ctx.tenant!.id);
    }),

  // ─── Bulk Document Upload ──────────────────────────────────────────────────
  bulkUpload: protectedProcedure
    .input(z.object({
      projectId: z.number(),
      lodgementId: z.number().optional(),
      files: z.array(z.object({
        fileName: z.string(),
        fileMimeType: z.string(),
        fileBase64: z.string(),
        documentType: z.string().optional(),
        title: z.string().optional(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const results: { fileName: string; documentId: number; documentType: string; title: string }[] = [];

      for (const file of input.files) {
        // Auto-categorise based on filename patterns
        const categorised = autoCategoriseDocument(file.fileName);
        const documentType = file.documentType || categorised.type;
        const title = file.title || categorised.title;

        // Create document record
        const docId = await approvalDb.createDocument({
          projectId: input.projectId,
          lodgementId: input.lodgementId,
          documentType,
          title,
          status: "draft",
          createdByUserId: ctx.user.id,
        }, ctx.tenant!.id);

        // Upload file to S3
        const buffer = Buffer.from(file.fileBase64, "base64");
        const suffix = randomBytes(4).toString("hex");
        const fileKey = `approvals/${input.projectId}/${docId}/${suffix}-${file.fileName}`;
        const { url } = await storagePut(fileKey, buffer, file.fileMimeType);

        // Create version
        await approvalDb.createDocumentVersion({
          documentId: docId,
          versionNumber: 1,
          fileKey,
          fileUrl: url,
          fileName: file.fileName,
          fileMimeType: file.fileMimeType,
          fileSize: buffer.length,
          uploadedByUserId: ctx.user.id,
          uploadedByName: ctx.user.name || "Unknown",
        }, ctx.tenant!.id);

        results.push({ fileName: file.fileName, documentId: docId, documentType, title });
      }

      // Audit
      await approvalDb.createAuditEntry({
        projectId: input.projectId,
        eventType: "bulk_upload",
        entityType: "document",
        entityId: 0,
        summary: `Bulk upload: ${results.length} documents uploaded`,
        userId: ctx.user.id,
        userName: ctx.user.name || "Unknown",
      }, ctx.tenant!.id);

      return { uploaded: results.length, documents: results };
    }),

  // ─── Clone Project ─────────────────────────────────────────────────────────
  cloneProject: protectedProcedure
    .input(z.object({
      sourceProjectId: z.number(),
      newName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get source project
      const source = await approvalDb.getApprovalProjectById(input.sourceProjectId, ctx.tenant!.id);
      if (!source) throw new Error("Source project not found");

      // Generate new project number
      const projectNumber = await approvalDb.generateProjectNumber();
      const newName = input.newName || `Copy of ${source.name}`;

      // Clone project (reset status fields)
      const newProjectId = await approvalDb.createApprovalProject({
        projectNumber,
        name: newName,
        jurisdiction: source.jurisdiction,
        propertyAddress: source.propertyAddress,
        propertySuburb: source.propertySuburb,
        propertyState: source.propertyState,
        propertyPostcode: source.propertyPostcode,
        lotNumber: source.lotNumber,
        dpNumber: source.dpNumber,
        sectionNumber: source.sectionNumber,
        blockNumber: source.blockNumber,
        zoning: source.zoning,
        buildingClass: source.buildingClass,
        estimatedCost: source.estimatedCost,
        descriptionOfWork: source.descriptionOfWork,
        clientContactId: source.clientContactId,
        clientName: source.clientName,
        applicantName: source.applicantName,
        applicantContactId: source.applicantContactId,
        certifierName: source.certifierName,
        certifierContactId: source.certifierContactId,
        riskFlags: source.riskFlags,
        recommendedPathway: source.recommendedPathway,
        confirmedPathway: source.confirmedPathway,
        workflowTemplateId: source.workflowTemplateId,
        currentState: "intake",
        currentGate: 0,
        overallStatus: "intake",
        crmJobId: source.crmJobId,
        crmLeadId: source.crmLeadId,
        projectManagerId: source.projectManagerId,
        projectManagerName: source.projectManagerName,
        tenantId: ctx.tenant!.id,
        createdByUserId: ctx.user.id,
      });

      // Clone document checklist (documents without file versions — just placeholders)
      const sourceDocs = await approvalDb.getDocumentsByProject(input.sourceProjectId, ctx.tenant!.id);
      let docsCloned = 0;
      for (const doc of sourceDocs) {
        if (doc.checklistRequired) {
          await approvalDb.createDocument({
            projectId: newProjectId,
            documentType: (doc as any).documentType,
            title: (doc as any).title,
            description: (doc as any).description,
            checklistRequired: true,
            checklistStage: (doc as any).checklistStage,
            signatureRequired: (doc as any).signatureRequired,
            preparedByParty: (doc as any).preparedByParty,
            createdByUserId: ctx.user.id,
          }, ctx.tenant!.id);
          docsCloned++;
        }
      }

      // Audit
      await approvalDb.createAuditEntry({
        projectId: newProjectId,
        eventType: "project_cloned",
        entityType: "project",
        entityId: newProjectId,
        summary: `Cloned from ${source.projectNumber} (${source.name}). ${docsCloned} checklist documents copied.`,
        userId: ctx.user.id,
        userName: ctx.user.name || "Unknown",
      }, ctx.tenant!.id);

      return { newProjectId, projectNumber, docsCloned };
    }),

  // ─── Cross-Project Aggregate Views ──────────────────────────────────────────

  allTasks: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      priority: z.string().optional(),
      limit: z.number().optional().default(100),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [];
      appendTenantScope(conditions, approvalProjects.tenantId, ctx.tenant!.id);
      if (input.status && input.status !== "all") {
        conditions.push(eq(approvalTasks.status, input.status as any));
      }
      if (input.priority && input.priority !== "all") {
        conditions.push(eq(approvalTasks.priority, input.priority as any));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select({
        id: approvalTasks.id,
        projectId: approvalTasks.projectId,
        title: approvalTasks.title,
        taskType: approvalTasks.taskType,
        status: approvalTasks.status,
        priority: approvalTasks.priority,
        assignedToName: approvalTasks.assignedToName,
        dueAt: approvalTasks.dueAt,
        completedAt: approvalTasks.completedAt,
        gateNumber: approvalTasks.gateNumber,
        createdAt: approvalTasks.createdAt,
        projectName: approvalProjects.name,
        projectNumber: approvalProjects.projectNumber,
      })
        .from(approvalTasks)
        .leftJoin(approvalProjects, eq(approvalTasks.projectId, approvalProjects.id))
        .where(where)
        .orderBy(desc(approvalTasks.createdAt))
        .limit(input.limit);
    }),

  allDocuments: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      documentType: z.string().optional(),
      limit: z.number().optional().default(100),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [];
      appendTenantScope(conditions, approvalProjects.tenantId, ctx.tenant!.id);
      if (input.status && input.status !== "all") {
        conditions.push(eq(approvalDocuments.status, input.status as any));
      }
      if (input.documentType && input.documentType !== "all") {
        conditions.push(eq(approvalDocuments.documentType, input.documentType as any));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select({
        id: approvalDocuments.id,
        projectId: approvalDocuments.projectId,
        title: approvalDocuments.title,
        documentType: approvalDocuments.documentType,
        status: approvalDocuments.status,
        signatureRequired: approvalDocuments.signatureRequired,
        checklistRequired: approvalDocuments.checklistRequired,
        preparedByParty: approvalDocuments.preparedByParty,
        createdAt: approvalDocuments.createdAt,
        projectName: approvalProjects.name,
        projectNumber: approvalProjects.projectNumber,
      })
        .from(approvalDocuments)
        .leftJoin(approvalProjects, eq(approvalDocuments.projectId, approvalProjects.id))
        .where(where)
        .orderBy(desc(approvalDocuments.createdAt))
        .limit(input.limit);
    }),

  allRfis: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      limit: z.number().optional().default(100),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [];
      appendTenantScope(conditions, approvalProjects.tenantId, ctx.tenant!.id);
      if (input.status && input.status !== "all") {
        conditions.push(eq(approvalRfis.status, input.status as any));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select({
        id: approvalRfis.id,
        projectId: approvalRfis.projectId,
        subject: approvalRfis.subject,
        status: approvalRfis.status,
        isBlocking: approvalRfis.isBlocking,
        requestedBy: approvalRfis.requestedBy,
        assignedToName: approvalRfis.assignedToName,
        dueAt: approvalRfis.dueAt,
        receivedAt: approvalRfis.receivedAt,
        respondedAt: approvalRfis.respondedAt,
        createdAt: approvalRfis.createdAt,
        projectName: approvalProjects.name,
        projectNumber: approvalProjects.projectNumber,
      })
        .from(approvalRfis)
        .leftJoin(approvalProjects, eq(approvalRfis.projectId, approvalProjects.id))
        .where(where)
        .orderBy(desc(approvalRfis.createdAt))
        .limit(input.limit);
    }),

  allInspections: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      limit: z.number().optional().default(100),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [];
      appendTenantScope(conditions, approvalProjects.tenantId, ctx.tenant!.id);
      if (input.status && input.status !== "all") {
        conditions.push(eq(approvalInspections.status, input.status as any));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      return db.select({
        id: approvalInspections.id,
        projectId: approvalInspections.projectId,
        title: approvalInspections.title,
        inspectionType: approvalInspections.inspectionType,
        status: approvalInspections.status,
        scheduledDate: approvalInspections.scheduledDate,
        scheduledTime: approvalInspections.scheduledTime,
        inspectorName: approvalInspections.inspectorName,
        isBlocking: approvalInspections.isBlocking,
        result: approvalInspections.result,
        createdAt: approvalInspections.createdAt,
        projectName: approvalProjects.name,
        projectNumber: approvalProjects.projectNumber,
      })
        .from(approvalInspections)
        .leftJoin(approvalProjects, eq(approvalInspections.projectId, approvalProjects.id))
        .where(where)
        .orderBy(desc(approvalInspections.createdAt))
        .limit(input.limit);
    }),
});

// ─── Auto-categorise helper ─────────────────────────────────────────────────
function autoCategoriseDocument(fileName: string): { type: string; title: string } {
  const lower = fileName.toLowerCase().replace(/[_-]/g, " ");
  const patterns: { regex: RegExp; type: string; title: string }[] = [
    { regex: /site\s*plan/, type: "site_plan", title: "Site Plan" },
    { regex: /floor\s*plan/, type: "floor_plan", title: "Floor Plan" },
    { regex: /elevation/, type: "elevations", title: "Elevations" },
    { regex: /section/, type: "sections", title: "Sections" },
    { regex: /survey/, type: "survey", title: "Survey" },
    { regex: /basix/, type: "basix_certificate", title: "BASIX Certificate" },
    { regex: /struct/, type: "structural_engineering", title: "Structural Engineering" },
    { regex: /geot/, type: "geotechnical_report", title: "Geotechnical Report" },
    { regex: /storm\s*water|drainage/, type: "stormwater_plan", title: "Stormwater Plan" },
    { regex: /landscap/, type: "landscape_plan", title: "Landscape Plan" },
    { regex: /shadow/, type: "shadow_diagram", title: "Shadow Diagram" },
    { regex: /waste/, type: "waste_management", title: "Waste Management Plan" },
    { regex: /bushfire|bap|bal/, type: "bushfire_report", title: "Bushfire Assessment" },
    { regex: /heritage/, type: "heritage_report", title: "Heritage Report" },
    { regex: /acoustic|noise/, type: "acoustic_report", title: "Acoustic Report" },
    { regex: /traffic/, type: "traffic_report", title: "Traffic Report" },
    { regex: /arborist|tree/, type: "arborist_report", title: "Arborist Report" },
    { regex: /statement.*environ|see|sei/, type: "environmental_impact", title: "Environmental Impact Statement" },
    { regex: /owner.*consent/, type: "owner_consent", title: "Owner's Consent" },
    { regex: /cost.*report|qsr|quantity/, type: "cost_report", title: "Cost Report" },
    { regex: /spec|specification/, type: "specification", title: "Specification" },
    { regex: /cert|compliance/, type: "compliance_certificate", title: "Compliance Certificate" },
    { regex: /photo|image/, type: "photographs", title: "Photographs" },
    { regex: /contract/, type: "contract", title: "Contract" },
    { regex: /insurance/, type: "insurance", title: "Insurance Certificate" },
  ];

  for (const p of patterns) {
    if (p.regex.test(lower)) {
      return { type: p.type, title: p.title };
    }
  }

  // Fallback: use filename without extension as title
  const nameWithoutExt = fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
  return { type: "other", title: nameWithoutExt || "Untitled Document" };
}
