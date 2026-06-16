import process from "node:process";
import mysql from "mysql2/promise";

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL, MYSQL_PUBLIC_URL, or MYSQL_URL is required.");
  process.exit(1);
}

function stripInternationalPrefix(digits) {
  if (digits.startsWith("0011")) return digits.slice(4);
  if (digits.startsWith("00")) return digits.slice(2);
  return digits;
}

function phoneDigits(value) {
  return stripInternationalPrefix(String(value || "").replace(/\D/g, ""));
}

function normalizePhoneForMatch(value) {
  let digits = phoneDigits(value);
  if (!digits) return "";
  if (digits.startsWith("61")) {
    const national = digits.slice(2);
    if (national.startsWith("0")) return national;
    if (national.length >= 9 && /^[23478]/.test(national)) return `0${national}`;
  }
  if (digits.length === 9 && /^[23478]/.test(digits)) return `0${digits}`;
  return digits;
}

function phoneMatchVariants(value) {
  const raw = phoneDigits(value);
  const normalized = normalizePhoneForMatch(value);
  const variants = new Set();
  for (const candidate of [raw, normalized]) {
    if (candidate && candidate.length >= 8) variants.add(candidate);
  }
  if (normalized.startsWith("0") && normalized.length >= 10) {
    variants.add(`61${normalized.slice(1)}`);
    variants.add(normalized.slice(1));
  }
  if (raw.startsWith("61") && raw.length >= 11) variants.add(`0${raw.slice(2)}`);
  return Array.from(variants);
}

function suffixes(value) {
  const normalized = normalizePhoneForMatch(value);
  return {
    last9: normalized.length >= 9 ? normalized.slice(-9) : "",
    last8: normalized.length >= 8 ? normalized.slice(-8) : "",
  };
}

function scorePhoneMatch(needle, candidate) {
  const needleNormalized = normalizePhoneForMatch(needle);
  const candidateNormalized = normalizePhoneForMatch(candidate);
  if (!needleNormalized || !candidateNormalized) return 0;
  if (needleNormalized === candidateNormalized) return 100;
  const needleVariants = new Set(phoneMatchVariants(needle));
  if (phoneMatchVariants(candidate).some((variant) => needleVariants.has(variant))) return 90;
  const needleSuffix = suffixes(needle);
  const candidateSuffix = suffixes(candidate);
  if (needleSuffix.last9 && candidateSuffix.last9 && needleSuffix.last9 === candidateSuffix.last9) return 80;
  if (needleSuffix.last8 && candidateSuffix.last8 && needleSuffix.last8 === candidateSuffix.last8) return 60;
  return 0;
}

function findBestLead(phone, leads) {
  return leads
    .map((lead) => ({ ...lead, score: scorePhoneMatch(phone, lead.contactPhone) }))
    .filter((lead) => lead.score > 0)
    .sort((a, b) => b.score - a.score || Number(new Date(b.updatedAt)) - Number(new Date(a.updatedAt)))[0];
}

const connection = await mysql.createConnection(databaseUrl);
try {
  const [leadRows] = await connection.query(`
    SELECT id, tenantId, contactPhone, updatedAt
    FROM crm_leads
    WHERE archived = 0 AND contactPhone IS NOT NULL AND contactPhone != ''
  `);
  const leadsByTenant = new Map();
  for (const lead of leadRows) {
    const key = String(lead.tenantId ?? "null");
    if (!leadsByTenant.has(key)) leadsByTenant.set(key, []);
    leadsByTenant.get(key).push(lead);
  }

  const [callRows] = await connection.query(`
    SELECT id, tenantId, direction, fromNumber, toNumber
    FROM call_logs
    WHERE leadId IS NULL
    ORDER BY createdAt DESC
  `);

  let linked = 0;
  let ambiguous = 0;
  const examples = [];
  for (const call of callRows) {
    const phone = call.direction === "inbound" ? call.fromNumber : call.toNumber;
    const tenantLeads = leadsByTenant.get(String(call.tenantId ?? "null")) || [];
    const best = findBestLead(phone, tenantLeads);
    if (!best) continue;

    const nextBest = tenantLeads
      .filter((lead) => lead.id !== best.id)
      .map((lead) => ({ ...lead, score: scorePhoneMatch(phone, lead.contactPhone) }))
      .filter((lead) => lead.score === best.score)[0];
    if (nextBest && best.score < 90) {
      ambiguous++;
      continue;
    }

    linked++;
    if (examples.length < 5) examples.push({ callId: call.id, leadId: best.id, score: best.score });
    if (apply) {
      await connection.execute("UPDATE call_logs SET leadId = ? WHERE id = ? AND leadId IS NULL", [best.id, call.id]);
    }
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    unlinkedCalls: callRows.length,
    linkableCalls: linked,
    ambiguousSkipped: ambiguous,
    examples,
  }, null, 2));
} finally {
  await connection.end();
}
