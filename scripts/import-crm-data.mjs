import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";
import { parse } from "csv-parse/sync";

const args = process.argv.slice(2);
const sourceDir = args.find((arg) => !arg.startsWith("--"));
const apply = args.includes("--apply");
const tenantSlug = valueFor("--tenant-slug") || process.env.DEFAULT_TENANT_SLUG || "default";
const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_URL;

if (!sourceDir) {
  console.error("Usage: node scripts/import-crm-data.mjs <export-directory> [--apply] [--tenant-slug default]");
  process.exit(1);
}

if (apply && !databaseUrl) {
  console.error("DATABASE_URL, MYSQL_PUBLIC_URL, or MYSQL_URL is required when using --apply.");
  process.exit(1);
}

function valueFor(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : null;
}

async function readCsv(fileName) {
  const filePath = path.join(sourceDir, fileName);
  const content = await fs.readFile(filePath, "utf8");
  return parse(content, {
    columns: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: false,
  });
}

async function readMarkdownBlocks(fileName) {
  const filePath = path.join(sourceDir, fileName);
  const markdown = await fs.readFile(filePath, "utf8");
  const blocks = {};
  for (const section of markdown.split(/^## /m).slice(1)) {
    const newlineIndex = section.indexOf("\n");
    const table = section.slice(0, newlineIndex).trim();
    const body = section.slice(newlineIndex + 1);
    const dataMatch = body.match(/### Data \((?:[^)]+)\)\s+```json\s+([\s\S]*?)```/);
    if (dataMatch) {
      blocks[table] = JSON.parse(dataMatch[1]);
    } else if (/### Data \(0 rows?\)\s+\*\(No rows\)\*/.test(body)) {
      blocks[table] = [];
    }
  }
  return blocks;
}

function nil(value) {
  return value === undefined || value === null || value === "" ? null : value;
}

function str(value, max) {
  const valueOrNull = nil(value);
  if (valueOrNull === null) return null;
  const text = String(valueOrNull);
  return max && text.length > max ? text.slice(0, max) : text;
}

function num(value) {
  const valueOrNull = nil(value);
  if (valueOrNull === null) return null;
  const n = Number(valueOrNull);
  return Number.isFinite(n) ? n : null;
}

function bool(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function date(value) {
  const valueOrNull = nil(value);
  if (valueOrNull === null) return null;
  const d = new Date(valueOrNull);
  return Number.isNaN(d.getTime()) ? null : d;
}

function json(value) {
  const valueOrNull = nil(value);
  if (valueOrNull === null) return null;
  if (typeof valueOrNull === "string") {
    try {
      return JSON.stringify(JSON.parse(valueOrNull));
    } catch {
      return null;
    }
  }
  return JSON.stringify(valueOrNull);
}

function lostAutoSetAt(row) {
  const raw = nil(row.lostAt);
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return date(raw);
  return new Date(n > 10_000_000_000 ? n : n * 1000);
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

function quoteIdent(name) {
  return `\`${name.replaceAll("`", "``")}\``;
}

async function getTenantId(connection) {
  const [rows] = await connection.execute("SELECT id FROM tenants WHERE slug = ? LIMIT 1", [tenantSlug]);
  const tenantId = rows?.[0]?.id;
  if (!tenantId) throw new Error(`Tenant '${tenantSlug}' was not found.`);
  return tenantId;
}

async function batchUpsert(connection, table, columns, rows, options = {}) {
  if (!rows.length) return 0;
  const updateColumns = options.updateColumns ?? columns.filter((column) => column !== "id");
  const values = rows.map((row) => columns.map((column) => row[column] ?? null));
  const sql = `
    INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")})
    VALUES ?
    ON DUPLICATE KEY UPDATE
      ${updateColumns.map((column) => `${quoteIdent(column)} = VALUES(${quoteIdent(column)})`).join(", ")}
  `;
  let count = 0;
  for (const batch of chunk(values, options.batchSize ?? 500)) {
    await connection.query(sql, [batch]);
    count += batch.length;
  }
  return count;
}

function mapLeads(rows, tenantId) {
  return rows.map((row) => ({
    id: num(row.id),
    tenantId,
    leadNumber: str(row.leadNumber, 20) || `L-${row.id}`,
    contactFirstName: str(row.contactFirstName, 100),
    contactLastName: str(row.contactLastName, 100),
    contactPhone: str(row.contactPhone, 50),
    contactEmail: str(row.contactEmail, 320),
    contactAddress: str(row.contactAddress),
    company: str(row.company, 255),
    suburb: str(row.suburb, 128),
    state: str(row.state, 32),
    postcode: str(row.postcode, 16),
    productType: str(row.productType, 100),
    leadSource: str(row.leadSource, 100),
    status: str(row.status, 32) || "new",
    outcome: str(row.outcome, 100),
    lostReason: str(row.lostReason, 255),
    lostSource: null,
    lostCompetitorName: null,
    lostAutoSetAt: lostAutoSetAt(row),
    lostPreviousStatus: str(row.previousStatus, 64),
    designAdvisor: str(row.designAdvisor, 100),
    franchiseNumber: str(row.franchiseNumber, 20),
    franchiseType: str(row.franchiseType, 50),
    assignedDate: date(row.assignedDate),
    notes: str(row.notes),
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    detectedRegion: str(row.detectedRegion, 64),
    branchId: num(row.branchId),
    constructionJobNumber: str(row.constructionJobNumber, 64),
    leadDate: str(row.leadDate, 10),
    externalLeadNumber: str(row.externalLeadNumber, 32),
    sourceUrl: str(row.sourceUrl),
    assignedTo: num(row.assignedTo),
    archived: bool(row.archived),
    createdBy: num(row.createdBy),
    createdAt: date(row.createdAt) ?? new Date(),
    updatedAt: date(row.updatedAt) ?? new Date(),
  }));
}

function mapContracts(rows) {
  return rows.map((row) => ({
    id: num(row.id),
    leadId: num(row.leadId),
    contractDate: str(row.contractDate, 20),
    contractValue: str(row.contractValue, 32),
    depositAmount: str(row.depositAmount, 32),
    depositDate: str(row.depositDate, 20),
    paymentSchedule: str(row.paymentSchedule),
    welcomeLetterSent: bool(row.welcomeLetterSent),
    welcomeLetterDate: str(row.welcomeLetterDate, 20),
    notes: str(row.notes),
    createdAt: date(row.createdAt) ?? new Date(),
  })).filter((row) => row.leadId);
}

function mapClientActivities(rows) {
  return rows.map((row) => ({
    id: num(row.id),
    jobId: num(row.jobId) ?? 0,
    leadId: num(row.leadId),
    activityType: str(row.activityType, 16) || "note",
    title: str(row.title, 255),
    content: str(row.content),
    fileUrl: str(row.fileUrl),
    fileKey: str(row.fileKey),
    fileName: str(row.fileName, 255),
    fileMimeType: str(row.fileMimeType, 128),
    portalVisible: bool(row.portalVisible),
    createdBy: num(row.createdBy) ?? 1,
    createdByName: str(row.createdByName, 100) || "Imported",
    createdAt: date(row.createdAt) ?? new Date(),
    updatedAt: date(row.updatedAt) ?? new Date(),
  }));
}

function mapCallLogs(rows, tenantId) {
  return rows.map((row) => ({
    id: num(row.id),
    tenantId,
    leadId: num(row.leadId),
    direction: str(row.direction, 16) || "inbound",
    fromNumber: str(row.fromNumber, 128) || "",
    toNumber: str(row.toNumber, 128) || "",
    duration: num(row.duration) ?? 0,
    recordingUrl: str(row.recordingUrl),
    vocphoneCallId: str(row.vocphoneCallId, 128),
    callSummary: str(row.callSummary),
    transcription: str(row.transcription),
    extension: num(row.extension),
    extensionUserName: str(row.extensionUserName, 100),
    userNotes: str(row.userNotes),
    reviewed: bool(row.reviewed),
    reviewedAt: date(row.reviewedAt),
    snoozedUntil: date(row.snoozedUntil),
    createdAt: date(row.createdAt) ?? new Date(),
  }));
}

function mapDaTrackerApplications(rows, tenantId) {
  return rows.map((row) => ({
    id: num(row.id),
    tenantId,
    da_number: num(row.da_number),
    object_id: num(row.object_id),
    activity: num(row.activity),
    block_key: num(row.block_key),
    district: str(row.district, 100),
    division: str(row.division, 100),
    section: num(row.section),
    block: num(row.block),
    lodgement_date: date(row.lodgement_date),
    application_type: str(row.application_type, 20),
    subclass: str(row.subclass, 100),
    shape_area: num(row.shape_area),
    shape_length: num(row.shape_length),
    centroid_lat: num(row.centroid_lat),
    centroid_lng: num(row.centroid_lng),
    polygon_json: json(row.polygon_json),
    first_seen_at: date(row.first_seen_at) ?? new Date(),
    last_seen_at: date(row.last_seen_at) ?? new Date(),
    removed_at: date(row.removed_at),
    last_hash: str(row.last_hash, 64),
  })).filter((row) => row.da_number && row.object_id);
}

function mapMarkdown(blocks, tenantId) {
  return {
    lead_notes: (blocks.lead_notes ?? []).map((row) => ({
      id: num(row.id),
      leadId: num(row.leadId),
      section: str(row.section, 32) || "general",
      userId: num(row.userId) ?? 1,
      userName: str(row.userName, 100) || "Imported",
      content: str(row.content) || "",
      pinned: bool(row.pinned),
      category: str(row.category, 32) || "general",
      createdAt: date(row.createdAt) ?? new Date(),
    })).filter((row) => row.leadId),
    crm_appointments: (blocks.crm_appointments ?? []).map((row) => ({
      id: num(row.id),
      tenantId,
      leadId: num(row.leadId),
      appointmentType: str(row.appointmentType, 64),
      assignedUserId: num(row.assignedUserId),
      appointmentDate: str(row.appointmentDate, 20),
      appointmentTime: str(row.appointmentTime, 20),
      duration: num(row.duration) ?? 60,
      location: str(row.location),
      notes: str(row.notes),
      outcome: str(row.outcome, 100),
      participants: json(row.calendarParticipants),
      nylasEventId: str(row.nylasEventId, 255),
      calendarSyncStatus: str(row.calendarSyncStatus, 32) || "not_synced",
      calendarSyncError: str(row.calendarSyncError),
      calendarSyncedAt: date(row.calendarSyncedAt),
      createdAt: date(row.createdAt) ?? new Date(),
    })).filter((row) => row.leadId),
    crm_activities: (blocks.crm_activities ?? []).map((row) => ({
      id: num(row.id),
      leadId: num(row.leadId),
      activityType: str(row.activityType, 50) || "note",
      description: str(row.description),
      emailType: str(row.emailType, 100),
      sentDate: str(row.sentDate, 20),
      createdAt: date(row.createdAt) ?? new Date(),
    })).filter((row) => row.leadId),
    crm_documents: (blocks.crm_documents ?? []).map((row) => ({
      id: num(row.id),
      leadId: num(row.leadId),
      fileName: str(row.fileName, 255) || "Imported file",
      fileUrl: str(row.fileUrl) || "",
      fileKey: str(row.fileKey, 500) || "",
      uploadedAt: date(row.uploadedAt) ?? new Date(),
    })).filter((row) => row.leadId),
    crm_dropdown_options: (blocks.crm_dropdown_options ?? []).map((row) => ({
      id: num(row.id),
      category: str(row.category, 64) || "general",
      value: str(row.value, 128) || "",
      label: str(row.label, 128) || str(row.value, 128) || "",
      sortOrder: num(row.sortOrder) ?? 0,
      active: bool(row.active),
      createdAt: date(row.createdAt) ?? new Date(),
    })),
    sms_messages: (blocks.sms_messages ?? []).map((row) => ({
      id: num(row.id),
      tenantId,
      leadId: num(row.leadId),
      direction: str(row.direction, 16) || "outbound",
      fromNumber: str(row.fromNumber, 20) || "",
      toNumber: str(row.toNumber, 20) || "",
      body: str(row.body) || "",
      templateId: num(row.templateId),
      status: str(row.status, 32) || "sent",
      vocphoneMessageId: str(row.vocphoneMessageId, 128),
      sentBy: num(row.sentBy),
      createdAt: date(row.createdAt) ?? new Date(),
    })),
    crm_building_authority: (blocks.crm_building_authority ?? []).map((row) => ({
      id: num(row.id),
      leadId: num(row.leadId),
      councilName: str(row.councilName, 200),
      applicationDate: str(row.applicationDate, 20),
      approvalDate: str(row.approvalDate, 20),
      approvalNumber: str(row.approvalNumber, 100),
      status: str(row.status, 50),
      councilLetterType: str(row.councilLetterType, 50),
      councilLetterSentDate: str(row.councilLetterSentDate, 20),
      notes: str(row.notes),
      createdAt: date(row.createdAt) ?? new Date(),
    })).filter((row) => row.leadId),
    da_tracker_poll_log: (blocks.da_tracker_poll_log ?? []).map((row) => ({
      id: num(row.id),
      tenantId,
      started_at: date(row.started_at) ?? new Date(),
      completed_at: date(row.completed_at),
      total_fetched: num(row.total_fetched),
      new_applications: num(row.new_applications) ?? 0,
      updated_applications: num(row.updated_applications) ?? 0,
      removed_applications: num(row.removed_applications) ?? 0,
      error_message: str(row.error_message),
      duration_ms: num(row.duration_ms),
    })),
    approval_projects: (blocks.approval_projects ?? []).map((row) => ({
      id: num(row.id),
      tenantId,
      projectNumber: str(row.projectNumber, 32) || `BA-${row.id}`,
      name: str(row.name, 255) || `Approval ${row.id}`,
      jurisdiction: str(row.jurisdiction, 8) || "ACT",
      propertyAddress: str(row.propertyAddress),
      propertySuburb: str(row.propertySuburb, 128),
      propertyState: str(row.propertyState, 16),
      propertyPostcode: str(row.propertyPostcode, 10),
      lotNumber: str(row.lotNumber, 32),
      dpNumber: str(row.dpNumber, 32),
      sectionNumber: str(row.sectionNumber, 32),
      blockNumber: str(row.blockNumber, 32),
      zoning: str(row.zoning, 128),
      buildingClass: str(row.buildingClass, 64) || "10a",
      estimatedCost: str(row.estimatedCost, 32),
      descriptionOfWork: str(row.descriptionOfWork),
      targetStartDate: date(row.targetStartDate),
      clientContactId: num(row.clientContactId),
      clientName: str(row.clientName, 255),
      applicantName: str(row.applicantName, 255),
      applicantContactId: num(row.applicantContactId),
      certifierName: str(row.certifierName, 255),
      certifierContactId: num(row.certifierContactId),
      riskFlags: json(row.riskFlags),
      recommendedPathway: str(row.recommendedPathway, 64),
      confirmedPathway: str(row.confirmedPathway, 64),
      pathwayConfidence: str(row.pathwayConfidence, 16),
      pathwayAssumptions: str(row.pathwayAssumptions),
      workflowTemplateId: num(row.workflowTemplateId),
      currentState: str(row.currentState, 64) || "intake",
      currentGate: num(row.currentGate) ?? 0,
      overallStatus: str(row.overallStatus, 32) || "intake",
      crmJobId: num(row.crmJobId),
      crmLeadId: num(row.crmLeadId),
      projectManagerId: num(row.projectManagerId),
      projectManagerName: str(row.projectManagerName, 255),
      createdAt: date(row.createdAt) ?? new Date(),
      updatedAt: date(row.updatedAt) ?? new Date(),
      completedAt: date(row.completedAt),
      createdByUserId: num(row.createdByUserId),
    })),
    approval_pathway_assessments: (blocks.approval_pathway_assessments ?? []).map((row) => ({
      id: num(row.id),
      projectId: num(row.projectId),
      checklistResponses: json(row.checklistResponses),
      recommendedPathway: str(row.recommendedPathway, 64),
      confidence: str(row.confidence, 16),
      assumptions: str(row.assumptions),
      notes: str(row.notes),
      assessedByUserId: num(row.assessedByUserId),
      assessedByName: str(row.assessedByName, 255),
      assessedAt: date(row.assessedAt) ?? new Date(),
      supersededAt: date(row.supersededAt),
      createdAt: date(row.createdAt) ?? new Date(),
    })).filter((row) => row.projectId),
    approval_tasks: (blocks.approval_tasks ?? []).map((row) => ({
      id: num(row.id),
      projectId: num(row.projectId),
      lodgementId: num(row.lodgementId),
      title: str(row.title, 255) || "Imported task",
      description: str(row.description),
      taskType: str(row.taskType, 32) || "custom",
      status: str(row.status, 32) || "pending",
      priority: str(row.priority, 16) || "medium",
      assignedToUserId: num(row.assignedToUserId),
      assignedToName: str(row.assignedToName, 255),
      dueAt: date(row.dueAt),
      completedAt: date(row.completedAt),
      workflowState: str(row.workflowState, 64),
      gateNumber: num(row.gateNumber),
      autoGenerated: bool(row.autoGenerated),
      createdAt: date(row.createdAt) ?? new Date(),
      updatedAt: date(row.updatedAt) ?? new Date(),
      createdByUserId: num(row.createdByUserId),
    })).filter((row) => row.projectId),
  };
}

const csvData = {
  crm_leads: mapLeads(await readCsv("crm_leads-full.csv"), null),
  crm_contracts: mapContracts(await readCsv("crm_contracts-full.csv")),
  client_activities: mapClientActivities(await readCsv("client_activities-full.csv")),
  call_logs: mapCallLogs(await readCsv("call_logs-full.csv"), null),
  da_tracker_applications: mapDaTrackerApplications(await readCsv("da_tracker_applications-full.csv"), null),
};
const markdownBlocks = await readMarkdownBlocks("leads-hbcf-da-export.md");

console.log("Parsed import files:", JSON.stringify({
  csv: Object.fromEntries(Object.entries(csvData).map(([table, rows]) => [table, rows.length])),
  markdown: Object.fromEntries(Object.entries(markdownBlocks).map(([table, rows]) => [table, rows.length])),
}, null, 2));

if (!apply) {
  console.log("Dry run only. Add --apply to write to the database.");
  process.exit(0);
}

const connection = await mysql.createConnection(databaseUrl);
try {
  const tenantId = await getTenantId(connection);
  csvData.crm_leads = mapLeads(await readCsv("crm_leads-full.csv"), tenantId);
  csvData.call_logs = mapCallLogs(await readCsv("call_logs-full.csv"), tenantId);
  csvData.da_tracker_applications = mapDaTrackerApplications(await readCsv("da_tracker_applications-full.csv"), tenantId);
  const md = mapMarkdown(markdownBlocks, tenantId);

  const imported = {};
  imported.crm_leads = await batchUpsert(connection, "crm_leads", Object.keys(csvData.crm_leads[0]), csvData.crm_leads, { batchSize: 500 });
  imported.crm_contracts = await batchUpsert(connection, "crm_contracts", Object.keys(csvData.crm_contracts[0]), csvData.crm_contracts, { batchSize: 500 });
  imported.client_activities = await batchUpsert(connection, "client_activities", Object.keys(csvData.client_activities[0]), csvData.client_activities, { batchSize: 500 });
  imported.call_logs = await batchUpsert(connection, "call_logs", Object.keys(csvData.call_logs[0]), csvData.call_logs, { batchSize: 500 });
  imported.da_tracker_applications = await batchUpsert(connection, "da_tracker_applications", Object.keys(csvData.da_tracker_applications[0]), csvData.da_tracker_applications, { batchSize: 250 });

  for (const [table, rows] of Object.entries(md)) {
    if (!rows.length) {
      imported[table] = 0;
      continue;
    }
    imported[table] = await batchUpsert(connection, table, Object.keys(rows[0]), rows, { batchSize: 500 });
  }

  console.log(`Imported CRM/DA data for tenant '${tenantSlug}' (${tenantId}).`);
  console.log(JSON.stringify(imported, null, 2));
} finally {
  await connection.end();
}
