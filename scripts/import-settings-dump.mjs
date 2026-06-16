import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";

const args = process.argv.slice(2);
const dumpPath = args.find((arg) => !arg.startsWith("--"));
const apply = args.includes("--apply");
const includeInlineAssets = args.includes("--include-inline-assets");
const tenantSlug = valueFor("--tenant-slug") || process.env.DEFAULT_TENANT_SLUG || "default";
const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_URL;

if (!dumpPath) {
  console.error("Usage: node scripts/import-settings-dump.mjs <settings-dump.md> [--apply] [--tenant-slug default] [--include-inline-assets]");
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

function extractDataBlocks(markdown) {
  const blocks = {};
  const re = /## DATA: ([\w_]+)\s+```json\s+([\s\S]*?)```/g;
  for (const match of markdown.matchAll(re)) {
    blocks[match[1]] = JSON.parse(match[2]);
  }
  for (const section of markdown.split(/^## /m).slice(1)) {
    const newlineIndex = section.indexOf("\n");
    const table = section.slice(0, newlineIndex).trim();
    const body = section.slice(newlineIndex + 1);
    if (table.startsWith("DATA:") || table.includes("Environment Variables")) continue;
    const dataMatch = body.match(/### Data \(\d+ rows?\)\s+```json\s+([\s\S]*?)```/);
    if (dataMatch) {
      blocks[table] = JSON.parse(dataMatch[1]);
    } else if (/### Data \(0 rows?\)\s+\*\(No rows\)\*/.test(body)) {
      blocks[table] = [];
    }
  }
  return blocks;
}

function isInlineAsset(value) {
  return typeof value === "string" && value.startsWith("data:");
}

function parseMaybeJson(value, fallback = {}) {
  if (value == null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function boolValue(value) {
  return value === true || value === 1 || value === "1";
}

function dateValue(value) {
  return value ? new Date(value) : null;
}

function jsonValue(value) {
  return JSON.stringify(value ?? null);
}

function withoutSkippedInlineAssets(row) {
  if (includeInlineAssets) return row;
  const next = { ...row };
  for (const key of ["customLogoUrl", "appIconUrl", "faviconUrl"]) {
    if (isInlineAsset(next[key])) next[key] = null;
  }
  return next;
}

function redact(value) {
  if (typeof value === "string") {
    if (value.startsWith("data:")) return `[inline asset ${value.length} chars]`;
    if (value.length > 180) return `${value.slice(0, 80)}...[${value.length} chars]`;
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
  }
  return value;
}

function redactRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (/token|secret|password|delta|credential/i.test(key) && value) {
      return [key, `[redacted ${String(value).length} chars]`];
    }
    return [key, redact(value)];
  }));
}

function countSummary(blocks) {
  return Object.fromEntries(Object.entries(blocks).map(([table, rows]) => [table, rows.length]));
}

async function getTenantId(connection) {
  const [rows] = await connection.execute("SELECT id FROM tenants WHERE slug = ? LIMIT 1", [tenantSlug]);
  const tenantId = rows?.[0]?.id;
  if (!tenantId) throw new Error(`Tenant '${tenantSlug}' was not found.`);
  return tenantId;
}

async function upsertGlobalSettings(connection, rows) {
  for (const row of rows) {
    await connection.execute(
      `INSERT INTO global_settings (settingKey, value)
       VALUES (?, CAST(? AS JSON))
       ON DUPLICATE KEY UPDATE value = VALUES(value), updatedAt = CURRENT_TIMESTAMP`,
      [row.settingKey, JSON.stringify(row.value ?? null)],
    );
  }
}

async function upsertInboxSettings(connection, rows) {
  for (const row of rows) {
    await connection.execute(
      `INSERT INTO inbox_settings (settingKey, settingValue, updatedBy)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         settingValue = VALUES(settingValue),
         updatedBy = VALUES(updatedBy),
         updatedAt = CURRENT_TIMESTAMP`,
      [row.settingKey, String(row.settingValue ?? ""), row.updatedBy ?? null],
    );
  }
}

async function userExists(connection, userId) {
  if (!userId) return false;
  const [users] = await connection.execute("SELECT id FROM users WHERE id = ? LIMIT 1", [userId]);
  return Boolean(users?.[0]?.id);
}

async function upsertUserSettings(connection, rows) {
  const skipped = [];
  for (const rawRow of rows) {
    const row = withoutSkippedInlineAssets(rawRow);
    if (!(await userExists(connection, row.userId))) {
      skipped.push(row.userId);
      continue;
    }
    await connection.execute(
      `INSERT INTO user_settings
        (userId, themeMode, colorScheme, customLogoUrl, appIconUrl, faviconUrl, companyDetails, proposalText, companyTheme)
       VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON))
       ON DUPLICATE KEY UPDATE
        themeMode = VALUES(themeMode),
        colorScheme = VALUES(colorScheme),
        customLogoUrl = VALUES(customLogoUrl),
        appIconUrl = VALUES(appIconUrl),
        faviconUrl = VALUES(faviconUrl),
        companyDetails = VALUES(companyDetails),
        proposalText = VALUES(proposalText),
        companyTheme = VALUES(companyTheme),
        updatedAt = CURRENT_TIMESTAMP`,
      [
        row.userId,
        row.themeMode ?? "light",
        row.colorScheme ?? "default",
        row.customLogoUrl ?? null,
        row.appIconUrl ?? null,
        row.faviconUrl ?? null,
        JSON.stringify(row.companyDetails ?? null),
        JSON.stringify(row.proposalText ?? null),
        JSON.stringify(row.companyTheme ?? null),
      ],
    );
  }
  return skipped;
}

async function upsertInboxAddresses(connection, tenantId, rows) {
  for (const row of rows) {
    await connection.execute(
      `INSERT INTO inbox_addresses
        (id, tenantId, address, displayName, description, provider, module, deltaLink, lastSyncAt,
         defaultAssigneeId, defaultAssigneeName, autoTagIds, active, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)
       ON DUPLICATE KEY UPDATE
        tenantId = VALUES(tenantId),
        displayName = VALUES(displayName),
        description = VALUES(description),
        provider = VALUES(provider),
        module = VALUES(module),
        deltaLink = COALESCE(inbox_addresses.deltaLink, VALUES(deltaLink)),
        lastSyncAt = COALESCE(inbox_addresses.lastSyncAt, VALUES(lastSyncAt)),
        defaultAssigneeId = VALUES(defaultAssigneeId),
        defaultAssigneeName = VALUES(defaultAssigneeName),
        autoTagIds = VALUES(autoTagIds),
        active = VALUES(active),
        sortOrder = VALUES(sortOrder),
        updatedAt = CURRENT_TIMESTAMP`,
      [
        row.id ?? null,
        tenantId,
        String(row.address ?? "").toLowerCase().trim(),
        row.displayName ?? row.address,
        row.description ?? null,
        row.provider ?? "msgraph",
        row.module ?? null,
        row.deltaLink ?? null,
        dateValue(row.lastSyncAt),
        row.defaultAssigneeId ?? null,
        row.defaultAssigneeName ?? null,
        jsonValue(row.autoTagIds),
        boolValue(row.active),
        row.sortOrder ?? 0,
      ],
    );
  }
}

async function upsertEmailSignatures(connection, rows) {
  const skipped = [];
  for (const row of rows) {
    if (!(await userExists(connection, row.userId))) {
      skipped.push(row.userId);
      continue;
    }
    await connection.execute(
      `INSERT INTO email_signatures (id, userId, name, htmlContent, isDefault, schedule)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        userId = VALUES(userId),
        name = VALUES(name),
        htmlContent = VALUES(htmlContent),
        isDefault = VALUES(isDefault),
        schedule = VALUES(schedule),
        updatedAt = CURRENT_TIMESTAMP`,
      [
        row.id ?? null,
        row.userId,
        row.name,
        row.htmlContent,
        boolValue(row.isDefault),
        row.schedule ?? "always",
      ],
    );
  }
  return skipped;
}

async function upsertNylasGrants(connection, tenantId, rows) {
  const skipped = [];
  for (const row of rows) {
    if (!(await userExists(connection, row.userId))) {
      skipped.push(row.userId);
      continue;
    }
    await connection.execute(
      `INSERT INTO nylas_grants (id, tenantId, userId, grantId, email, provider, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        tenantId = VALUES(tenantId),
        userId = VALUES(userId),
        email = VALUES(email),
        provider = VALUES(provider),
        status = VALUES(status),
        updatedAt = CURRENT_TIMESTAMP`,
      [
        row.id ?? null,
        tenantId,
        row.userId,
        row.grantId,
        row.email ?? null,
        row.provider ?? null,
        row.status ?? "active",
      ],
    );
  }
  return skipped;
}

async function upsertVocphoneExtensions(connection, tenantId, rows) {
  for (const row of rows) {
    await connection.execute(
      `INSERT INTO vocphone_extensions
        (id, tenantId, extension, firstName, lastName, email, callerId, isActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        tenantId = VALUES(tenantId),
        extension = VALUES(extension),
        firstName = VALUES(firstName),
        lastName = VALUES(lastName),
        email = VALUES(email),
        callerId = VALUES(callerId),
        isActive = VALUES(isActive),
        updatedAt = CURRENT_TIMESTAMP`,
      [
        row.id ?? null,
        tenantId,
        row.extension,
        row.firstName ?? "",
        row.lastName ?? "",
        row.email ?? null,
        row.callerId ?? null,
        boolValue(row.isActive),
      ],
    );
  }
}

async function upsertSmsTemplates(connection, tenantId, rows) {
  for (const row of rows) {
    await connection.execute(
      `INSERT INTO sms_templates
        (id, tenantId, name, category, body, isActive, sortOrder)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        tenantId = VALUES(tenantId),
        name = VALUES(name),
        category = VALUES(category),
        body = VALUES(body),
        isActive = VALUES(isActive),
        sortOrder = VALUES(sortOrder),
        updatedAt = CURRENT_TIMESTAMP`,
      [
        row.id ?? null,
        tenantId,
        row.name,
        row.category,
        row.body,
        boolValue(row.isActive),
        row.sortOrder ?? 0,
      ],
    );
  }
}

async function upsertBranches(connection, rows) {
  for (const row of rows) {
    await connection.execute(
      `INSERT INTO branches
        (id, name, address, phone, email, smsNumber, managerUserId, managerName, managerEmail, isActive)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        address = VALUES(address),
        phone = VALUES(phone),
        email = VALUES(email),
        smsNumber = VALUES(smsNumber),
        managerUserId = VALUES(managerUserId),
        managerName = VALUES(managerName),
        managerEmail = VALUES(managerEmail),
        isActive = VALUES(isActive),
        updatedAt = CURRENT_TIMESTAMP`,
      [
        row.id ?? null,
        row.name,
        row.address ?? null,
        row.phone ?? null,
        row.email ?? null,
        row.smsNumber ?? null,
        row.managerUserId ?? null,
        row.managerName ?? null,
        row.managerEmail ?? null,
        boolValue(row.isActive),
      ],
    );
  }
}

async function branchExists(connection, branchId) {
  const [branches] = await connection.execute("SELECT id FROM branches WHERE id = ? LIMIT 1", [branchId]);
  return Boolean(branches?.[0]?.id);
}

async function upsertTerritoryPostcodes(connection, rows) {
  const skipped = [];
  for (const row of rows) {
    if (!(await branchExists(connection, row.branchId))) {
      skipped.push(row.postcode);
      continue;
    }
    await connection.execute(
      `INSERT INTO territory_postcodes (id, territory, branchId, postcode)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        territory = VALUES(territory),
        branchId = VALUES(branchId),
        postcode = VALUES(postcode)`,
      [row.id ?? null, row.territory, row.branchId, String(row.postcode)],
    );
  }
  return skipped;
}

async function upsertDaZoneAssignments(connection, rows) {
  for (const row of rows) {
    await connection.execute(
      `INSERT INTO da_zone_assignments
        (id, designAdvisorName, designAdvisorEmail, postcodeLow, postcodeHigh, state, suburbs, priority, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        designAdvisorName = VALUES(designAdvisorName),
        designAdvisorEmail = VALUES(designAdvisorEmail),
        postcodeLow = VALUES(postcodeLow),
        postcodeHigh = VALUES(postcodeHigh),
        state = VALUES(state),
        suburbs = VALUES(suburbs),
        priority = VALUES(priority),
        active = VALUES(active),
        updatedAt = CURRENT_TIMESTAMP`,
      [
        row.id ?? null,
        row.designAdvisorName,
        row.designAdvisorEmail ?? null,
        row.postcodeLow,
        row.postcodeHigh,
        row.state,
        row.suburbs ?? null,
        row.priority ?? 0,
        boolValue(row.active),
      ],
    );
  }
}

async function existingIntegrationConfig(connection, tenantId, service) {
  const [rows] = await connection.execute(
    "SELECT config FROM tenant_integration_settings WHERE tenantId = ? AND service = ? LIMIT 1",
    [tenantId, service],
  );
  const value = rows?.[0]?.config;
  return parseMaybeJson(value, {});
}

async function upsertTenantIntegration(connection, tenantId, service, patch) {
  const existing = await existingIntegrationConfig(connection, tenantId, service);
  const config = { ...existing, ...patch };
  await connection.execute(
    `INSERT INTO tenant_integration_settings (tenantId, service, enabled, config)
     VALUES (?, ?, true, CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE
      enabled = true,
      config = VALUES(config),
      updatedAt = CURRENT_TIMESTAMP`,
    [tenantId, service, JSON.stringify(config)],
  );
}

async function upsertDerivedTenantSettings(connection, tenantId, blocks) {
  const userRow = blocks.user_settings?.find((row) => row.companyDetails) || null;
  const loginBackground = blocks.global_settings?.find((row) => row.settingKey === "loginBackgroundImage")?.value;
  const loginTagline = blocks.global_settings?.find((row) => row.settingKey === "loginTagline")?.value;
  if (!userRow?.companyDetails && !loginBackground && !loginTagline) return;

  const [existingRows] = await connection.execute(
    "SELECT companyDetails, branding, featureFlags FROM tenant_settings WHERE tenantId = ? LIMIT 1",
    [tenantId],
  );
  const existing = existingRows?.[0] ?? {};
  const existingBranding = parseMaybeJson(existing.branding, {});
  const existingCompanyDetails = parseMaybeJson(existing.companyDetails, null);
  const existingFeatureFlags = parseMaybeJson(existing.featureFlags, {});
  const rawUserRow = userRow ? withoutSkippedInlineAssets(userRow) : {};
  const branding = {
    ...existingBranding,
    colorScheme: rawUserRow.colorScheme ?? existingBranding.colorScheme,
    customLogoUrl: rawUserRow.customLogoUrl ?? existingBranding.customLogoUrl,
    appIconUrl: rawUserRow.appIconUrl ?? existingBranding.appIconUrl,
    faviconUrl: rawUserRow.faviconUrl ?? existingBranding.faviconUrl,
    companyTheme: rawUserRow.companyTheme ?? existingBranding.companyTheme,
    loginBackgroundImage: loginBackground ?? existingBranding.loginBackgroundImage,
    loginTagline: loginTagline ?? existingBranding.loginTagline,
  };

  await connection.execute(
    `INSERT INTO tenant_settings (tenantId, companyDetails, branding, featureFlags)
     VALUES (?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE
      companyDetails = VALUES(companyDetails),
      branding = VALUES(branding),
      featureFlags = VALUES(featureFlags),
      updatedAt = CURRENT_TIMESTAMP`,
    [
      tenantId,
      JSON.stringify(userRow?.companyDetails ?? existingCompanyDetails),
      JSON.stringify(branding),
      JSON.stringify(existingFeatureFlags),
    ],
  );
}

async function upsertDerivedIntegrations(connection, tenantId, blocks) {
  const inboxRows = blocks.inbox_settings ?? [];
  const valueForSetting = (key) => inboxRows.find((row) => row.settingKey === key)?.settingValue;
  const receivingDomain = valueForSetting("receiving_domain");
  const senderName = valueForSetting("default_from_name");
  const signature = valueForSetting("company_default_signature");
  const inboxAddressRows = blocks.inbox_addresses ?? [];

  if (receivingDomain) {
    await upsertTenantIntegration(connection, tenantId, "domain", {
      receivingDomain,
    });
  }
  if (senderName || signature) {
    await upsertTenantIntegration(connection, tenantId, "email", {
      senderName,
      defaultSignature: signature ? JSON.parse(signature) : undefined,
    });
  }
  if (inboxAddressRows.length) {
    await upsertTenantIntegration(connection, tenantId, "msgraph", {
      mailboxes: inboxAddressRows
        .filter((row) => boolValue(row.active))
        .map((row) => ({
          address: String(row.address ?? "").toLowerCase().trim(),
          displayName: row.displayName ?? row.address,
          module: row.module ?? null,
        })),
    });
  }
}

const markdown = await fs.readFile(path.resolve(dumpPath), "utf8");
const blocks = extractDataBlocks(markdown);

console.log("Settings dump parsed:", JSON.stringify(countSummary(blocks)));
if (!includeInlineAssets) {
  console.log("Inline assets will be skipped. Use --include-inline-assets to import data: URLs.");
}

if (!apply) {
  console.log("Dry run only. Add --apply to write to the database.");
  for (const [table, rows] of Object.entries(blocks)) {
    console.log(`\n${table}: ${rows.length} row(s)`);
    console.log(JSON.stringify(rows.slice(0, 2).map(redactRow), null, 2));
  }
  if (blocks.xero_connections?.length || blocks.approval_integration_credentials?.length) {
    console.log("\nOAuth connection/token tables are skipped by default; reconnect those providers in-app so fresh tokens are stored.");
  }
  process.exit(0);
}

const connection = await mysql.createConnection(databaseUrl);
try {
  const tenantId = await getTenantId(connection);
  const skipped = {};

  await upsertGlobalSettings(connection, blocks.global_settings ?? []);
  await upsertInboxSettings(connection, blocks.inbox_settings ?? []);
  const skippedUsers = await upsertUserSettings(connection, blocks.user_settings ?? []);
  const skippedSignatureUsers = await upsertEmailSignatures(connection, blocks.email_signatures ?? []);
  const skippedNylasUsers = await upsertNylasGrants(connection, tenantId, blocks.nylas_grants ?? []);
  await upsertInboxAddresses(connection, tenantId, blocks.inbox_addresses ?? []);
  await upsertBranches(connection, blocks.branches ?? []);
  const skippedTerritories = await upsertTerritoryPostcodes(connection, blocks.territory_postcodes ?? []);
  await upsertDaZoneAssignments(connection, blocks.da_zone_assignments ?? []);
  await upsertVocphoneExtensions(connection, tenantId, blocks.vocphone_extensions ?? []);
  await upsertSmsTemplates(connection, tenantId, blocks.sms_templates ?? []);
  await upsertDerivedTenantSettings(connection, tenantId, blocks);
  await upsertDerivedIntegrations(connection, tenantId, blocks);

  if (skippedUsers.length) skipped.userSettingsUserIds = skippedUsers;
  if (skippedSignatureUsers.length) skipped.emailSignatureUserIds = skippedSignatureUsers;
  if (skippedNylasUsers.length) skipped.nylasGrantUserIds = skippedNylasUsers;
  if (skippedTerritories.length) skipped.territoryPostcodes = skippedTerritories;
  if (blocks.xero_connections?.length) skipped.xeroConnections = `${blocks.xero_connections.length} OAuth row(s) skipped`;
  if (blocks.approval_integration_credentials?.length) {
    skipped.approvalIntegrationCredentials = `${blocks.approval_integration_credentials.length} legacy token row(s) skipped`;
  }

  console.log(`Imported settings for tenant '${tenantSlug}' (${tenantId}).`);
  if (Object.keys(skipped).length) {
    console.log(`Skipped: ${JSON.stringify(skipped)}`);
  }
} finally {
  await connection.end();
}
