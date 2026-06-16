import { createConnection } from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL or MYSQL_URL is required");
}

const defaultMailboxes = [
  "office@commissogroup.au",
  "designteam@commissogroup.au",
  "approvals@commissogroup.au",
  "build@commissogroup.au",
  "support@commissogroup.au",
];

function csv(value) {
  return String(value || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function titleCase(value) {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function mailboxModule(address) {
  const local = address.split("@")[0].toLowerCase();
  if (local.includes("design")) return "sales";
  if (local.includes("approval")) return "approvals";
  if (local.includes("build")) return "construction";
  if (local.includes("support")) return "support";
  return "admin";
}

function mailboxDisplayName(address) {
  const local = address.split("@")[0].toLowerCase();
  if (local === "office") return "Office";
  if (local === "designteam") return "Design Team";
  if (local === "approvals") return "Approvals";
  if (local === "build") return "Build";
  if (local === "support") return "Support";
  return titleCase(local);
}

const mailboxes = csv(process.env.MS_GRAPH_MAILBOXES || process.argv.slice(2).join(",")); 
const mailboxList = mailboxes.length > 0 ? mailboxes : defaultMailboxes;
const tenantSlug = process.env.DEFAULT_TENANT_SLUG || "default";
const tenantName = process.env.DEFAULT_TENANT_NAME || "Commisso Group";
const primaryDomain = process.env.DEFAULT_TENANT_DOMAIN || "spanline-quote-production.up.railway.app";
const publicAppUrl = process.env.PUBLIC_APP_URL || `https://${primaryDomain}`;
const allowedOrigins = JSON.stringify([publicAppUrl]);

const connection = await createConnection(databaseUrl);

try {
  await connection.execute(
    `INSERT INTO tenants (slug, name, status, primaryDomain, allowedOrigins)
     VALUES (?, ?, 'active', ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       status = 'active',
       primaryDomain = VALUES(primaryDomain),
       allowedOrigins = VALUES(allowedOrigins)`,
    [tenantSlug, tenantName, primaryDomain, allowedOrigins],
  );

  const [tenants] = await connection.execute(
    "SELECT id FROM tenants WHERE slug = ? LIMIT 1",
    [tenantSlug],
  );
  const tenantId = tenants?.[0]?.id;
  if (!tenantId) throw new Error(`Could not resolve tenant ${tenantSlug}`);

  await connection.execute(
    `INSERT INTO tenant_integration_settings (tenantId, service, enabled, config)
     VALUES (?, 'email', true, ?)
     ON DUPLICATE KEY UPDATE enabled = true, config = VALUES(config), updatedAt = CURRENT_TIMESTAMP`,
    [tenantId, JSON.stringify({
      senderAddress: process.env.EMAIL_SENDER_ADDRESS || "office@commissogroup.au",
      senderName: process.env.EMAIL_SENDER_NAME || tenantName,
      replyTo: process.env.EMAIL_REPLY_TO || "",
    })],
  );

  if (process.env.MS_GRAPH_TENANT_ID && process.env.MS_GRAPH_CLIENT_ID && process.env.MS_GRAPH_CLIENT_SECRET) {
    await connection.execute(
      `INSERT INTO tenant_integration_settings (tenantId, service, enabled, config)
       VALUES (?, 'msgraph', true, ?)
       ON DUPLICATE KEY UPDATE enabled = true, config = VALUES(config), updatedAt = CURRENT_TIMESTAMP`,
      [tenantId, JSON.stringify({
        tenantId: process.env.MS_GRAPH_TENANT_ID,
        clientId: process.env.MS_GRAPH_CLIENT_ID,
        clientSecret: process.env.MS_GRAPH_CLIENT_SECRET,
      })],
    );
  }

  for (const [index, rawAddress] of mailboxList.entries()) {
    const address = rawAddress.toLowerCase();
    await connection.execute(
      `INSERT INTO inbox_addresses
        (tenantId, address, displayName, description, provider, module, active, sortOrder)
       VALUES (?, ?, ?, ?, 'msgraph', ?, true, ?)
       ON DUPLICATE KEY UPDATE
        tenantId = VALUES(tenantId),
        displayName = VALUES(displayName),
        description = VALUES(description),
        provider = 'msgraph',
        module = VALUES(module),
        active = true,
        sortOrder = VALUES(sortOrder),
        updatedAt = CURRENT_TIMESTAMP`,
      [
        tenantId,
        address,
        mailboxDisplayName(address),
        "Microsoft 365 shared mailbox",
        mailboxModule(address),
        index + 1,
      ],
    );
  }

  console.log(`Seeded tenant ${tenantSlug} (${tenantId}) with ${mailboxList.length} Microsoft 365 mailbox(es).`);
} finally {
  await connection.end();
}
