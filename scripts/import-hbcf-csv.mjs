import fs from "node:fs";
import mysql from "mysql2/promise";

const tenantId = Number(process.env.HBCF_IMPORT_TENANT_ID || "1");
const certificatesPath = process.env.HBCF_CERTIFICATES_CSV
  || "/Users/tony_mac/Dropbox Business Dropbox/Tony Commisso/My Mac (Tonys-MacBook-Pro.local)/Downloads/hbcf_certificates.csv";
const builderProfilePath = process.env.HBCF_BUILDER_PROFILE_CSV
  || "/Users/tony_mac/Dropbox Business Dropbox/Tony Commisso/My Mac (Tonys-MacBook-Pro.local)/Downloads/hbcf_builder_profile.csv";
const syncLogPath = process.env.HBCF_SYNC_LOG_CSV
  || "/Users/tony_mac/Dropbox Business Dropbox/Tony Commisso/My Mac (Tonys-MacBook-Pro.local)/Downloads/hbcf_sync_log.csv";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value !== "")) rows.push(row);
  }

  const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, "")) || [];
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function readCsv(path) {
  return parseCsv(fs.readFileSync(path, "utf8"));
}

function value(input) {
  const trimmed = String(input ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

function numberValue(input) {
  const trimmed = value(input);
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolValue(input) {
  return ["1", "true", "yes"].includes(String(input ?? "").trim().toLowerCase());
}

function dateValue(input) {
  const raw = value(input);
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const numeric = Number(raw);
    const ms = numeric > 10_000_000_000 ? numeric : numeric * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function jsonValue(input) {
  const raw = value(input);
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw));
  } catch {
    return JSON.stringify({ importedRawData: raw });
  }
}

function statusValue(input) {
  const raw = value(input)?.toLowerCase();
  if (!raw) return "draft";
  if (raw.includes("issued") || raw === "active") return "issued";
  if (raw.includes("cancel")) return "cancelled";
  if (raw.includes("expired")) return "expired";
  if (raw.includes("pending")) return "pending";
  return raw.slice(0, 32);
}

function confidenceValue(input) {
  const raw = value(input)?.toLowerCase();
  return raw === "high" || raw === "medium" || raw === "low" ? raw : "medium";
}

async function existingIdSet(conn, table, ids) {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  const existing = new Set();
  for (let i = 0; i < unique.length; i += 500) {
    const batch = unique.slice(i, i + 500);
    if (!batch.length) continue;
    const placeholders = batch.map(() => "?").join(",");
    const [rows] = await conn.execute(`select id from ${table} where id in (${placeholders})`, batch);
    for (const row of rows) existing.add(Number(row.id));
  }
  return existing;
}

async function main() {
  if (!process.env.MYSQL_PUBLIC_URL) throw new Error("MYSQL_PUBLIC_URL is required");
  const conn = await mysql.createConnection(process.env.MYSQL_PUBLIC_URL);

  const certificates = readCsv(certificatesPath);
  const builderProfiles = readCsv(builderProfilePath);
  const syncLogs = fs.existsSync(syncLogPath) ? readCsv(syncLogPath) : [];

  const leadIds = certificates.flatMap((row) => [numberValue(row.leadId), numberValue(row.matchedLeadId)]);
  const quoteIds = certificates.map((row) => numberValue(row.quoteId));
  const userIds = [
    ...builderProfiles.map((row) => numberValue(row.updatedBy)),
    ...certificates.map((row) => numberValue(row.createdBy)),
  ];
  const [existingLeads, existingQuotes, existingUsers] = await Promise.all([
    existingIdSet(conn, "crm_leads", leadIds),
    existingIdSet(conn, "quotes", quoteIds),
    existingIdSet(conn, "users", userIds),
  ]);

  const [profileRow] = builderProfiles;
  if (profileRow) {
    const [currentRows] = await conn.execute(
      "select * from hbcf_builder_profiles where tenantId = ? limit 1",
      [tenantId],
    );
    const latestSync = syncLogs
      .map((row) => ({ row, completedAt: dateValue(row.completedAt) }))
      .filter((entry) => entry.completedAt)
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime())[0];
    const current = currentRows[0] || {};
    const profileValues = {
      tenantId,
      builderName: value(profileRow.builderName) || current.builderName || "Commisso Group Pty Limited",
      abn: value(profileRow.abn) || current.abn || null,
      licenceNumber: value(profileRow.licenceNumber) || current.licenceNumber || null,
      annualLimit: value(profileRow.openJobLimitValue) || current.annualLimit || "0.00",
      annualLimitYear: current.annualLimitYear || new Date().getFullYear(),
      apiCallsThisMonth: current.apiCallsThisMonth ?? 0,
      apiMonthlyLimit: current.apiMonthlyLimit ?? 2500,
      lastSyncAt: latestSync?.completedAt || current.lastSyncAt || null,
      lastSyncStatus: value(latestSync?.row.status) || current.lastSyncStatus || null,
      updatedByUserId: existingUsers.has(numberValue(profileRow.updatedBy)) ? numberValue(profileRow.updatedBy) : current.updatedByUserId || null,
    };

    if (currentRows.length) {
      await conn.execute(
        `update hbcf_builder_profiles
         set builderName=?, abn=?, licenceNumber=?, annualLimit=?, annualLimitYear=?,
             apiCallsThisMonth=?, apiMonthlyLimit=?, lastSyncAt=?, lastSyncStatus=?, updatedByUserId=?
         where tenantId=?`,
        [
          profileValues.builderName,
          profileValues.abn,
          profileValues.licenceNumber,
          profileValues.annualLimit,
          profileValues.annualLimitYear,
          profileValues.apiCallsThisMonth,
          profileValues.apiMonthlyLimit,
          profileValues.lastSyncAt,
          profileValues.lastSyncStatus,
          profileValues.updatedByUserId,
          tenantId,
        ],
      );
    } else {
      await conn.execute(
        `insert into hbcf_builder_profiles
         (tenantId, builderName, abn, licenceNumber, annualLimit, annualLimitYear, apiCallsThisMonth, apiMonthlyLimit, lastSyncAt, lastSyncStatus, updatedByUserId)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          profileValues.tenantId,
          profileValues.builderName,
          profileValues.abn,
          profileValues.licenceNumber,
          profileValues.annualLimit,
          profileValues.annualLimitYear,
          profileValues.apiCallsThisMonth,
          profileValues.apiMonthlyLimit,
          profileValues.lastSyncAt,
          profileValues.lastSyncStatus,
          profileValues.updatedByUserId,
        ],
      );
    }
  }

  let insertedCertificates = 0;
  let updatedCertificates = 0;
  for (const row of certificates.filter((item) => !boolValue(item.isCompetitorMatch))) {
    const certificateNumber = value(row.certificateNumber);
    const externalId = value(row.id) ? `legacy-hbcf:${value(row.id)}` : null;
    const crmLeadId = existingLeads.has(numberValue(row.leadId)) ? numberValue(row.leadId) : null;
    const quoteId = existingQuotes.has(numberValue(row.quoteId)) ? numberValue(row.quoteId) : null;
    const createdByUserId = existingUsers.has(numberValue(row.createdBy)) ? numberValue(row.createdBy) : null;
    const rawPayload = jsonValue(row.apiRawData)
      || JSON.stringify({
        importedFrom: "hbcf_certificates.csv",
        legacyId: value(row.id),
        jobId: value(row.jobId),
        applicationDate: value(row.applicationDate),
        isCompetitorMatch: boolValue(row.isCompetitorMatch),
        competitorName: value(row.competitorName),
        competitorLicenceNumber: value(row.competitorLicenceNumber),
        matchedLeadId: value(row.matchedLeadId),
      });

    const fields = [
      tenantId,
      quoteId,
      crmLeadId,
      certificateNumber,
      certificateNumber,
      statusValue(row.policyStatus),
      value(row.competitorName) || profileRow?.builderName?.trim() || null,
      value(row.competitorLicenceNumber) || value(row.licenceNumber) || profileRow?.licenceNumber || null,
      value(row.ownerName),
      value(row.propertyAddress),
      value(row.propertySuburb),
      value(row.propertyPostcode),
      value(row.insuredAmount),
      dateValue(row.issueDate),
      dateValue(row.expiryDate),
      "legacy_import",
      externalId,
      rawPayload,
      dateValue(row.lastApiSyncAt),
      value(row.apiSyncStatus) || "imported",
      value(row.manualNotes),
      dateValue(row.createdAt) || new Date(),
      dateValue(row.updatedAt) || new Date(),
      createdByUserId,
    ];

    const [existing] = await conn.execute(
      `select id from hbcf_certificates
       where tenantId = ? and ((certificateNumber is not null and certificateNumber = ?) or (externalId is not null and externalId = ?))
       limit 1`,
      [tenantId, certificateNumber, externalId],
    );

    if (existing.length) {
      await conn.execute(
        `update hbcf_certificates set
          quoteId=?, crmLeadId=?, certificateNumber=?, policyNumber=?, status=?, builderName=?, builderLicenceNumber=?,
          ownerName=?, propertyAddress=?, propertySuburb=?, propertyPostcode=?, contractPrice=?, issuedAt=?, expiresAt=?,
          source=?, externalId=?, rawPayload=cast(? as json), lastSyncedAt=?, syncStatus=?, notes=?, updatedAt=?, createdByUserId=?
         where id=?`,
        fields.slice(1, 21).concat(fields[22], fields[23], existing[0].id),
      );
      updatedCertificates++;
    } else {
      await conn.execute(
        `insert into hbcf_certificates
         (tenantId, quoteId, crmLeadId, certificateNumber, policyNumber, status, builderName, builderLicenceNumber,
          ownerName, propertyAddress, propertySuburb, propertyPostcode, contractPrice, issuedAt, expiresAt,
          source, externalId, rawPayload, lastSyncedAt, syncStatus, notes, createdAt, updatedAt, createdByUserId)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, cast(? as json), ?, ?, ?, ?, ?, ?)`,
        fields,
      );
      insertedCertificates++;
    }
  }

  const [profileRowsForUsage] = await conn.execute(
    "select annualLimitYear, annualLimitUsed from hbcf_builder_profiles where tenantId = ? limit 1",
    [tenantId],
  );
  const profileForUsage = profileRowsForUsage[0];
  if (profileForUsage) {
    const usageYear = Number(profileForUsage.annualLimitYear || new Date().getFullYear());
    const [usageRows] = await conn.execute(
      `select coalesce(sum(cast(contractPrice as decimal(14,2))), 0) as usedAmount
       from hbcf_certificates
       where tenantId = ? and status = 'issued' and year(issuedAt) = ?
         and (ownerName is not null or propertyAddress is not null or contractPrice is not null
           or approvalProjectId is not null or quoteId is not null or crmLeadId is not null)`,
      [tenantId, usageYear],
    );
    const derivedUsedAmount = Number(usageRows[0]?.usedAmount || 0).toFixed(2);
    const storedUsedAmount = Number(profileForUsage.annualLimitUsed || 0);
    if (storedUsedAmount <= 0 && Number(derivedUsedAmount) > 0) {
      await conn.execute(
        "update hbcf_builder_profiles set annualLimitUsed = ? where tenantId = ?",
        [derivedUsedAmount, tenantId],
      );
    }
  }

  let insertedMatches = 0;
  let updatedMatches = 0;
  for (const row of certificates.filter((item) => boolValue(item.isCompetitorMatch))) {
    const certificateNumber = value(row.certificateNumber);
    const leadId = existingLeads.has(numberValue(row.matchedLeadId)) ? numberValue(row.matchedLeadId) : null;
    const quoteId = existingQuotes.has(numberValue(row.quoteId)) ? numberValue(row.quoteId) : null;
    const rawPayload = JSON.stringify({ importedFrom: "hbcf_certificates.csv", legacyId: value(row.id), matchedAt: value(row.matchedAt) });
    const values = [
      tenantId,
      leadId,
      quoteId,
      certificateNumber,
      certificateNumber,
      value(row.competitorName),
      value(row.competitorLicenceNumber),
      value(row.ownerName),
      value(row.propertyAddress),
      value(row.propertySuburb),
      value(row.propertyPostcode),
      value(row.insuredAmount),
      dateValue(row.issueDate),
      false,
      confidenceValue(row.matchConfidence),
      "Imported HBCF competitor match",
      "legacy_import",
      rawPayload,
      dateValue(row.matchedAt) || dateValue(row.updatedAt) || new Date(),
      dateValue(row.updatedAt) || new Date(),
    ];

    const [existing] = await conn.execute(
      `select id from hbcf_policy_matches
       where tenantId = ? and leadId <=> ? and certificateNumber <=> ? and builderLicenceNumber <=> ?
       limit 1`,
      [tenantId, leadId, certificateNumber, value(row.competitorLicenceNumber)],
    );
    if (existing.length) {
      await conn.execute(
        `update hbcf_policy_matches set
          quoteId=?, policyNumber=?, certificateNumber=?, builderName=?, builderLicenceNumber=?, ownerName=?,
          propertyAddress=?, propertySuburb=?, propertyPostcode=?, contractPrice=?, issuedAt=?, isOurs=?,
          matchConfidence=?, matchReason=?, source=?, rawPayload=cast(? as json), updatedAt=?
         where id=?`,
        values.slice(2, 18).concat(values[19], existing[0].id),
      );
      updatedMatches++;
    } else {
      await conn.execute(
        `insert into hbcf_policy_matches
         (tenantId, leadId, quoteId, policyNumber, certificateNumber, builderName, builderLicenceNumber, ownerName,
          propertyAddress, propertySuburb, propertyPostcode, contractPrice, issuedAt, isOurs, matchConfidence,
          matchReason, source, rawPayload, createdAt, updatedAt)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, cast(? as json), ?, ?)`,
        values,
      );
      insertedMatches++;
    }
  }

  let insertedSyncLogs = 0;
  let updatedSyncLogs = 0;
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS hbcf_sync_logs (
      id int NOT NULL AUTO_INCREMENT,
      tenantId int NULL,
      syncType varchar(64) NOT NULL DEFAULT 'manual',
      certificatesChecked int NOT NULL DEFAULT 0,
      certificatesUpdated int NOT NULL DEFAULT 0,
      competitorMatchesFound int NOT NULL DEFAULT 0,
      errors int NOT NULL DEFAULT 0,
      errorDetails text NULL,
      startedAt timestamp NULL,
      completedAt timestamp NULL,
      status varchar(32) NOT NULL DEFAULT 'pending',
      source varchar(32) NOT NULL DEFAULT 'api',
      externalId varchar(255) NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_hbcf_sync_logs_tenant (tenantId),
      KEY idx_hbcf_sync_logs_status (status),
      KEY idx_hbcf_sync_logs_completed (completedAt)
    )
  `);

  for (const row of syncLogs) {
    const externalId = value(row.id) ? `legacy-hbcf-sync:${value(row.id)}` : null;
    const values = [
      tenantId,
      value(row.syncType) || "manual",
      numberValue(row.certificatesChecked) || 0,
      numberValue(row.certificatesUpdated) || 0,
      numberValue(row.competitorMatchesFound) || 0,
      numberValue(row.errors) || 0,
      value(row.errorDetails),
      dateValue(row.startedAt),
      dateValue(row.completedAt),
      value(row.status) || "completed",
      "legacy_import",
      externalId,
    ];
    const [existing] = await conn.execute(
      "select id from hbcf_sync_logs where tenantId = ? and externalId <=> ? limit 1",
      [tenantId, externalId],
    );
    if (existing.length) {
      await conn.execute(
        `update hbcf_sync_logs set
          syncType=?, certificatesChecked=?, certificatesUpdated=?, competitorMatchesFound=?,
          errors=?, errorDetails=?, startedAt=?, completedAt=?, status=?, source=?
         where id=?`,
        values.slice(1, 11).concat(existing[0].id),
      );
      updatedSyncLogs++;
    } else {
      await conn.execute(
        `insert into hbcf_sync_logs
         (tenantId, syncType, certificatesChecked, certificatesUpdated, competitorMatchesFound,
          errors, errorDetails, startedAt, completedAt, status, source, externalId)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        values,
      );
      insertedSyncLogs++;
    }
  }

  const [certificateCount] = await conn.execute("select count(*) as count from hbcf_certificates where tenantId = ?", [tenantId]);
  const [matchCount] = await conn.execute("select count(*) as count from hbcf_policy_matches where tenantId = ?", [tenantId]);
  const [syncLogCount] = await conn.execute("select count(*) as count from hbcf_sync_logs where tenantId = ?", [tenantId]);
  const [sample] = await conn.execute(
    `select id, tenantId, certificateNumber, status, propertySuburb, contractPrice
     from hbcf_certificates where tenantId = ? order by updatedAt desc limit 5`,
    [tenantId],
  );

  console.log(JSON.stringify({
    tenantId,
    certificatesCsvRows: certificates.length,
    syncLogCsvRows: syncLogs.length,
    insertedCertificates,
    updatedCertificates,
    insertedMatches,
    updatedMatches,
    insertedSyncLogs,
    updatedSyncLogs,
    certificateCount: certificateCount[0].count,
    matchCount: matchCount[0].count,
    syncLogCount: syncLogCount[0].count,
    sample,
  }, null, 2));

  await conn.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
