import { int, mysqlEnum, mysqlTable, text, mediumtext, timestamp, varchar, decimal, json, boolean, double, tinyint, uniqueIndex, bigint, index, foreignKey } from "drizzle-orm/mysql-core";

// ─── Tenancy ────────────────────────────────────────────────────────────────
export const tenants = mysqlTable("tenants", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["active", "suspended", "archived"]).default("active").notNull(),
  primaryDomain: varchar("primaryDomain", { length: 255 }),
  allowedOrigins: json("allowedOrigins").$type<string[]>().default([]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "super_admin", "design_adviser", "office_user", "construction_user", "driver", "warehouse"]).default("user").notNull(),
  canViewAllQuotes: boolean("canViewAllQuotes").default(false).notNull(),
  canViewAllLeads: boolean("canViewAllLeads").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  termsAcceptedAt: timestamp("termsAcceptedAt"),
  termsVersion: varchar("termsVersion", { length: 16 }),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const tenantMemberships = mysqlTable("tenant_memberships", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["owner", "admin", "member", "billing"]).default("member").notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  uniqueIndex("uq_tenant_membership_user").on(t.tenantId, t.userId),
  index("idx_tenant_membership_user").on(t.userId),
]);
export type TenantMembership = typeof tenantMemberships.$inferSelect;
export type InsertTenantMembership = typeof tenantMemberships.$inferInsert;

export const tenantSettings = mysqlTable("tenant_settings", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }).unique(),
  companyDetails: json("companyDetails"),
  branding: json("branding"),
  featureFlags: json("featureFlags").$type<Record<string, boolean>>().default({}),
  appSettings: json("appSettings").$type<Record<string, any>>().default({}),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TenantSettings = typeof tenantSettings.$inferSelect;
export type InsertTenantSettings = typeof tenantSettings.$inferInsert;

export const tenantIntegrationSettings = mysqlTable("tenant_integration_settings", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  service: mysqlEnum("service", ["domain", "email", "msgraph", "nylas", "vocphone", "signwell", "zapier", "planning"]).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  config: json("config").$type<Record<string, any>>().default({}),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("uq_tenant_integration_service").on(table.tenantId, table.service),
  index("idx_tenant_integration_tenant").on(table.tenantId),
]);
export type TenantIntegrationSetting = typeof tenantIntegrationSettings.$inferSelect;
export type InsertTenantIntegrationSetting = typeof tenantIntegrationSettings.$inferInsert;

// Platform SaaS billing — tenant-level commercial model for Altaspan itself.
export const saasBillingPlans = mysqlTable("saas_billing_plans", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 80 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["draft", "active", "archived"]).default("draft").notNull(),
  billingModel: mysqlEnum("billingModel", ["flat", "seat", "usage", "hybrid", "manual"]).default("hybrid").notNull(),
  interval: mysqlEnum("interval", ["month", "year", "custom"]).default("month").notNull(),
  basePriceCents: int("basePriceCents").default(0).notNull(),
  includedSeats: int("includedSeats").default(0).notNull(),
  includedUsage: json("includedUsage").$type<Record<string, number>>(),
  overageRates: json("overageRates").$type<Record<string, number>>(),
  modules: json("modules").$type<string[]>(),
  limits: json("limits").$type<Record<string, number | string | boolean>>(),
  metadata: json("metadata").$type<Record<string, any>>(),
  stripeProductId: varchar("stripeProductId", { length: 255 }),
  stripePriceId: varchar("stripePriceId", { length: 255 }),
  createdBy: int("createdBy").references(() => users.id),
  createdByName: varchar("createdByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_saas_billing_plans_status").on(table.status),
  index("idx_saas_billing_plans_model").on(table.billingModel),
]);
export type SaasBillingPlan = typeof saasBillingPlans.$inferSelect;
export type InsertSaasBillingPlan = typeof saasBillingPlans.$inferInsert;

export const saasTenantBillingAccounts = mysqlTable("saas_tenant_billing_accounts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  legalName: varchar("legalName", { length: 255 }),
  billingEmail: varchar("billingEmail", { length: 320 }),
  billingOwnerUserId: int("billingOwnerUserId").references(() => users.id),
  currency: varchar("currency", { length: 3 }).default("AUD").notNull(),
  taxId: varchar("taxId", { length: 80 }),
  paymentProvider: mysqlEnum("paymentProvider", ["stripe", "xero", "manual"]).default("manual").notNull(),
  providerCustomerId: varchar("providerCustomerId", { length: 255 }),
  status: mysqlEnum("status", ["trialing", "active", "past_due", "suspended", "cancelled", "manual"]).default("manual").notNull(),
  trialEndsAt: timestamp("trialEndsAt"),
  nextInvoiceAt: timestamp("nextInvoiceAt"),
  reconcileStatus: mysqlEnum("reconcileStatus", ["unknown", "ok", "attention", "failed"]).default("unknown").notNull(),
  reconcileNotes: text("reconcileNotes"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("uq_saas_tenant_billing_account_tenant").on(table.tenantId),
  index("idx_saas_tenant_billing_accounts_status").on(table.status),
  index("idx_saas_tenant_billing_accounts_reconcile").on(table.reconcileStatus),
  index("idx_saas_tenant_billing_accounts_provider_customer").on(table.providerCustomerId),
]);
export type SaasTenantBillingAccount = typeof saasTenantBillingAccounts.$inferSelect;
export type InsertSaasTenantBillingAccount = typeof saasTenantBillingAccounts.$inferInsert;

export const saasBillingSubscriptions = mysqlTable("saas_billing_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  billingAccountId: int("billingAccountId").references(() => saasTenantBillingAccounts.id, { onDelete: "set null" }),
  planId: int("planId").references(() => saasBillingPlans.id, { onDelete: "set null" }),
  status: mysqlEnum("status", ["trialing", "active", "paused", "past_due", "cancelled", "expired"]).default("trialing").notNull(),
  seatQuantity: int("seatQuantity").default(0).notNull(),
  usageQuantity: int("usageQuantity").default(0).notNull(),
  billingModelOverride: mysqlEnum("billingModelOverride", ["flat", "seat", "usage", "hybrid", "manual"]),
  unitAmountCents: int("unitAmountCents"),
  mrrCents: int("mrrCents").default(0).notNull(),
  provider: mysqlEnum("provider", ["stripe", "xero", "manual"]).default("manual").notNull(),
  providerSubscriptionId: varchar("providerSubscriptionId", { length: 255 }),
  providerPriceId: varchar("providerPriceId", { length: 255 }),
  providerStatus: varchar("providerStatus", { length: 80 }),
  currentPeriodStart: timestamp("currentPeriodStart"),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  cancelAtPeriodEnd: boolean("cancelAtPeriodEnd").default(false).notNull(),
  cancelledAt: timestamp("cancelledAt"),
  metadata: json("metadata").$type<Record<string, any>>(),
  reconcileStatus: mysqlEnum("reconcileStatus", ["unknown", "ok", "attention", "failed"]).default("unknown").notNull(),
  reconcileNotes: text("reconcileNotes"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_saas_billing_subscriptions_tenant").on(table.tenantId),
  index("idx_saas_billing_subscriptions_tenant_status").on(table.tenantId, table.status),
  index("idx_saas_billing_subscriptions_plan").on(table.planId),
  index("idx_saas_billing_subscriptions_provider_sub").on(table.providerSubscriptionId),
]);
export type SaasBillingSubscription = typeof saasBillingSubscriptions.$inferSelect;
export type InsertSaasBillingSubscription = typeof saasBillingSubscriptions.$inferInsert;

export const saasBillingEvents = mysqlTable("saas_billing_events", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "set null" }),
  billingAccountId: int("billingAccountId").references(() => saasTenantBillingAccounts.id, { onDelete: "set null" }),
  subscriptionId: int("subscriptionId").references(() => saasBillingSubscriptions.id, { onDelete: "set null" }),
  provider: mysqlEnum("provider", ["stripe", "xero", "manual", "system"]).default("system").notNull(),
  providerEventId: varchar("providerEventId", { length: 255 }),
  eventType: varchar("eventType", { length: 120 }).notNull(),
  status: mysqlEnum("status", ["received", "processed", "failed", "ignored"]).default("received").notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "critical"]).default("info").notNull(),
  payload: json("payload").$type<Record<string, any>>(),
  errorMessage: text("errorMessage"),
  retryCount: int("retryCount").default(0).notNull(),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_saas_billing_events_provider_event").on(table.provider, table.providerEventId),
  index("idx_saas_billing_events_tenant").on(table.tenantId),
  index("idx_saas_billing_events_status").on(table.status),
  index("idx_saas_billing_events_received").on(table.receivedAt),
]);
export type SaasBillingEvent = typeof saasBillingEvents.$inferSelect;
export type InsertSaasBillingEvent = typeof saasBillingEvents.$inferInsert;

export const saasAdminAuditLog = mysqlTable("saas_admin_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "set null" }),
  actorUserId: int("actorUserId").references(() => users.id, { onDelete: "set null" }),
  actorUserName: varchar("actorUserName", { length: 255 }),
  action: varchar("action", { length: 120 }).notNull(),
  entityType: varchar("entityType", { length: 80 }).notNull(),
  entityId: varchar("entityId", { length: 80 }),
  beforeJson: json("beforeJson").$type<Record<string, any>>(),
  afterJson: json("afterJson").$type<Record<string, any>>(),
  metadata: json("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_saas_admin_audit_tenant").on(table.tenantId),
  index("idx_saas_admin_audit_actor").on(table.actorUserId),
  index("idx_saas_admin_audit_entity").on(table.entityType, table.entityId),
  index("idx_saas_admin_audit_created").on(table.createdAt),
]);
export type SaasAdminAuditLog = typeof saasAdminAuditLog.$inferSelect;
export type InsertSaasAdminAuditLog = typeof saasAdminAuditLog.$inferInsert;

export const permissionOverrides = mysqlTable("permission_overrides", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 64 }).notNull(),
  permissionKey: varchar("permissionKey", { length: 128 }).notNull(),
  allowed: boolean("allowed").notNull(),
  updatedBy: int("updatedBy").references(() => users.id),
  updatedByName: varchar("updatedByName", { length: 255 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_permission_override_tenant_role_key").on(table.tenantId, table.role, table.permissionKey),
  index("idx_permission_override_tenant").on(table.tenantId),
]);
export type PermissionOverride = typeof permissionOverrides.$inferSelect;
export type InsertPermissionOverride = typeof permissionOverrides.$inferInsert;


// ─── Quotes ──────────────────────────────────────────────────────────────────
export const quotes = mysqlTable("quotes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  userId: int("userId").notNull(),
  quoteNumber: varchar("quoteNumber", { length: 32 }).notNull().unique(),
  clientId: int("clientId"),
  clientName: text("clientName").notNull(),
  clientPhone: text("clientPhone"),
  clientEmail: text("clientEmail"),
  siteAddress: text("siteAddress"),
  suburb: text("suburb"),
  localCouncil: text("localCouncil"),
  region: varchar("region", { length: 64 }).default("Canberra"),
  status: mysqlEnum("status", ["draft", "sent", "accepted", "lost"]).default("draft").notNull(),
  outcomeReason: text("outcomeReason"),
  archived: boolean("archived").default(false).notNull(),
  descriptionOfWork: text("descriptionOfWork"),
  notes: text("notes"),
  includeDelivery: boolean("includeDelivery").default(false),
  deliveryAmount: decimal("deliveryAmount", { precision: 12, scale: 2 }).default("0"),
  includeTravelAllowance: boolean("includeTravelAllowance").default(false),
  travelAllowance: decimal("travelAllowance", { precision: 12, scale: 2 }).default("0"),
  travelDistanceKm: decimal("travelDistanceKm", { precision: 8, scale: 1 }),
  travelBandKey: text("travelBandKey"),
  travelOverridden: boolean("travelOverridden").default(false),
  travelBranchName: text("travelBranchName"),
  includeSmallJobSurcharge: boolean("includeSmallJobSurcharge").default(false),
  smallJobSurcharge: decimal("smallJobSurcharge", { precision: 12, scale: 2 }).default("0"),
  includeConstructionMgmt: boolean("includeConstructionMgmt").default(false),
  constructionMgmtAmount: decimal("constructionMgmtAmount", { precision: 12, scale: 2 }).default("0"),
  constructionMgmtPercent: decimal("constructionMgmtPercent", { precision: 5, scale: 2 }).default("0"),
  constructionMgmtOverride: boolean("constructionMgmtOverride").default(false),
  complexityLoading: decimal("complexityLoading", { precision: 5, scale: 2 }).default("0"),
  complexityOverride: boolean("complexityOverride").default(false),
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).default("0"),
  councilFees: decimal("councilFees", { precision: 12, scale: 2 }).default("0"),
  homeWarranty: decimal("homeWarranty", { precision: 12, scale: 2 }).default("0"),
  hbcfRequired: boolean("hbcfRequired").default(false).notNull(),
  hbcfRequirementReason: varchar("hbcfRequirementReason", { length: 255 }),
  hbcfFlaggedAt: timestamp("hbcfFlaggedAt"),
  designAdvisor: text("designAdvisor"),
  proposalSentAt: timestamp("proposalSentAt"),
  proposalSentTo: text("proposalSentTo"),
  signwellDocumentId: text("signwellDocumentId"),
  signwellStatus: varchar("signwellStatus", { length: 32 }),
  signedPdfUrl: text("signedPdfUrl"),
  signwellSentAt: timestamp("signwellSentAt"),
  signwellCompletedAt: timestamp("signwellCompletedAt"),
  validUntil: timestamp("validUntil"),
  expiryReminderSentAt: timestamp("expiryReminderSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Quote = typeof quotes.$inferSelect & Record<string, any>;
export type InsertQuote = typeof quotes.$inferInsert & Record<string, any>;

export const quoteDetails = mysqlTable("quote_details", {
  id: int("id").autoincrement().primaryKey(),
  quoteId: int("quoteId").notNull().references(() => quotes.id, { onDelete: "cascade" }).unique(),
  data: json("data").$type<Record<string, any>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_quote_details_quote").on(table.quoteId),
]);
export type QuoteDetail = typeof quoteDetails.$inferSelect;
export type InsertQuoteDetail = typeof quoteDetails.$inferInsert;

// ─── Signature Audit Log ────────────────────────────────────────────────────
export const signatureAuditLog = mysqlTable("signature_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  quoteId: int("quoteId").notNull(),
  event: mysqlEnum("event", ["sent", "viewed", "signed", "declined", "reminder_sent", "expired"]).notNull(),
  recipientEmail: varchar("recipientEmail", { length: 320 }),
  recipientName: varchar("recipientName", { length: 255 }),
  metadata: text("metadata"), // JSON string for extra details
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SignatureAuditLog = typeof signatureAuditLog.$inferSelect;
export type InsertSignatureAuditLog = typeof signatureAuditLog.$inferInsert;

// ─── Quote Components (standardized line items) ─────────────────────────────
export const quoteComponents = mysqlTable("quote_components", {
  id: int("id").autoincrement().primaryKey(),
  quoteId: int("quoteId").notNull(),
  tabName: varchar("tabName", { length: 64 }).notNull(), // roof, channel, beam, post, gable, cantilever, carport, glassroom, screenroom, lattice, spacemaker, trades, extras, windows, awnings
  included: boolean("included").default(true),
  lineItems: json("lineItems"), // Array of { component, colour, uom, qty, cmQty, sellRate, costRate, factoryY, notes }
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type QuoteComponent = typeof quoteComponents.$inferSelect;
export type InsertQuoteComponent = typeof quoteComponents.$inferInsert;

// ─── Skylux Entries ─────────────────────────────────────────────────────────
export const skyluxEntries = mysqlTable("skylux_entries", {
  id: int("id").autoincrement().primaryKey(),
  quoteId: int("quoteId").notNull(),
  included: boolean("included").default(true),
  length: decimal("length", { precision: 8, scale: 2 }),
  width: decimal("width", { precision: 8, scale: 2 }),
  baseCost: decimal("baseCost", { precision: 12, scale: 2 }),
  sellPrice: decimal("sellPrice", { precision: 12, scale: 2 }),
  upgrades: json("upgrades"), // Array of { name, cost, sell }
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SkyluxEntry = typeof skyluxEntries.$inferSelect;
export type InsertSkyluxEntry = typeof skyluxEntries.$inferInsert;

// ─── Eclipse Entries ────────────────────────────────────────────────────────
export const eclipseEntries = mysqlTable("eclipse_entries", {
  id: int("id").autoincrement().primaryKey(),
  quoteId: int("quoteId").notNull(),
  included: boolean("included").default(true),
  systemWidth: decimal("systemWidth", { precision: 8, scale: 2 }),
  systemProjection: decimal("systemProjection", { precision: 8, scale: 2 }),
  bladeCount: int("bladeCount"),
  materialLines: json("materialLines"), // Array of 33 material items
  labourDays: decimal("labourDays", { precision: 5, scale: 1 }),
  labourRate: decimal("labourRate", { precision: 10, scale: 2 }),
  tradeDiscount: decimal("tradeDiscount", { precision: 5, scale: 2 }).default("40"),
  totalCost: decimal("totalCost", { precision: 12, scale: 2 }),
  totalSell: decimal("totalSell", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EclipseEntry = typeof eclipseEntries.$inferSelect;
export type InsertEclipseEntry = typeof eclipseEntries.$inferInsert;

// ─── Master Data ────────────────────────────────────────────────────────────
export const masterData = mysqlTable("master_data", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 64 }).notNull(), // markup, region, council_fee, travel_band, complexity, colour, threshold
  key: varchar("dataKey", { length: 128 }).notNull(),
  value: text("value").notNull(),
  description: text("description"),
  sortOrder: int("sortOrder").default(0),
  metadata: json("metadata"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_master_data_tenant").on(table.tenantId),
  tenantCategoryIdx: index("idx_master_data_tenant_category").on(table.tenantId, table.category),
}));

export type MasterData = typeof masterData.$inferSelect;
export type InsertMasterData = typeof masterData.$inferInsert;

// ─── Colour Groups ────────────────────────────────────────────────────────
export const colourGroups = mysqlTable("colour_groups", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 64 }).notNull(),
  description: text("description"),
  standardColours: json("standardColours").$type<string[]>().default([]),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_colour_groups_tenant").on(table.tenantId),
  tenantNameIdx: uniqueIndex("uq_colour_groups_tenant_name").on(table.tenantId, table.name),
}));
export type ColourGroup = typeof colourGroups.$inferSelect;
export type InsertColourGroup = typeof colourGroups.$inferInsert;

// ─── Colour Group Members (which colours belong to which group) ────────────
export const colourGroupMembers = mysqlTable("colour_group_members", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  colourGroupId: int("colourGroupId").notNull(),
  colourValue: varchar("colourValue", { length: 128 }).notNull(), // matches master_data colour value
  sortOrder: int("sortOrder").default(0),
}, (table) => ({
  tenantIdx: index("idx_colour_group_members_tenant").on(table.tenantId),
  tenantGroupIdx: index("idx_colour_group_members_tenant_group").on(table.tenantId, table.colourGroupId),
}));
export type ColourGroupMember = typeof colourGroupMembers.$inferSelect;
export type InsertColourGroupMember = typeof colourGroupMembers.$inferInsert;

// ─── Products Catalog ──────────────────────────────────────────────────────
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  productCode: varchar("productCode", { length: 64 }),
  tabName: varchar("tabName", { length: 64 }).notNull(),
  subTab: varchar("subTab", { length: 64 }),
  name: varchar("name", { length: 255 }).notNull(),
  uom: varchar("uom", { length: 16 }).notNull().default("m"),
  baseCost: decimal("baseCost", { precision: 12, scale: 2 }).notNull(),
  materials: decimal("materials", { precision: 12, scale: 2 }).default("0"),
  installLabour: decimal("installLabour", { precision: 12, scale: 2 }).default("0"),
  consumables: decimal("consumables", { precision: 12, scale: 2 }).default("0"),
  markupCategory: varchar("markupCategory", { length: 64 }),
  fixedSell: decimal("fixedSell", { precision: 12, scale: 2 }),
  powderCoatSurcharge: decimal("powderCoatSurcharge", { precision: 10, scale: 2 }).default("0"),
  colourGroup: varchar("colourGroup", { length: 64 }),
  colourGroupBottom: varchar("colourGroupBottom", { length: 64 }),
  coverageWidth: int("coverageWidth"),
  notes: text("notes"),
  sortOrder: int("sortOrder").default(0),
  active: boolean("active").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_products_tenant").on(table.tenantId),
  tenantTabIdx: index("idx_products_tenant_tab").on(table.tenantId, table.tabName),
  tenantCodeIdx: index("idx_products_tenant_code").on(table.tenantId, table.productCode),
}));

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ─── Skylux Pricing Matrix ─────────────────────────────────────────────────
export const skyluxMatrix = mysqlTable("skylux_matrix", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  length: int("length").notNull(),
  width: int("width").notNull(),
  baseCost: decimal("baseCost", { precision: 12, scale: 2 }).notNull(),
  sellMultiplier: decimal("sellMultiplier", { precision: 6, scale: 3 }).default("2.226"),
}, (table) => ({
  tenantIdx: index("idx_skylux_matrix_tenant").on(table.tenantId),
  tenantSizeIdx: index("idx_skylux_matrix_tenant_size").on(table.tenantId, table.length, table.width),
}));

export type SkyluxMatrix = typeof skyluxMatrix.$inferSelect;
export type InsertSkyluxMatrix = typeof skyluxMatrix.$inferInsert;

// ─── Deck Products ────────────────────────────────────────────────────────
export const deckProducts = mysqlTable("deck_products", {
  id: int("id").autoincrement().primaryKey(),
  productName: varchar("productName", { length: 255 }).notNull(),
  brand: varchar("brand", { length: 64 }).notNull(),
  profile: varchar("profile", { length: 64 }),
  range: varchar("productRange", { length: 128 }),
  widthMm: int("widthMm"),
  thicknessMm: int("thicknessMm"),
  boardLengthM: decimal("boardLengthM", { precision: 6, scale: 2 }),
  standardBoardLengthM: decimal("standardBoardLengthM", { precision: 6, scale: 2 }),
  boardLengthMm: int("boardLengthMm"),
  pricePerLm: decimal("pricePerLm", { precision: 10, scale: 2 }),
  effectiveCoverMm: int("effectiveCoverMm"),
  retailRatePerM2: decimal("retailRatePerM2", { precision: 10, scale: 2 }),
  clipFixingCostPerM2: decimal("clipFixingCostPerM2", { precision: 10, scale: 2 }),
  colourOptions: text("colourOptions"),
  boardTypes: text("boardTypes"), // JSON array e.g. ["deck","fascia","fillin","edge"]
  wasteDefault: decimal("wasteDefault", { precision: 5, scale: 2 }),
  maxJoistSpacingMm: int("maxJoistSpacingMm"),
  suitableForPictureFrame: boolean("suitableForPictureFrame").default(false),
  imageUrl: text("imageUrl"),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DeckProduct = typeof deckProducts.$inferSelect;
export type InsertDeckProduct = typeof deckProducts.$inferInsert;

// ─── Deck Framing Products ────────────────────────────────────────────────
export const deckFraming = mysqlTable("deck_framing", {
  id: int("id").autoincrement().primaryKey(),
  productName: varchar("productName", { length: 255 }).notNull(),
  systemName: varchar("systemName", { length: 128 }),
  frameType: varchar("frameType", { length: 64 }).notNull(),
  beamSize: varchar("beamSize", { length: 64 }).notNull(),
  memberCategory: varchar("memberCategory", { length: 64 }),
  memberSize: varchar("memberSize", { length: 64 }),
  pricePerLm: decimal("pricePerLm", { precision: 10, scale: 2 }),
  ratePerUnit: decimal("ratePerUnit", { precision: 10, scale: 2 }),
  weightPerLm: decimal("weightPerLm", { precision: 8, scale: 3 }),
  joistSpacingMm: int("joistSpacingMm"),
  beamSpacingM: decimal("beamSpacingM", { precision: 6, scale: 2 }),
  postSpacingM: decimal("postSpacingM", { precision: 6, scale: 2 }),
  recommendedMinDeckSize: decimal("recommendedMinDeckSize", { precision: 8, scale: 2 }),
  recommendedMaxDeckSize: decimal("recommendedMaxDeckSize", { precision: 8, scale: 2 }),
  status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DeckFraming = typeof deckFraming.$inferSelect;
export type InsertDeckFraming = typeof deckFraming.$inferInsert;

// ─── Deck Labour Rules ────────────────────────────────────────────────────
export const deckLabourRules = mysqlTable("deck_labour_rules", {
  id: int("id").autoincrement().primaryKey(),
  ruleName: varchar("ruleName", { length: 128 }).notNull(),
  baseRatePerM2: decimal("baseRatePerM2", { precision: 10, scale: 2 }).notNull(),
  slopingSiteMultiplier: decimal("slopingSiteMultiplier", { precision: 6, scale: 3 }).default("1.000"),
  restrictedAccessMultiplier: decimal("restrictedAccessMultiplier", { precision: 6, scale: 3 }).default("1.000"),
  elevatedDeckMultiplier: decimal("elevatedDeckMultiplier", { precision: 6, scale: 3 }).default("1.000"),
  pictureFrameLabourUplift: decimal("pictureFrameLabourUplift", { precision: 6, scale: 3 }).default("1.000"),
  splitLevelUplift: decimal("splitLevelUplift", { precision: 6, scale: 3 }).default("1.000"),
  multiLevelUplift: decimal("multiLevelUplift", { precision: 6, scale: 3 }).default("1.000"),
  active: boolean("active").default(true).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DeckLabourRule = typeof deckLabourRules.$inferSelect;
export type InsertDeckLabourRule = typeof deckLabourRules.$inferInsert;

// ─── Deck Pricing Rules ───────────────────────────────────────────────────
export const deckPricingRules = mysqlTable("deck_pricing_rules", {
  id: int("id").autoincrement().primaryKey(),
  ruleName: varchar("ruleName", { length: 128 }).notNull(),
  active: boolean("active").default(true).notNull(),
  defaultDepositPercent: decimal("defaultDepositPercent", { precision: 5, scale: 2 }).default("20.00"),
  gstPercent: decimal("gstPercent", { precision: 5, scale: 2 }).default("10.00"),
  quoteValidityDays: int("quoteValidityDays").default(30),
  defaultMarginPercent: decimal("defaultMarginPercent", { precision: 5, scale: 2 }).default("35.00"),
  minimumMarginPercent: decimal("minimumMarginPercent", { precision: 5, scale: 2 }).default("25.00"),
  stretchMarginPercent: decimal("stretchMarginPercent", { precision: 5, scale: 2 }),
  restrictedAccessSurcharge: decimal("restrictedAccessSurcharge", { precision: 10, scale: 2 }).default("150.00"),
  baseDeliveryFee: decimal("baseDeliveryFee", { precision: 10, scale: 2 }).default("350.00"),
  managerApprovalBelowMargin: decimal("managerApprovalBelowMargin", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DeckPricingRule = typeof deckPricingRules.$inferSelect;
export type InsertDeckPricingRule = typeof deckPricingRules.$inferInsert;

// ─── Deck Add-On Items ────────────────────────────────────────────────────
export const deckAddonItems = mysqlTable("deck_addon_items", {
  id: int("id").autoincrement().primaryKey(),
  itemName: varchar("itemName", { length: 255 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  unit: varchar("unit", { length: 32 }),
  unitPrice: decimal("unitPrice", { precision: 10, scale: 2 }),
  labourRate: decimal("labourRate", { precision: 10, scale: 2 }),
  pricingMethod: varchar("pricingMethod", { length: 32 }),
  description: text("description"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DeckAddonItem = typeof deckAddonItems.$inferSelect;
export type InsertDeckAddonItem = typeof deckAddonItems.$inferInsert;

// ─── Deck Quotes ──────────────────────────────────────────────────────────
export const deckQuotes = mysqlTable("deck_quotes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  userId: int("userId").notNull(),
  quoteNumber: varchar("quoteNumber", { length: 32 }).notNull().unique(),
  status: mysqlEnum("status", ["draft", "sent", "accepted", "lost"]).default("draft").notNull(),
  outcomeReason: varchar("outcomeReason", { length: 255 }),
  archived: boolean("archived").default(false).notNull(),
  // Client
  clientId: int("clientId"),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientPhone: varchar("clientPhone", { length: 64 }),
  clientEmail: varchar("clientEmail", { length: 320 }),
  clientCompany: varchar("clientCompany", { length: 255 }),
  siteAddress: text("siteAddress"),
  // Dimensions
  deckWidthM: decimal("deckWidthM", { precision: 8, scale: 2 }),
  deckProjectionM: decimal("deckProjectionM", { precision: 8, scale: 2 }),
  deckHeightAboveGroundMm: int("deckHeightAboveGroundMm"),
  // Selections
  frameType: varchar("frameType", { length: 64 }),
  steelBeamSelection: varchar("steelBeamSelection", { length: 64 }),
  deckingBrand: varchar("deckingBrand", { length: 64 }),
  deckingProductId: int("deckingProductId"),
  fasciaProductId: int("fasciaProductId"),
  edgeProductId: int("edgeProductId"),
  colour: varchar("colour", { length: 128 }),
  edgeDetail: varchar("edgeDetail", { length: 64 }),
  deckShape: varchar("deckShape", { length: 64 }),
  boardDirection: varchar("boardDirection", { length: 64 }),
  levels: varchar("levels", { length: 64 }),
  siteCondition: varchar("siteCondition", { length: 64 }),
  // Add-ons (booleans)
  stairsRequired: boolean("stairsRequired").default(false),
  numberOfStairsFlights: int("numberOfStairsFlights").default(0),
  handrailRequired: boolean("handrailRequired").default(false),
  screensRequired: boolean("screensRequired").default(false),
  lightingRequired: boolean("lightingRequired").default(false),
  demolitionRequired: boolean("demolitionRequired").default(false),
  disposalRequired: boolean("disposalRequired").default(false),
  engineeringRequired: boolean("engineeringRequired").default(false),
  permitRequired: boolean("permitRequired").default(false),
  // Dynamic add-ons (JSON array: [{addonItemId, qty}])
  selectedAddons: json("selectedAddons"),
  // Rules links
  labourRuleId: int("labourRuleId"),
  pricingRuleId: int("pricingRuleId"),
  // Margin & pricing overrides
  selectedMarginPercent: decimal("selectedMarginPercent", { precision: 5, scale: 2 }),
  commissionPercent: decimal("commissionPercent", { precision: 5, scale: 2 }).default("10.00"),
  depositPercent: decimal("depositPercent", { precision: 5, scale: 2 }),
  baseDeliveryFee: decimal("baseDeliveryFee", { precision: 10, scale: 2 }),
  councilFees: decimal("councilFees", { precision: 10, scale: 2 }).default("0"),
  homeWarranty: decimal("homeWarranty", { precision: 10, scale: 2 }).default("0"),
  hbcfRequired: boolean("hbcfRequired").default(false).notNull(),
  hbcfRequirementReason: varchar("hbcfRequirementReason", { length: 255 }),
  hbcfFlaggedAt: timestamp("hbcfFlaggedAt"),
  // Adjustments
  deliveryAmount: decimal("deliveryAmount", { precision: 12, scale: 2 }).default("0"),
  deliveryOverride: boolean("deliveryOverride").default(false),
  travelAllowance: decimal("travelAllowance", { precision: 12, scale: 2 }).default("0"),
  travelDistanceKm: decimal("travelDistanceKm", { precision: 8, scale: 1 }),
  travelBranchName: varchar("travelBranchName", { length: 128 }),
  travelBandKey: varchar("travelBandKey", { length: 32 }),
  travelOverridden: boolean("travelOverridden").default(false),
  smallJobSurcharge: decimal("smallJobSurcharge", { precision: 12, scale: 2 }).default("0"),
  constructionMgmtPercent: decimal("constructionMgmtPercent", { precision: 5, scale: 2 }).default("0"),
  constructionMgmtOverride: boolean("constructionMgmtOverride").default(false),
  complexityLoadingPercent: decimal("complexityLoadingPercent", { precision: 5, scale: 2 }).default("0"),
  complexityOverride: boolean("complexityOverride").default(false),
  // Computed pricing (stored after calculation)
  areaM2: decimal("areaM2", { precision: 10, scale: 2 }),
  perimeterM: decimal("perimeterM", { precision: 10, scale: 2 }),
  materialsSubtotal: decimal("materialsSubtotal", { precision: 12, scale: 2 }),
  adjustedLabour: decimal("adjustedLabour", { precision: 12, scale: 2 }),
  stairsLabour: decimal("stairsLabour", { precision: 12, scale: 2 }),
  demoLabour: decimal("demoLabour", { precision: 12, scale: 2 }),
  deliveryTotal: decimal("deliveryTotal", { precision: 12, scale: 2 }),
  hardCostSubtotal: decimal("hardCostSubtotal", { precision: 12, scale: 2 }),
  sellPriceExGst: decimal("sellPriceExGst", { precision: 12, scale: 2 }),
  gstAmount: decimal("gstAmount", { precision: 12, scale: 2 }),
  sellPriceIncGst: decimal("sellPriceIncGst", { precision: 12, scale: 2 }),
  depositAmount: decimal("depositAmount", { precision: 12, scale: 2 }),
  complexityMultiplier: decimal("complexityMultiplier", { precision: 6, scale: 3 }),
  // Site plan data (JSON: parcelData, structureOffset, setbacks, satelliteImageUrl)
  sitePlanData: json("sitePlanData"),
  // Design inputs (JSON: SubfloorInputs for persisting design panel state)
  designInputsJson: text("designInputsJson"),
  // AI render history (JSON array of render entries with URLs, prompts, timestamps)
  renderHistory: json("renderHistory"),
  // Photo for AI render
  photoUrl: text("photoUrl"),
  photoKey: text("photoKey"),
  calibrationData: json("calibrationData"),
  // Notes
  notes: text("notes"),
  designAdvisor: varchar("designAdvisor", { length: 128 }),
  // Construction spec data (JSON: wind category, soil class, footings, balustrade, electrical, plumbing, site access)
  specData: json("specData"),
  checklistSelections: json("deckChecklistSelections"),
  // Spec-sheet-like fields
  region: varchar("region", { length: 64 }),
  localCouncil: varchar("localCouncil", { length: 128 }),
  descriptionOfWork: text("descriptionOfWork"),
  proposalSentAt: timestamp("proposalSentAt"),
  proposalSentTo: varchar("proposalSentTo", { length: 320 }),
  validUntil: timestamp("validUntil"),
  expiryReminderSentAt: timestamp("expiryReminderSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_deck_quotes_tenant").on(table.tenantId),
]);
export type DeckQuote = typeof deckQuotes.$inferSelect;;
export type InsertDeckQuote = typeof deckQuotes.$inferInsert;

// ─── Deck Add-On Override History (Audit Trail) ───────────────────────────────
export const deckAddonOverrideHistory = mysqlTable("deck_addon_override_history", {
  id: int("id").autoincrement().primaryKey(),
  deckQuoteId: int("deckQuoteId").notNull(),
  addonItemId: int("addonItemId").notNull(),
  addonItemName: varchar("addonItemName", { length: 255 }).notNull(),
  previousPrice: decimal("previousPrice", { precision: 10, scale: 2 }),
  newPrice: decimal("newPrice", { precision: 10, scale: 2 }),
  changedByUserId: int("changedByUserId").notNull(),
  changedByName: varchar("changedByName", { length: 255 }),
  changedAt: timestamp("changedAt").defaultNow().notNull(),
});

export type DeckAddonOverrideHistory = typeof deckAddonOverrideHistory.$inferSelect;
export type InsertDeckAddonOverrideHistory = typeof deckAddonOverrideHistory.$inferInsert;

// ─── Eclipse Opening Roof Quotes ─────────────────────────────────────────────
export const eclipseQuotes = mysqlTable("eclipse_quotes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  userId: int("userId").notNull(),
  quoteNumber: varchar("quoteNumber", { length: 32 }).notNull().unique(),
  status: mysqlEnum("status", ["draft", "sent", "accepted", "lost"]).default("draft").notNull(),
  outcomeReason: varchar("outcomeReason", { length: 255 }),
  archived: boolean("archived").default(false).notNull(),
  // Client details
  clientId: int("clientId"),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientPhone: varchar("clientPhone", { length: 64 }),
  clientEmail: varchar("clientEmail", { length: 320 }),
  clientAddress: text("clientAddress"),
  // Project settings
  commissionRate: decimal("commissionRate", { precision: 5, scale: 3 }).default("0.100"),
  margin: decimal("margin", { precision: 5, scale: 3 }).default("0.450"),
  // Units (stored as JSON array of UnitInput objects)
  units: json("units"), // UnitInput[]
  // Additional costs
  footings: decimal("footings", { precision: 12, scale: 2 }).default("0"),
  footingRate: decimal("footingRate", { precision: 12, scale: 2 }).default("0"),
  approvals: decimal("approvals", { precision: 12, scale: 2 }).default("0"),
  projectManagement: decimal("projectManagement", { precision: 12, scale: 2 }).default("0"), // deprecated - kept for backward compat
  gableBrackets: decimal("gableBrackets", { precision: 12, scale: 2 }).default("0"),
  constructionCleaning: decimal("constructionCleaning", { precision: 12, scale: 2 }).default("0"), // deprecated - mapped to siteClean
  attachmentToHouse: decimal("attachmentToHouse", { precision: 12, scale: 2 }).default("0"),
  travel: decimal("travel", { precision: 12, scale: 2 }).default("0"),
  siteClean: decimal("siteClean", { precision: 12, scale: 2 }).default("0"),
  demolition: decimal("demolition", { precision: 12, scale: 2 }).default("0"),
  plumbing: decimal("plumbing", { precision: 12, scale: 2 }).default("0"),
  concrete: decimal("concrete", { precision: 12, scale: 2 }).default("0"),
  electrical: decimal("electrical", { precision: 12, scale: 2 }).default("0"),
  otherCost: decimal("otherCost", { precision: 12, scale: 2 }).default("0"),
  otherCostDescription: varchar("otherCostDescription", { length: 256 }),
  councilFees: decimal("councilFees", { precision: 12, scale: 2 }).default("0"),
  homeWarranty: decimal("homeWarranty", { precision: 12, scale: 2 }).default("0"),
  hbcfRequired: boolean("hbcfRequired").default(false).notNull(),
  hbcfRequirementReason: varchar("hbcfRequirementReason", { length: 255 }),
  hbcfFlaggedAt: timestamp("hbcfFlaggedAt"),
  // Adjustments (same pattern as OPQ)
  deliveryAmount: decimal("deliveryAmount", { precision: 12, scale: 2 }).default("0"),
  deliveryOverride: boolean("deliveryOverride").default(false),
  travelAllowanceAmount: decimal("travelAllowanceAmount", { precision: 12, scale: 2 }).default("0"),
  travelDistanceKm: decimal("travelDistanceKm", { precision: 8, scale: 1 }),
  travelBranchName: varchar("travelBranchName", { length: 128 }),
  travelBandKey: varchar("travelBandKey", { length: 32 }),
  travelOverridden: boolean("travelOverridden").default(false),
  smallJobSurcharge: decimal("smallJobSurcharge", { precision: 12, scale: 2 }).default("0"),
  constructionMgmtPercent: decimal("constructionMgmtPercent", { precision: 5, scale: 2 }).default("0"),
  constructionMgmtOverride: boolean("constructionMgmtOverride").default(false),
  complexityLoadingPercent: decimal("complexityLoadingPercent", { precision: 5, scale: 2 }).default("0"),
  complexityOverride: boolean("complexityOverride").default(false),
  // Computed pricing (stored after calculation)
  totalSqm: decimal("totalSqm", { precision: 10, scale: 2 }),
  totalSellPriceEx: decimal("totalSellPriceEx", { precision: 12, scale: 2 }),
  totalGST: decimal("totalGST", { precision: 12, scale: 2 }),
  totalRRPInc: decimal("totalRRPInc", { precision: 12, scale: 2 }),
  rrpPerSqm: decimal("rrpPerSqm", { precision: 12, scale: 2 }),
  // Site plan drawing (JSON from fabric.js canvas)
  sitePlanData: json("sitePlanData"),
  sitePlanImage: text("sitePlanImage"), // base64 data URL for PDF embedding
  // AI render history (JSON array of render entries with URLs, prompts, timestamps)
  renderHistory: json("renderHistory"),
  // Photo for AI render
  photoUrl: text("photoUrl"),
  photoKey: text("photoKey"),
  calibrationData: json("calibrationData"),
  // Checklist pricing selections (same pattern as OPQ specChecklistSelections)
  checklistSelections: json("eclipseChecklistSelections"),
  // Notes
  notes: text("notes"),
  designAdvisor: varchar("designAdvisor", { length: 128 }),
  // Construction spec data (JSON: wind category, soil class, footings, electrical, plumbing, site access)
  specData: json("specData"),
  // Spec-sheet-like fields
  region: varchar("region", { length: 64 }),
  localCouncil: varchar("localCouncil", { length: 128 }),
  descriptionOfWork: text("descriptionOfWork"),
  proposalSentAt: timestamp("proposalSentAt"),
  proposalSentTo: varchar("proposalSentTo", { length: 320 }),
  validUntil: timestamp("validUntil"),
  expiryReminderSentAt: timestamp("expiryReminderSentAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_eclipse_quotes_tenant").on(table.tenantId),
]);
export type EclipseQuote = typeof eclipseQuotes.$inferSelect;;
export type InsertEclipseQuote = typeof eclipseQuotes.$inferInsert;

// ─── Eclipse Pricing (editable material prices) ──────────────────────────────
export const eclipsePricing = mysqlTable("eclipse_pricing", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("priceKey", { length: 64 }).notNull().unique(),
  value: decimal("value", { precision: 12, scale: 3 }).notNull(),
  label: varchar("label", { length: 128 }),
  category: varchar("category", { length: 64 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EclipsePricing = typeof eclipsePricing.$inferSelect;
export type InsertEclipsePricing = typeof eclipsePricing.$inferInsert;

// ─── Spec Mappings (Admin-configurable spec-to-product rules) ──────────────
export const specMappings = mysqlTable("spec_mappings", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(), // Human-readable rule name e.g. "Posts from spec"
  tabName: varchar("tabName", { length: 64 }).notNull(), // Which component tab this generates items for
  specField: varchar("specField", { length: 128 }).notNull(), // Primary spec field to evaluate e.g. "specPostsNumber"
  condition: varchar("condition", { length: 512 }).notNull(), // Condition expression e.g. "> 0", "= skillion", "!= ''"
  productId: int("productId"), // Optional: link to specific product for rate lookup
  productMatch: varchar("productMatch", { length: 255 }), // Optional: match product by spec field value (e.g. specPostsType → product name)
  qtyFormula: varchar("qtyFormula", { length: 512 }).notNull(), // Quantity formula e.g. "specPostsNumber", "specWidth * specLength / 0.762"
  description: varchar("description", { length: 255 }), // Override description for the generated line item
  colourField: varchar("colourField", { length: 128 }), // Which spec field provides the colour e.g. "specPostsColour"
  bottomColourField: varchar("bottomColourField", { length: 128 }), // Which spec field provides the bottom colour e.g. "specRoofColourBottom"
  uom: varchar("uom", { length: 16 }).default("ea"), // Unit of measure
  sortOrder: int("sortOrder").default(0),
  active: boolean("active").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_spec_mappings_tenant").on(table.tenantId),
  index("idx_spec_mappings_tenant_active").on(table.tenantId, table.active),
]);
export type SpecMapping = typeof specMappings.$inferSelect;
export type InsertSpecMapping = typeof specMappings.$inferInsert;

// ─── Spec Mapping History (Audit Trail) ─────────────────────────────────────
export const specMappingHistory = mysqlTable("spec_mapping_history", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  mappingId: int("mappingId").notNull(), // FK to spec_mappings.id (no cascade — keep history if mapping deleted)
  userId: int("userId").references(() => users.id),
  userName: varchar("userName", { length: 255 }),
  action: varchar("action", { length: 32 }).notNull(), // "created", "updated", "deleted", "activated", "deactivated"
  changes: json("changes").$type<Array<{ field: string; oldValue: any; newValue: any }>>(),
  snapshot: json("snapshot").$type<Record<string, any>>(), // full mapping state at time of change
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_spec_mapping_history_tenant").on(table.tenantId),
  index("idx_spec_mapping_history_tenant_mapping").on(table.tenantId, table.mappingId),
]);
export type SpecMappingHistory = typeof specMappingHistory.$inferSelect;
export type InsertSpecMappingHistory = typeof specMappingHistory.$inferInsert;

// ─── Quote Items (Auto-generated + Manual line items for OPQ) ──────────────
export const quoteItems = mysqlTable("quote_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  quoteId: int("quoteId").notNull(),
  source: mysqlEnum("source", ["auto", "manual"]).notNull().default("manual"),
  specMappingId: int("specMappingId"), // Which mapping rule generated this (null for manual)
  productId: int("productId"), // Linked product for rate lookup
  tabName: varchar("tabName", { length: 64 }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  colour: varchar("colour", { length: 64 }),
  bottomColour: varchar("bottomColour", { length: 64 }),
  uom: varchar("uom", { length: 16 }).default("ea"),
  qty: decimal("qty", { precision: 10, scale: 3 }).notNull().default("0"),
  costRate: decimal("costRate", { precision: 12, scale: 2 }).notNull().default("0"),
  sellRate: decimal("sellRate", { precision: 12, scale: 2 }).notNull().default("0"),
  needsConfirmation: boolean("needsConfirmation").default(false), // Flagged after re-generation for manual items
  notes: text("notes"),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_quote_items_tenant").on(table.tenantId),
  index("idx_quote_items_tenant_quote").on(table.tenantId, table.quoteId),
]);
export type QuoteItem = typeof quoteItems.$inferSelect;
export type InsertQuoteItem = typeof quoteItems.$inferInsert;

// ─── Window/Door Option Modifiers ─────────────────────────────────────────
export const windowDoorOptionModifiers = mysqlTable("window_door_option_modifiers", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  productType: mysqlEnum("productType", ["window", "door"]).notNull(),
  optionGroup: mysqlEnum("optionGroup", ["glass_type", "tint", "obscurity", "etched", "screen", "pet_door", "other"]).notNull(),
  optionValue: varchar("optionValue", { length: 128 }).notNull(),
  adjustmentType: mysqlEnum("adjustmentType", ["percent", "fixed"]).notNull().default("percent"),
  costAdjustmentValue: decimal("costAdjustmentValue", { precision: 10, scale: 2 }).notNull().default("0.00"),
  sellAdjustmentValue: decimal("sellAdjustmentValue", { precision: 10, scale: 2 }).notNull().default("0.00"),
  appliesTo: varchar("appliesTo", { length: 32 }).notNull().default("base_line"),
  label: varchar("label", { length: 255 }),
  notes: text("notes"),
  sortOrder: int("sortOrder").default(0),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_wd_option_modifiers_tenant").on(table.tenantId),
  index("idx_wd_option_modifiers_lookup").on(table.tenantId, table.productType, table.optionGroup, table.active),
]);
export type WindowDoorOptionModifier = typeof windowDoorOptionModifiers.$inferSelect;
export type InsertWindowDoorOptionModifier = typeof windowDoorOptionModifiers.$inferInsert;


// ─── CRM Module ─────────────────────────────────────────────────────────────

export const crmLeads = mysqlTable("crm_leads", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  leadNumber: varchar("leadNumber", { length: 20 }).notNull(),
  contactFirstName: varchar("contactFirstName", { length: 100 }),
  contactLastName: varchar("contactLastName", { length: 100 }),
  contactPhone: varchar("contactPhone", { length: 50 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  contactAddress: text("contactAddress"),
  clientNumber: varchar("clientNumber", { length: 64 }),
  company: varchar("company", { length: 255 }),
  suburb: varchar("suburb", { length: 128 }),
  state: varchar("state", { length: 32 }),
  postcode: varchar("postcode", { length: 16 }),
  productType: varchar("productType", { length: 100 }),
  leadSource: varchar("leadSource", { length: 100 }),
  status: mysqlEnum("status", ["new", "assigned", "appointment_set", "quoted", "contract", "building_authority", "construction", "completed", "won", "lost", "cancelled"]).default("new").notNull(),
  outcome: varchar("outcome", { length: 100 }),
  lostReason: varchar("lostReason", { length: 255 }),
  lostSource: varchar("lostSource", { length: 32 }),
  lostCompetitorName: varchar("lostCompetitorName", { length: 255 }),
  lostAutoSetAt: timestamp("lostAutoSetAt"),
  lostPreviousStatus: varchar("lostPreviousStatus", { length: 64 }),
  designAdvisor: varchar("designAdvisor", { length: 100 }),
  franchiseNumber: varchar("franchiseNumber", { length: 20 }),
  franchiseType: varchar("franchiseType", { length: 50 }),
  assignedDate: timestamp("assignedDate"),
  notes: text("notes"),
  latitude: double("latitude"),
  longitude: double("longitude"),
  detectedRegion: varchar("detectedRegion", { length: 64 }),
  branchId: int("branchId"),
  constructionJobNumber: varchar("constructionJobNumber", { length: 64 }),
  leadDate: varchar("leadDate", { length: 10 }),
  sourceCreatedAt: timestamp("sourceCreatedAt"),
  externalLeadNumber: varchar("externalLeadNumber", { length: 32 }),
  sourceUrl: text("sourceUrl"),
  assignedTo: int("assignedTo"),
  archived: boolean("archived").default(false).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CrmLead = typeof crmLeads.$inferSelect;
export type InsertCrmLead = typeof crmLeads.$inferInsert;

export const leadNotes = mysqlTable("lead_notes", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  section: varchar("section", { length: 32 }).default("general").notNull(),
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 100 }).notNull(),
  content: text("content").notNull(),
  pinned: boolean("pinned").default(false).notNull(),
  category: varchar("category", { length: 32 }).default("general").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type LeadNote = typeof leadNotes.$inferSelect;
export type InsertLeadNote = typeof leadNotes.$inferInsert;

// ─── Quote Notes ────────────────────────────────────────────────────────────
export const quoteNotes = mysqlTable("quote_notes", {
  id: int("id").autoincrement().primaryKey(),
  quoteId: int("quoteId").notNull(),
  quoteType: varchar("quoteType", { length: 20 }).notNull(), // 'structure' | 'deck' | 'eclipse'
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 100 }).notNull(),
  content: text("content").notNull(),
  pinned: boolean("pinned").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type QuoteNote = typeof quoteNotes.$inferSelect;
export type InsertQuoteNote = typeof quoteNotes.$inferInsert;

// ─── Design Advisors ────────────────────────────────────────────────────────
export const designAdvisors = mysqlTable("design_advisors", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 30 }),
  role: varchar("role", { length: 128 }).default("design_adviser").notNull(),
  profileDescription: text("profileDescription"),
  photoUrl: varchar("photoUrl", { length: 512 }),
  branchId: int("branchId"),
  userId: int("userId"),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DesignAdvisor = typeof designAdvisors.$inferSelect;
export type InsertDesignAdvisor = typeof designAdvisors.$inferInsert;

export const crmAppointments = mysqlTable("crm_appointments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  leadId: int("leadId").notNull(),
  appointmentType: varchar("appointmentType", { length: 64 }),
  assignedUserId: int("assignedUserId"),
  appointmentDate: varchar("appointmentDate", { length: 20 }),
  appointmentTime: varchar("appointmentTime", { length: 20 }),
  duration: int("duration").default(60),
  location: text("location"),
  notes: text("notes"),
  outcome: varchar("outcome", { length: 100 }),
  participants: json("participants").$type<Array<{ name?: string; email: string }>>(),
  nylasEventId: varchar("nylasEventId", { length: 255 }),
  calendarSyncStatus: varchar("calendarSyncStatus", { length: 32 }).default("not_synced").notNull(),
  calendarSyncError: text("calendarSyncError"),
  calendarSyncedAt: timestamp("calendarSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_crm_appointments_tenant").on(table.tenantId),
  index("idx_crm_appointments_lead_tenant").on(table.tenantId, table.leadId),
]);
export type CrmAppointment = typeof crmAppointments.$inferSelect;

export const crmContracts = mysqlTable("crm_contracts", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  contractDate: varchar("contractDate", { length: 20 }),
  contractValue: decimal("contractValue", { precision: 12, scale: 2 }),
  depositAmount: decimal("depositAmount", { precision: 12, scale: 2 }),
  depositDate: varchar("depositDate", { length: 20 }),
  paymentSchedule: text("paymentSchedule"),
  welcomeLetterSent: boolean("welcomeLetterSent").default(false),
  welcomeLetterDate: varchar("welcomeLetterDate", { length: 20 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CrmContract = typeof crmContracts.$inferSelect;

export const crmBuildingAuthority = mysqlTable("crm_building_authority", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  councilName: varchar("councilName", { length: 200 }),
  applicationDate: varchar("applicationDate", { length: 20 }),
  approvalDate: varchar("approvalDate", { length: 20 }),
  approvalNumber: varchar("approvalNumber", { length: 100 }),
  status: varchar("status", { length: 50 }),
  councilLetterType: varchar("councilLetterType", { length: 50 }),
  councilLetterSentDate: varchar("councilLetterSentDate", { length: 20 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CrmBuildingAuthority = typeof crmBuildingAuthority.$inferSelect;

export const crmConstructions = mysqlTable("crm_constructions", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  estimatedBuildDays: int("estimatedBuildDays"),
  buildingSupervisor: varchar("buildingSupervisor", { length: 100 }),
  roofSheetProduct: varchar("roofSheetProduct", { length: 100 }),
  roofSheetColour: varchar("roofSheetColour", { length: 100 }),
  linealMetres: decimal("linealMetres", { precision: 10, scale: 2 }),
  startDate: varchar("startDate", { length: 20 }),
  completionDate: varchar("completionDate", { length: 20 }),
  tradesRequired: json("tradesRequired"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CrmConstruction = typeof crmConstructions.$inferSelect;

export const crmVerifications = mysqlTable("crm_verifications", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  designCorrect: boolean("designCorrect"),
  designCheckDate: varchar("designCheckDate", { length: 20 }),
  costingCorrect: boolean("costingCorrect"),
  costingCheckDate: varchar("costingCheckDate", { length: 20 }),
  franchiseAuthority: boolean("franchiseAuthority"),
  authorityDate: varchar("authorityDate", { length: 20 }),
  maintenanceLetterSentDate: varchar("maintenanceLetterSentDate", { length: 20 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CrmVerification = typeof crmVerifications.$inferSelect;

export const crmCustomerReviews = mysqlTable("crm_customer_reviews", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  projectCompletedDate: varchar("projectCompletedDate", { length: 20 }),
  warrantyReceivedDate: varchar("warrantyReceivedDate", { length: 20 }),
  homeAdditionType: varchar("homeAdditionType", { length: 100 }),
  additionDescription: text("additionDescription"),
  serviceRating: int("serviceRating"),
  workmanshipRating: int("workmanshipRating"),
  satisfactionRating: int("satisfactionRating"),
  designConsultantRating: int("designConsultantRating"),
  customerComments: text("customerComments"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CrmCustomerReview = typeof crmCustomerReviews.$inferSelect;

export const crmStaff = mysqlTable("crm_staff", {
  id: int("id").autoincrement().primaryKey(),
  firstName: varchar("firstName", { length: 100 }).notNull(),
  lastName: varchar("lastName", { length: 100 }).notNull(),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 50 }),
  staffType: mysqlEnum("staffType", ["sales", "trade"]).notNull(),
  tradeType: varchar("tradeType", { length: 100 }),
  franchises: varchar("franchises", { length: 200 }),
  status: mysqlEnum("status", ["active", "inactive", "blocked"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CrmStaffMember = typeof crmStaff.$inferSelect;
export type InsertCrmStaff = typeof crmStaff.$inferInsert;

export const crmActivities = mysqlTable("crm_activities", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  activityType: varchar("activityType", { length: 50 }).notNull(),
  description: text("description"),
  emailType: varchar("emailType", { length: 100 }),
  sentDate: varchar("sentDate", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type CrmActivity = typeof crmActivities.$inferSelect;

export const crmDocuments = mysqlTable("crm_documents", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 500 }).notNull(),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type CrmDocument = typeof crmDocuments.$inferSelect;

// ─── Email Templates ────────────────────────────────────────────────────────
export const emailTemplates = mysqlTable("email_templates", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  letterType: varchar("letterType", { length: 64 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  body: text("body").notNull(),
  attachmentUrl: text("attachmentUrl"),
  attachmentName: varchar("attachmentName", { length: 255 }),
  category: varchar("category", { length: 64 }).default("general").notNull(),
  triggerKey: varchar("triggerKey", { length: 128 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_email_templates_tenant").on(table.tenantId),
  index("idx_email_templates_tenant_trigger").on(table.tenantId, table.triggerKey),
  uniqueIndex("uq_email_templates_tenant_letter_type").on(table.tenantId, table.letterType),
]);
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = typeof emailTemplates.$inferInsert;


// ─── Vocphone: SMS Messages ─────────────────────────────────────────────────
export const smsMessages = mysqlTable("sms_messages", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  leadId: int("leadId"),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  fromNumber: varchar("fromNumber", { length: 20 }).notNull(),
  toNumber: varchar("toNumber", { length: 20 }).notNull(),
  body: text("body").notNull(),
  templateId: int("templateId"),
  status: varchar("status", { length: 32 }).default("sent"),
  vocphoneMessageId: varchar("vocphoneMessageId", { length: 128 }),
  sentBy: int("sentBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_sms_messages_tenant").on(table.tenantId),
  index("idx_sms_messages_lead_tenant").on(table.tenantId, table.leadId),
]);
export type SmsMessage = typeof smsMessages.$inferSelect;
export type InsertSmsMessage = typeof smsMessages.$inferInsert;

// ─── Vocphone: Call Logs ────────────────────────────────────────────────────
export const callLogs = mysqlTable("call_logs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  leadId: int("leadId"),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  fromNumber: varchar("fromNumber", { length: 128 }).notNull(),
  toNumber: varchar("toNumber", { length: 128 }).notNull(),
  duration: int("duration").default(0),
  recordingUrl: text("recordingUrl"),
  vocphoneCallId: varchar("vocphoneCallId", { length: 128 }),
  callSummary: text("callSummary"),
  transcription: text("transcription"),
  extension: int("extension"),
  extensionUserName: varchar("extensionUserName", { length: 100 }),
  userNotes: text("userNotes"),
  reviewed: boolean("reviewed").default(false).notNull(),
  reviewedAt: timestamp("reviewedAt"),
  snoozedUntil: timestamp("snoozedUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_call_logs_tenant").on(table.tenantId),
  index("idx_call_logs_lead_tenant").on(table.tenantId, table.leadId),
  index("idx_call_logs_call_tenant").on(table.tenantId, table.vocphoneCallId),
]);
export type CallLog = typeof callLogs.$inferSelect;
export type InsertCallLog = typeof callLogs.$inferInsert;

// VOCPhone extension-to-user mapping (admin-managed)
export const vocphoneExtensions = mysqlTable("vocphone_extensions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  extension: int("extension").notNull(),
  firstName: varchar("firstName", { length: 50 }).notNull(),
  lastName: varchar("lastName", { length: 50 }).notNull(),
  email: varchar("email", { length: 200 }),
  callerId: varchar("callerId", { length: 20 }),
  isActive: boolean("isActive").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_vocphone_extensions_tenant_extension").on(table.tenantId, table.extension),
  index("idx_vocphone_extensions_tenant").on(table.tenantId),
]);
export type VocphoneExtension = typeof vocphoneExtensions.$inferSelect;
export type InsertVocphoneExtension = typeof vocphoneExtensions.$inferInsert;

// ─── Vocphone: SMS Templates ────────────────────────────────────────────────
export const smsTemplates = mysqlTable("sms_templates", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  name: varchar("name", { length: 128 }).notNull(),
  category: varchar("category", { length: 64 }).notNull(),
  body: text("body").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_sms_templates_tenant").on(table.tenantId),
]);
export type SmsTemplate = typeof smsTemplates.$inferSelect;
export type InsertSmsTemplate = typeof smsTemplates.$inferInsert;


// ─── Global Settings (key-value store for app-wide config) ─────────────────
export const globalSettings = mysqlTable("global_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("settingKey", { length: 128 }).notNull().unique(),
  value: json("value"), // JSON value for the setting
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GlobalSetting = typeof globalSettings.$inferSelect;
export type InsertGlobalSetting = typeof globalSettings.$inferInsert;

// ─── Branches ───────────────────────────────────────────────────────────────
export const branches = mysqlTable("branches", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  name: varchar("name", { length: 128 }).notNull(),
  address: text("address"),
  phone: varchar("phone", { length: 64 }),
  email: varchar("email", { length: 320 }),
  smsNumber: varchar("smsNumber", { length: 64 }),
  managerUserId: int("managerUserId"),
  managerName: varchar("managerName", { length: 255 }),
  managerEmail: varchar("managerEmail", { length: 320 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_branches_tenant").on(table.tenantId),
]);
export type Branch = typeof branches.$inferSelect;
export type InsertBranch = typeof branches.$inferInsert;


// ─── Email Image Library ────────────────────────────────────────────────────
export const emailImages = mysqlTable("email_images", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  filename: varchar("filename", { length: 255 }).notNull(),
  url: text("url").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  caption: varchar("caption", { length: 500 }).default(""),
  tags: json("tags").$type<string[]>().default([]),
  width: int("width"),
  height: int("height"),
  sizeBytes: int("sizeBytes"),
  uploadedBy: int("uploadedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_email_images_tenant").on(table.tenantId),
]);
export type EmailImage = typeof emailImages.$inferSelect;
export type InsertEmailImage = typeof emailImages.$inferInsert;


// ─── Quote Revisions (Audit Log) ────────────────────────────────────────────
export const quoteRevisions = mysqlTable("quote_revisions", {
  id: int("id").autoincrement().primaryKey(),
  quoteId: int("quoteId").notNull().references(() => quotes.id, { onDelete: "cascade" }),
  userId: int("userId").references(() => users.id),
  userName: varchar("userName", { length: 255 }),
  action: varchar("action", { length: 64 }).notNull(), // e.g. "financial_update", "status_change", "recalculate", "spec_update"
  changes: json("changes").$type<Array<{ field: string; oldValue: any; newValue: any }>>(),
  snapshot: json("snapshot").$type<Record<string, any>>(), // optional full snapshot of financials at that point
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type QuoteRevision = typeof quoteRevisions.$inferSelect;
export type InsertQuoteRevision = typeof quoteRevisions.$inferInsert;

// ─── Construction Module ────────────────────────────────────────────────────

export const tradeTypeEnum = mysqlEnum("tradeType", [
  "installer", "electrician", "plumber", "roofer", "carpenter",
  "concreter", "painter", "tiler", "fencer", "labourer", "other",
]);

export const constructionInstallers = mysqlTable("construction_installers", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 64 }),
  email: varchar("email", { length: 320 }),
  speciality: varchar("speciality", { length: 128 }), // legacy free-text field
  tradeType: tradeTypeEnum.default("installer").notNull(),
  abn: varchar("abn", { length: 32 }),
  address: text("address"),
  bankBsb: varchar("bank_bsb", { length: 16 }),
  bankAccount: varchar("bank_account", { length: 32 }),
  bankName: varchar("bank_name", { length: 128 }),
  emergencyContact: varchar("emergency_contact", { length: 255 }),
  emergencyPhone: varchar("emergency_phone", { length: 64 }),
  xeroContactId: varchar("xeroContactId", { length: 128 }),
  lastXeroSyncAt: timestamp("lastXeroSyncAt"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ConstructionInstaller = typeof constructionInstallers.$inferSelect;
export type InsertConstructionInstaller = typeof constructionInstallers.$inferInsert;

export const constructionJobs = mysqlTable("construction_jobs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  quoteId: int("quoteId").references(() => quotes.id),
  quoteNumber: varchar("quoteNumber", { length: 32 }),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  siteAddress: text("siteAddress"),
  status: mysqlEnum("status", ["scheduled", "in_progress", "on_hold", "completed", "cancelled"]).default("scheduled").notNull(),
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
  scheduledStart: timestamp("scheduledStart"),
  scheduledEnd: timestamp("scheduledEnd"),
  actualStart: timestamp("actualStart"),
  actualEnd: timestamp("actualEnd"),
  notes: text("notes"),
  leadId: int("leadId"),
  designAdviserId: int("designAdviserId").references(() => users.id),
  designAdviserName: varchar("designAdviserName", { length: 255 }),
  supervisorId: int("supervisorId").references(() => users.id),
  supervisorName: varchar("supervisorName", { length: 255 }),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ConstructionJob = typeof constructionJobs.$inferSelect;
export type InsertConstructionJob = typeof constructionJobs.$inferInsert;

export const constructionAssignments = mysqlTable("construction_assignments", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  installerId: int("installerId").notNull(),
  role: varchar("role", { length: 64 }).default("installer"), // e.g. "lead", "installer", "electrician"
  confirmedAt: timestamp("confirmedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  foreignKey({
    name: "fk_con_assign_installer",
    columns: [table.installerId],
    foreignColumns: [constructionInstallers.id],
  }),
]);
export type ConstructionAssignment = typeof constructionAssignments.$inferSelect;
export type InsertConstructionAssignment = typeof constructionAssignments.$inferInsert;

export const constructionProgress = mysqlTable("construction_progress", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  stage: varchar("stage", { length: 128 }).notNull(), // e.g. "Site Prep", "Footings", "Frame", "Roof", "Electrical", "Final Inspection"
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "skipped"]).default("pending").notNull(),
  completedAt: timestamp("completedAt"),
  notes: text("notes"),
  updatedBy: int("updatedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_construction_progress_tenant").on(table.tenantId),
  index("idx_construction_progress_job").on(table.jobId),
]);
export type ConstructionProgress = typeof constructionProgress.$inferSelect;
export type InsertConstructionProgress = typeof constructionProgress.$inferInsert;

// ─── Permission Audit Log ───────────────────────────────────────────────────

export const permissionAuditLog = mysqlTable("permission_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  adminUserId: int("adminUserId").notNull().references(() => users.id),
  adminUserName: varchar("adminUserName", { length: 255 }),
  targetUserId: int("targetUserId").notNull().references(() => users.id),
  targetUserName: varchar("targetUserName", { length: 255 }),
  action: varchar("action", { length: 64 }).notNull(), // e.g. "permission_change", "role_change"
  field: varchar("field", { length: 128 }).notNull(), // e.g. "canViewAllQuotes", "role"
  oldValue: varchar("oldValue", { length: 255 }),
  newValue: varchar("newValue", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PermissionAuditLog = typeof permissionAuditLog.$inferSelect;
export type InsertPermissionAuditLog = typeof permissionAuditLog.$inferInsert;


// ─── Construction Check Measure Workbooks ───────────────────────────────────
export const checkMeasureWorkbooks = mysqlTable("check_measure_workbooks", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  originalQuoteId: int("originalQuoteId").references(() => quotes.id),
  originalQuoteNumber: varchar("originalQuoteNumber", { length: 32 }),
  title: varchar("title", { length: 255 }).default("Construction Check Measure").notNull(),
  // Duplicated spec fields stored as JSON snapshot
  specData: json("specData"), // Full snapshot of all spec fields from the original quote
  // Duplicated components stored as JSON snapshot
  components: json("components"), // Array of { tabName, included, lineItems }
  // Deck quote snapshot (JSON: dimensions, selections, pricing, design)
  deckSpecData: json("deckSpecData"),
  // Eclipse quote snapshot (JSON: units, additional costs, pricing, site layout)
  eclipseSpecData: json("eclipseSpecData"),
  // Check measure specific fields
  checkedBy: int("checkedBy").references(() => users.id),
  checkedByName: varchar("checkedByName", { length: 255 }),
  checkedAt: timestamp("checkedAt"),
  status: mysqlEnum("status", ["pending_review", "in_review", "reviewed", "approved", "variance_found"]).default("pending_review").notNull(),
  varianceNotes: text("varianceNotes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CheckMeasureWorkbook = typeof checkMeasureWorkbooks.$inferSelect;
export type InsertCheckMeasureWorkbook = typeof checkMeasureWorkbooks.$inferInsert;

// ─── SMS Delivery Log ───────────────────────────────────────────────────────
export const smsDeliveryLog = mysqlTable("sms_delivery_log", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").references(() => constructionJobs.id, { onDelete: "set null" }),
  installerId: int("installerId").references(() => constructionInstallers.id, { onDelete: "set null" }),
  recipient: varchar("recipient", { length: 32 }).notNull(),
  sender: varchar("sender", { length: 32 }),
  body: text("body").notNull(),
  status: mysqlEnum("status", ["sent", "failed", "pending"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  sentAt: timestamp("sentAt").defaultNow().notNull(),
});
export type SmsDeliveryLog = typeof smsDeliveryLog.$inferSelect;
export type InsertSmsDeliveryLog = typeof smsDeliveryLog.$inferInsert;


// ─── Construction Schedule Events ──────────────────────────────────────────
export const constructionScheduleEvents = mysqlTable("construction_schedule_events", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  startTime: timestamp("startTime").notNull(),
  endTime: timestamp("endTime"),
  allDay: boolean("allDay").default(false).notNull(),
  eventType: mysqlEnum("eventType", ["installation", "inspection", "meeting", "delivery", "other"]).default("installation").notNull(),
  assignedInstallerId: int("assignedInstallerId"),
  notifyClient: boolean("notifyClient").default(false).notNull(),
  notifyInstaller: boolean("notifyInstaller").default(false).notNull(),
  clientNotifiedAt: timestamp("clientNotifiedAt"),
  installerNotifiedAt: timestamp("installerNotifiedAt"),
  status: mysqlEnum("eventStatus", ["scheduled", "confirmed", "completed", "cancelled"]).default("scheduled").notNull(),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_construction_schedule_events_tenant").on(table.tenantId),
  index("idx_construction_schedule_events_tenant_start").on(table.tenantId, table.startTime),
  foreignKey({
    name: "fk_sched_event_installer",
    columns: [table.assignedInstallerId],
    foreignColumns: [constructionInstallers.id],
  }).onDelete("set null"),
]);
export type ConstructionScheduleEvent = typeof constructionScheduleEvents.$inferSelect;
export type InsertConstructionScheduleEvent = typeof constructionScheduleEvents.$inferInsert;

// ─── Construction Kanban Tasks ─────────────────────────────────────────────
export const constructionKanbanTasks = mysqlTable("construction_kanban_tasks", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  column: mysqlEnum("column", ["backlog", "todo", "in_progress", "review", "done"]).default("backlog").notNull(),
  position: int("position").default(0).notNull(),
  assignedTo: int("assignedTo"),
  dueDate: timestamp("dueDate"),
  templateKey: varchar("templateKey", { length: 64 }),
  priority: mysqlEnum("taskPriority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_construction_kanban_tasks_tenant").on(table.tenantId),
  index("idx_construction_kanban_tasks_tenant_due").on(table.tenantId, table.dueDate),
  foreignKey({
    name: "fk_kanban_task_installer",
    columns: [table.assignedTo],
    foreignColumns: [constructionInstallers.id],
  }).onDelete("set null"),
]);
export type ConstructionKanbanTask = typeof constructionKanbanTasks.$inferSelect;
export type InsertConstructionKanbanTask = typeof constructionKanbanTasks.$inferInsert;

export const taskTags = mysqlTable("task_tags", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  name: varchar("name", { length: 80 }).notNull(),
  colour: varchar("colour", { length: 20 }).default("#64748b").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_task_tags_tenant").on(table.tenantId),
  uniqueIndex("uq_task_tags_tenant_name").on(table.tenantId, table.name),
]);
export type TaskTag = typeof taskTags.$inferSelect;
export type InsertTaskTag = typeof taskTags.$inferInsert;

export const taskTagAssignments = mysqlTable("task_tag_assignments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  tagId: int("tagId").notNull().references(() => taskTags.id, { onDelete: "cascade" }),
  module: mysqlEnum("module", ["approvals", "construction", "manufacturing"]).notNull(),
  taskId: int("taskId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_task_tag_assignments_tenant").on(table.tenantId),
  index("idx_task_tag_assignments_task").on(table.module, table.taskId),
  uniqueIndex("uq_task_tag_assignment").on(table.tenantId, table.tagId, table.module, table.taskId),
]);
export type TaskTagAssignment = typeof taskTagAssignments.$inferSelect;
export type InsertTaskTagAssignment = typeof taskTagAssignments.$inferInsert;

export const taskComments = mysqlTable("task_comments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  module: mysqlEnum("module", ["approvals", "construction", "manufacturing"]).notNull(),
  taskId: int("taskId").notNull(),
  body: text("body").notNull(),
  createdByUserId: int("createdByUserId").references(() => users.id),
  createdByName: varchar("createdByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_task_comments_tenant").on(table.tenantId),
  index("idx_task_comments_task").on(table.module, table.taskId),
]);
export type TaskComment = typeof taskComments.$inferSelect;
export type InsertTaskComment = typeof taskComments.$inferInsert;

export const taskTemplates = mysqlTable("task_templates", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  module: mysqlEnum("module", ["approvals", "construction", "manufacturing"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  priority: varchar("priority", { length: 32 }).default("normal").notNull(),
  assignedToUserId: int("assignedToUserId").references(() => users.id),
  assignedToName: varchar("assignedToName", { length: 255 }),
  constructionInstallerId: int("constructionInstallerId"),
  approvalProjectId: int("approvalProjectId"),
  constructionJobId: int("constructionJobId"),
  manufacturingOrderId: int("manufacturingOrderId"),
  dueOffsetDays: int("dueOffsetDays").default(0).notNull(),
  recurrence: mysqlEnum("recurrence", ["daily", "weekly", "monthly"]).default("daily").notNull(),
  active: boolean("active").default(true).notNull(),
  lastCreatedAt: timestamp("lastCreatedAt"),
  createdByUserId: int("createdByUserId").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_task_templates_tenant").on(table.tenantId),
  index("idx_task_templates_active").on(table.active),
  foreignKey({
    name: "fk_task_templates_installer",
    columns: [table.constructionInstallerId],
    foreignColumns: [constructionInstallers.id],
  }).onDelete("set null"),
]);
export type TaskTemplate = typeof taskTemplates.$inferSelect;
export type InsertTaskTemplate = typeof taskTemplates.$inferInsert;

// ─── Construction Kanban Templates ─────────────────────────────────────────
export const constructionKanbanTemplates = mysqlTable("construction_kanban_templates", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  defaultColumn: mysqlEnum("defaultColumn", ["backlog", "todo", "in_progress", "review", "done"]).default("todo").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  category: varchar("category", { length: 64 }).default("general"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_construction_kanban_templates_tenant").on(table.tenantId),
  index("idx_construction_kanban_templates_tenant_active").on(table.tenantId, table.active),
]);
export type ConstructionKanbanTemplate = typeof constructionKanbanTemplates.$inferSelect;
export type InsertConstructionKanbanTemplate = typeof constructionKanbanTemplates.$inferInsert;

// ─── Construction Job Financials ───────────────────────────────────────────
export const constructionJobFinancials = mysqlTable("construction_job_financials", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  contractValue: decimal("contractValue", { precision: 12, scale: 2 }).default("0"),
  materialsCost: decimal("materialsCost", { precision: 12, scale: 2 }).default("0"),
  labourCost: decimal("labourCost", { precision: 12, scale: 2 }).default("0"),
  otherCost: decimal("otherCost", { precision: 12, scale: 2 }).default("0"),
  totalCost: decimal("totalCost", { precision: 12, scale: 2 }).default("0"),
  margin: decimal("margin", { precision: 12, scale: 2 }).default("0"),
  marginPercent: decimal("marginPercent", { precision: 5, scale: 2 }).default("0"),
  invoicedAmount: decimal("invoicedAmount", { precision: 12, scale: 2 }).default("0"),
  paidAmount: decimal("paidAmount", { precision: 12, scale: 2 }).default("0"),
  // ─── Xero Actuals (synced from Xero, never manually edited) ───
  xeroLabourCost: decimal("xeroLabourCost", { precision: 12, scale: 2 }).default("0"),
  xeroMaterialsCost: decimal("xeroMaterialsCost", { precision: 12, scale: 2 }).default("0"),
  xeroOtherCost: decimal("xeroOtherCost", { precision: 12, scale: 2 }).default("0"),
  xeroTotalCost: decimal("xeroTotalCost", { precision: 12, scale: 2 }).default("0"),
  xeroInvoicedAmount: decimal("xeroInvoicedAmount", { precision: 12, scale: 2 }).default("0"),
  xeroPaidAmount: decimal("xeroPaidAmount", { precision: 12, scale: 2 }).default("0"),
  xeroContractValue: decimal("xeroContractValue", { precision: 12, scale: 2 }).default("0"),
  branch: varchar("branch", { length: 128 }),
  constructionManagerId: int("constructionManagerId").references(() => users.id),
  constructionManagerName: varchar("constructionManagerName", { length: 255 }),
  technicalDesignerId: int("technicalDesignerId").references(() => users.id),
  technicalDesignerName: varchar("technicalDesignerName", { length: 255 }),
  roofStyle: varchar("roofStyle", { length: 64 }),
  postcode: varchar("postcode", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ConstructionJobFinancial = typeof constructionJobFinancials.$inferSelect;
export type InsertConstructionJobFinancial = typeof constructionJobFinancials.$inferInsert;


// ─── Xero Integration ──────────────────────────────────────────────────────
export const xeroConnections = mysqlTable("xero_connections", {
  id: int("id").autoincrement().primaryKey(),
  appTenantId: int("appTenantId").references(() => tenants.id),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: varchar("tenantId", { length: 128 }).notNull(),
  tenantName: varchar("tenantName", { length: 255 }),
  tenantType: varchar("tenantType", { length: 64 }),
  connectionId: varchar("connectionId", { length: 128 }),
  accessToken: text("accessToken").notNull(),
  refreshToken: text("refreshToken").notNull(),
  tokenExpiresAt: timestamp("tokenExpiresAt").notNull(),
  scopes: text("scopes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type XeroConnection = typeof xeroConnections.$inferSelect;
export type InsertXeroConnection = typeof xeroConnections.$inferInsert;

export const xeroEntityDefaults = mysqlTable("xero_entity_defaults", {
  id: int("id").autoincrement().primaryKey(),
  appTenantId: int("appTenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  moduleKey: mysqlEnum("moduleKey", ["global", "crm", "construction", "manufacturing", "approvals", "trade_portal", "portal", "scheduled_sync"]).notNull(),
  xeroConnectionId: int("xeroConnectionId").references(() => xeroConnections.id, { onDelete: "set null" }),
  updatedBy: int("updatedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  uniqueIndex("uq_xero_entity_default_scope").on(t.appTenantId, t.moduleKey),
  index("idx_xero_entity_defaults_tenant").on(t.appTenantId),
  index("idx_xero_entity_defaults_connection").on(t.xeroConnectionId),
]);
export type XeroEntityDefault = typeof xeroEntityDefaults.$inferSelect;
export type InsertXeroEntityDefault = typeof xeroEntityDefaults.$inferInsert;

export const xeroRoutingRules = mysqlTable("xero_routing_rules", {
  id: int("id").autoincrement().primaryKey(),
  appTenantId: int("appTenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  moduleKey: mysqlEnum("moduleKey", ["global", "crm", "construction", "manufacturing", "approvals", "trade_portal", "portal", "scheduled_sync"]).notNull(),
  targetXeroConnectionId: int("targetXeroConnectionId").notNull().references(() => xeroConnections.id, { onDelete: "cascade" }),
  priority: int("priority").default(100).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  conditions: json("conditions").$type<Array<{ field: string; operator: string; value: string }>>(),
  notes: text("notes"),
  createdBy: int("createdBy").references(() => users.id),
  updatedBy: int("updatedBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_xero_routing_rules_tenant").on(t.appTenantId),
  index("idx_xero_routing_rules_module").on(t.appTenantId, t.moduleKey),
  index("idx_xero_routing_rules_target").on(t.targetXeroConnectionId),
]);
export type XeroRoutingRule = typeof xeroRoutingRules.$inferSelect;
export type InsertXeroRoutingRule = typeof xeroRoutingRules.$inferInsert;

export const xeroContactMappings = mysqlTable("xero_contact_mappings", {
  id: int("id").autoincrement().primaryKey(),
  xeroConnectionId: int("xeroConnectionId").notNull().references(() => xeroConnections.id, { onDelete: "cascade" }),
  localType: mysqlEnum("localType", ["lead", "client"]).notNull(),
  localId: int("localId").notNull(),
  xeroContactId: varchar("xeroContactId", { length: 128 }).notNull(),
  xeroContactName: varchar("xeroContactName", { length: 255 }),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type XeroContactMapping = typeof xeroContactMappings.$inferSelect;
export type InsertXeroContactMapping = typeof xeroContactMappings.$inferInsert;

export const xeroInvoiceMappings = mysqlTable("xero_invoice_mappings", {
  id: int("id").autoincrement().primaryKey(),
  xeroConnectionId: int("xeroConnectionId").notNull().references(() => xeroConnections.id, { onDelete: "cascade" }),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  xeroInvoiceId: varchar("xeroInvoiceId", { length: 128 }).notNull(),
  xeroInvoiceNumber: varchar("xeroInvoiceNumber", { length: 64 }),
  invoiceType: mysqlEnum("invoiceType", ["progress_claim", "final_invoice", "purchase_order"]).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }),
  status: varchar("status", { length: 64 }),
  description: text("description"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type XeroInvoiceMapping = typeof xeroInvoiceMappings.$inferSelect;
export type InsertXeroInvoiceMapping = typeof xeroInvoiceMappings.$inferInsert;

// ─── Xero Project Sync ─────────────────────────────────────────────────────
export const xeroProjectMappings = mysqlTable("xero_project_mappings", {
  id: int("id").autoincrement().primaryKey(),
  xeroConnectionId: int("xeroConnectionId").notNull().references(() => xeroConnections.id, { onDelete: "cascade" }),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  xeroProjectId: varchar("xeroProjectId", { length: 128 }).notNull(),
  xeroProjectName: varchar("xeroProjectName", { length: 255 }),
  xeroProjectStatus: varchar("xeroProjectStatus", { length: 64 }),
  xeroContactId: varchar("xeroContactId", { length: 128 }),
  totalInvoiced: decimal("totalInvoiced", { precision: 12, scale: 2 }),
  totalCosts: decimal("totalCosts", { precision: 12, scale: 2 }),
  expenseEntries: decimal("expenseEntries", { precision: 12, scale: 2 }),
  totalProfit: decimal("totalProfit", { precision: 12, scale: 2 }),
  estimatedCost: decimal("estimatedCost", { precision: 12, scale: 2 }),
  lastSyncedAt: timestamp("lastSyncedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type XeroProjectMapping = typeof xeroProjectMappings.$inferSelect;
export type InsertXeroProjectMapping = typeof xeroProjectMappings.$inferInsert;

export const xeroProjectCosts = mysqlTable("xero_project_costs", {
  id: int("id").autoincrement().primaryKey(),
  mappingId: int("mappingId").notNull().references(() => xeroProjectMappings.id, { onDelete: "cascade" }),
  xeroInvoiceId: varchar("xeroInvoiceId", { length: 128 }).notNull(),
  invoiceNumber: varchar("invoiceNumber", { length: 64 }),
  supplierName: varchar("supplierName", { length: 255 }),
  description: text("description"),
  lineAmount: decimal("lineAmount", { precision: 12, scale: 2 }).notNull(),
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }),
  amountPaid: decimal("amountPaid", { precision: 12, scale: 2 }),
  amountDue: decimal("amountDue", { precision: 12, scale: 2 }),
  status: varchar("status", { length: 32 }),
  invoiceDate: varchar("invoiceDate", { length: 32 }),
  reference: varchar("reference", { length: 128 }),
  costType: mysqlEnum("costType", ["bill", "spend", "time"]).default("bill").notNull(),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
});
export type XeroProjectCost = typeof xeroProjectCosts.$inferSelect;
export type InsertXeroProjectCost = typeof xeroProjectCosts.$inferInsert;

export const xeroAccountingTransactions = mysqlTable("xero_accounting_transactions", {
  id: int("id").autoincrement().primaryKey(),
  appTenantId: int("appTenantId").references(() => tenants.id),
  xeroConnectionId: int("xeroConnectionId").notNull(),
  mappingId: int("mappingId"),
  jobId: int("jobId").references(() => constructionJobs.id, { onDelete: "set null" }),
  sourceKey: varchar("sourceKey", { length: 255 }).notNull(),
  sourceType: mysqlEnum("xeroAccountingSourceType", ["invoice", "bill", "bank_transaction", "payment", "credit_note", "manual_journal"]).notNull(),
  xeroTransactionId: varchar("xeroTransactionId", { length: 128 }).notNull(),
  xeroLineItemId: varchar("xeroLineItemId", { length: 128 }),
  transactionNumber: varchar("transactionNumber", { length: 128 }),
  contactId: varchar("contactId", { length: 128 }),
  contactName: varchar("contactName", { length: 255 }),
  transactionDate: varchar("transactionDate", { length: 32 }),
  dueDate: varchar("dueDate", { length: 32 }),
  status: varchar("status", { length: 64 }),
  reference: varchar("reference", { length: 512 }),
  description: text("description"),
  accountCode: varchar("accountCode", { length: 64 }),
  trackingCategoryName: varchar("trackingCategoryName", { length: 128 }),
  trackingOptionName: varchar("trackingOptionName", { length: 255 }),
  matchMethod: mysqlEnum("xeroProjectMatchMethod", ["tracking", "reference", "description", "contact", "manual", "unmatched"]).default("unmatched").notNull(),
  costCategory: mysqlEnum("xeroCostCategory", ["materials", "labour", "other", "revenue"]).default("other").notNull(),
  lineAmount: decimal("lineAmount", { precision: 12, scale: 4 }).default("0").notNull(),
  taxAmount: decimal("taxAmount", { precision: 12, scale: 4 }).default("0").notNull(),
  grossAmount: decimal("grossAmount", { precision: 12, scale: 4 }).default("0").notNull(),
  amountPaid: decimal("amountPaid", { precision: 12, scale: 4 }).default("0"),
  amountDue: decimal("amountDue", { precision: 12, scale: 4 }).default("0"),
  currencyCode: varchar("currencyCode", { length: 8 }),
  isCost: boolean("isCost").default(false).notNull(),
  isRevenue: boolean("isRevenue").default(false).notNull(),
  raw: json("raw"),
  ignoredAt: timestamp("ignoredAt"),
  ignoredByUserId: int("ignoredByUserId"),
  ignoreReason: varchar("ignoreReason", { length: 255 }),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  uniqueIndex("uq_xero_accounting_transactions_source").on(t.sourceKey),
  index("idx_xero_accounting_transactions_connection").on(t.xeroConnectionId),
  index("idx_xero_accounting_transactions_mapping").on(t.mappingId),
  index("idx_xero_accounting_transactions_job").on(t.jobId),
  index("idx_xero_accounting_transactions_tenant").on(t.appTenantId),
  index("idx_xero_accounting_transactions_ignored").on(t.ignoredAt),
  foreignKey({
    name: "fk_xero_tx_connection",
    columns: [t.xeroConnectionId],
    foreignColumns: [xeroConnections.id],
  }).onDelete("cascade"),
  foreignKey({
    name: "fk_xero_tx_mapping",
    columns: [t.mappingId],
    foreignColumns: [xeroProjectMappings.id],
  }).onDelete("set null"),
]);
export type XeroAccountingTransaction = typeof xeroAccountingTransactions.$inferSelect;
export type InsertXeroAccountingTransaction = typeof xeroAccountingTransactions.$inferInsert;

export const xeroSyncLogs = mysqlTable("xero_sync_logs", {
  id: int("id").autoincrement().primaryKey(),
  xeroConnectionId: int("xeroConnectionId").notNull().references(() => xeroConnections.id, { onDelete: "cascade" }),
  syncType: mysqlEnum("syncType", ["contacts", "projects_import", "projects_push", "financials", "full_batch"]).notNull(),
  status: mysqlEnum("status", ["running", "completed", "failed"]).default("running").notNull(),
  itemsProcessed: int("itemsProcessed").default(0),
  itemsFailed: int("itemsFailed").default(0),
  errorMessage: text("errorMessage"),
  syncCursor: int("syncCursor").default(0),
  totalItems: int("totalItems").default(0),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});
export type XeroSyncLog = typeof xeroSyncLogs.$inferSelect;
export type InsertXeroSyncLog = typeof xeroSyncLogs.$inferInsert;

export const xeroWebhookEvents = mysqlTable("xero_webhook_events", {
  id: int("id").autoincrement().primaryKey(),
  appTenantId: int("appTenantId").references(() => tenants.id),
  xeroConnectionId: int("xeroConnectionId").references(() => xeroConnections.id, { onDelete: "set null" }),
  syncLogId: int("syncLogId").references(() => xeroSyncLogs.id, { onDelete: "set null" }),
  xeroTenantId: varchar("xeroTenantId", { length: 128 }),
  tenantType: varchar("tenantType", { length: 64 }),
  eventId: varchar("eventId", { length: 255 }).notNull(),
  eventCategory: varchar("eventCategory", { length: 64 }),
  eventType: varchar("eventType", { length: 64 }),
  resourceId: varchar("resourceId", { length: 128 }),
  resourceUrl: varchar("resourceUrl", { length: 1024 }),
  eventDateUtc: timestamp("eventDateUtc"),
  firstEventSequence: int("firstEventSequence"),
  lastEventSequence: int("lastEventSequence"),
  status: mysqlEnum("xeroWebhookEventStatus", ["received", "queued", "processing", "processed", "skipped", "failed"]).default("received").notNull(),
  errorMessage: text("errorMessage"),
  payload: json("payload"),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
  processedAt: timestamp("processedAt"),
}, (t) => [
  uniqueIndex("uq_xero_webhook_events_event_id").on(t.eventId),
  index("idx_xero_webhook_events_connection").on(t.xeroConnectionId),
  index("idx_xero_webhook_events_tenant").on(t.appTenantId),
  index("idx_xero_webhook_events_status").on(t.status),
]);
export type XeroWebhookEvent = typeof xeroWebhookEvents.$inferSelect;
export type InsertXeroWebhookEvent = typeof xeroWebhookEvents.$inferInsert;

// ─── Xero Sync Failure Details ──────────────────────────────────────────────
export const xeroSyncFailures = mysqlTable("xero_sync_failures", {
  id: int("id").autoincrement().primaryKey(),
  syncLogId: int("syncLogId").notNull().references(() => xeroSyncLogs.id, { onDelete: "cascade" }),
  phase: varchar("phase", { length: 50 }).notNull(),
  recordId: varchar("recordId", { length: 255 }),
  recordLabel: varchar("recordLabel", { length: 500 }),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type XeroSyncFailure = typeof xeroSyncFailures.$inferSelect;


// ─── Client Portal ──────────────────────────────────────────────────────────

// Portal access tokens - each construction job can have a portal link
export const portalAccess = mysqlTable("portal_access", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  constructionJobId: int("constructionJobId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  clientEmail: varchar("clientEmail", { length: 320 }).notNull(),
  clientName: varchar("clientName", { length: 255 }),
  clientPhone: varchar("clientPhone", { length: 64 }),
  isActive: boolean("isActive").default(true).notNull(),
  emailNotifications: boolean("emailNotifications").default(true).notNull(),
  lastAccessedAt: timestamp("lastAccessedAt"),
  lastViewedDocumentsAt: timestamp("lastViewedDocumentsAt"),
  lastViewedInvoicesAt: timestamp("lastViewedInvoicesAt"),
  lastViewedUpdatesAt: timestamp("lastViewedUpdatesAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PortalAccess = typeof portalAccess.$inferSelect;
export type InsertPortalAccess = typeof portalAccess.$inferInsert;

// Portal magic link sessions
export const portalSessions = mysqlTable("portal_sessions", {
  id: int("id").autoincrement().primaryKey(),
  portalAccessId: int("portalAccessId").notNull().references(() => portalAccess.id, { onDelete: "cascade" }),
  sessionToken: varchar("sessionToken", { length: 128 }).notNull().unique(),
  magicLinkToken: varchar("magicLinkToken", { length: 128 }).unique(),
  magicLinkExpiresAt: timestamp("magicLinkExpiresAt"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PortalSession = typeof portalSessions.$inferSelect;

// Portal contacts directory - team members visible to client
export const portalContacts = mysqlTable("portal_contacts", {
  id: int("id").autoincrement().primaryKey(),
  constructionJobId: int("constructionJobId").notNull(),
  staffId: int("staffId"),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 128 }).notNull(),
  phone: varchar("phone", { length: 64 }),
  email: varchar("email", { length: 320 }),
  profileDescription: text("profileDescription"),
  photoUrl: varchar("photoUrl", { length: 512 }),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PortalContact = typeof portalContacts.$inferSelect;
export type InsertPortalContact = typeof portalContacts.$inferInsert;

// Portal documents - files shared with client
export const portalDocuments = mysqlTable("portal_documents", {
  id: int("id").autoincrement().primaryKey(),
  constructionJobId: int("constructionJobId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  category: mysqlEnum("category", ["contract", "plans", "variation", "invoice", "photos", "other"]).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }),
  mimeType: varchar("mimeType", { length: 128 }),
  uploadedBy: int("uploadedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PortalDocument = typeof portalDocuments.$inferSelect;
export type InsertPortalDocument = typeof portalDocuments.$inferInsert;

// Portal Photo Comments (client reactions/comments on shared photos)
export const portalPhotoComments = mysqlTable("portal_photo_comments", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull().references(() => portalDocuments.id, { onDelete: "cascade" }),
  authorName: varchar("authorName", { length: 255 }).notNull(),
  authorType: mysqlEnum("authorType", ["client", "admin"]).notNull().default("client"),
  comment: text("comment").notNull(),
  reaction: mysqlEnum("reaction", ["love", "thumbsup", "question"]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PortalPhotoComment = typeof portalPhotoComments.$inferSelect;
export type InsertPortalPhotoComment = typeof portalPhotoComments.$inferInsert;

// Portal variations
export const portalVariations = mysqlTable("portal_variations", {
  id: int("id").autoincrement().primaryKey(),
  constructionJobId: int("constructionJobId").notNull(),
  contractNumber: varchar("contractNumber", { length: 64 }),
  ownerName: varchar("ownerName", { length: 255 }),
  ownerAddress: text("ownerAddress"),
  builderCompanyName: varchar("builderCompanyName", { length: 255 }),
  builderAddress: text("builderAddress"),
  builderAbn: varchar("builderAbn", { length: 32 }),
  builderLicence: varchar("builderLicence", { length: 128 }),
  builderPhone: varchar("builderPhone", { length: 32 }),
  builderAccountsEmail: varchar("builderAccountsEmail", { length: 320 }),
  builderEmail: varchar("builderEmail", { length: 320 }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  variationDetails: text("variationDetails"),
  costImpact: decimal("costImpact", { precision: 12, scale: 2 }).default("0"),
  lineItems: json("lineItems").$type<Array<{ description: string; cost: number }>>(),
  pdfUrl: text("pdfUrl"),
  signedPdfUrl: text("signedPdfUrl"),
  signwellDocumentId: varchar("signwellDocumentId", { length: 255 }),
  signwellStatus: varchar("signwellStatus", { length: 32 }).default("none"),
  signwellSentAt: timestamp("signwellSentAt"),
  signwellCompletedAt: timestamp("signwellCompletedAt"),
  sentTo: varchar("sentTo", { length: 320 }),
  status: mysqlEnum("status", ["pending", "approved", "rejected", "completed"]).default("pending").notNull(),
  clientApprovedAt: timestamp("clientApprovedAt"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PortalVariation = typeof portalVariations.$inferSelect;
export type InsertPortalVariation = typeof portalVariations.$inferInsert;

// Portal defects / snag list
export const portalDefects = mysqlTable("portal_defects", {
  id: int("id").autoincrement().primaryKey(),
  constructionJobId: int("constructionJobId").notNull(),
  portalAccessId: int("portalAccessId"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  photoUrls: json("photoUrls").$type<string[]>(),
  status: mysqlEnum("status", ["reported", "acknowledged", "scheduled", "resolved"]).default("reported").notNull(),
  resolutionNotes: text("resolutionNotes"),
  resolutionPhotoUrls: json("resolutionPhotoUrls").$type<string[]>(),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PortalDefect = typeof portalDefects.$inferSelect;
export type InsertPortalDefect = typeof portalDefects.$inferInsert;

// Portal maintenance requests
export const portalMaintenanceRequests = mysqlTable("portal_maintenance_requests", {
  id: int("id").autoincrement().primaryKey(),
  constructionJobId: int("constructionJobId").notNull(),
  portalAccessId: int("portalAccessId"),
  description: text("description").notNull(),
  photoUrls: json("photoUrls").$type<string[]>(),
  urgency: mysqlEnum("urgency", ["low", "medium", "high"]).default("medium").notNull(),
  status: mysqlEnum("status", ["submitted", "reviewed", "scheduled", "completed"]).default("submitted").notNull(),
  responseNotes: text("responseNotes"),
  scheduledDate: timestamp("scheduledDate"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PortalMaintenanceRequest = typeof portalMaintenanceRequests.$inferSelect;
export type InsertPortalMaintenanceRequest = typeof portalMaintenanceRequests.$inferInsert;

// CPC Subscription plans
export const cpcPlans = mysqlTable("cpc_plans", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  frequency: mysqlEnum("frequency", ["annual", "seasonal", "premium"]).notNull(),
  priceSmall: decimal("priceSmall", { precision: 8, scale: 2 }).notNull(), // up to 30m²
  priceMedium: decimal("priceMedium", { precision: 8, scale: 2 }).notNull(), // 30-60m²
  priceLarge: decimal("priceLarge", { precision: 8, scale: 2 }).notNull(), // 60m²+
  features: json("features").$type<string[]>(),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_cpc_plans_tenant").on(table.tenantId),
  tenantActiveIdx: index("idx_cpc_plans_tenant_active").on(table.tenantId, table.isActive),
}));
export type CpcPlan = typeof cpcPlans.$inferSelect;
export type InsertCpcPlan = typeof cpcPlans.$inferInsert;

// CPC Subscriptions
export const cpcSubscriptions = mysqlTable("cpc_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  portalAccessId: int("portalAccessId").notNull().references(() => portalAccess.id, { onDelete: "cascade" }),
  constructionJobId: int("constructionJobId").notNull(),
  planId: int("planId").notNull().references(() => cpcPlans.id),
  structureSize: mysqlEnum("structureSize", ["small", "medium", "large"]).notNull(),
  structureAreaM2: decimal("structureAreaM2", { precision: 8, scale: 2 }),
  status: mysqlEnum("status", ["active", "paused", "cancelled", "expired"]).default("active").notNull(),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  nextServiceDate: timestamp("nextServiceDate"),
  startDate: timestamp("startDate").defaultNow().notNull(),
  cancelledAt: timestamp("cancelledAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_cpc_subscriptions_tenant").on(table.tenantId),
  tenantPortalIdx: index("idx_cpc_subscriptions_tenant_portal").on(table.tenantId, table.portalAccessId),
  tenantJobIdx: index("idx_cpc_subscriptions_tenant_job").on(table.tenantId, table.constructionJobId),
}));
export type CpcSubscription = typeof cpcSubscriptions.$inferSelect;
export type InsertCpcSubscription = typeof cpcSubscriptions.$inferInsert;

// CPC Service history
export const cpcServiceHistory = mysqlTable("cpc_service_history", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  subscriptionId: int("subscriptionId").notNull().references(() => cpcSubscriptions.id, { onDelete: "cascade" }),
  serviceDate: timestamp("serviceDate").notNull(),
  technicianName: varchar("technicianName", { length: 255 }),
  notes: text("notes"),
  beforePhotoUrls: json("beforePhotoUrls").$type<string[]>(),
  afterPhotoUrls: json("afterPhotoUrls").$type<string[]>(),
  reportUrl: text("reportUrl"),
  status: mysqlEnum("status", ["scheduled", "completed", "cancelled"]).default("scheduled").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_cpc_service_history_tenant").on(table.tenantId),
  tenantSubscriptionIdx: index("idx_cpc_service_history_tenant_subscription").on(table.tenantId, table.subscriptionId),
}));
export type CpcServiceHistory = typeof cpcServiceHistory.$inferSelect;
export type InsertCpcServiceHistory = typeof cpcServiceHistory.$inferInsert;

// News articles for client portal
export const portalNews = mysqlTable("portal_news", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  coverImageUrl: text("coverImageUrl"),
  category: varchar("category", { length: 128 }),
  isPublished: boolean("isPublished").default(false).notNull(),
  publishedAt: timestamp("publishedAt"),
  authorId: int("authorId"),
  portalType: mysqlEnum("portalType", ["client", "trade", "da", "both", "all"]).default("both").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_portal_news_tenant").on(table.tenantId),
  index("idx_portal_news_tenant_type").on(table.tenantId, table.portalType),
]);
export type PortalNewsArticle = typeof portalNews.$inferSelect;
export type InsertPortalNewsArticle = typeof portalNews.$inferInsert;

// Product offerings for cross-selling
export const portalProducts = mysqlTable("portal_products", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  imageUrl: text("imageUrl"),
  category: varchar("category", { length: 128 }),
  priceFrom: decimal("priceFrom", { precision: 10, scale: 2 }),
  ctaLabel: varchar("ctaLabel", { length: 128 }).default("Enquire Now"),
  ctaUrl: text("ctaUrl"),
  isActive: boolean("isActive").default(true).notNull(),
  isFeatured: boolean("isFeatured").default(false).notNull(),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_portal_products_tenant").on(table.tenantId),
  index("idx_portal_products_tenant_active").on(table.tenantId, table.isActive),
]);
export type PortalProduct = typeof portalProducts.$inferSelect;
export type InsertPortalProduct = typeof portalProducts.$inferInsert;

// ─── Project Plan Templates ────────────────────────────────────────────────
// A template defines a reusable project plan with ordered stages.
// When a job is created, the admin can "Seed from template" to auto-create
// constructionProgress rows and kanban tasks from the template.

export const projectPlanTemplates = mysqlTable("project_plan_templates", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isDefault: boolean("isDefault").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_project_plan_templates_tenant").on(table.tenantId),
]);
export type ProjectPlanTemplate = typeof projectPlanTemplates.$inferSelect;
export type InsertProjectPlanTemplate = typeof projectPlanTemplates.$inferInsert;

// Each template has ordered stages (e.g. "Site Prep", "Footings", "Frame", etc.)
export const projectPlanTemplateStages = mysqlTable("project_plan_template_stages", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  templateId: int("templateId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  sortOrder: int("sortOrder").default(0).notNull(),
  estimatedDays: int("estimatedDays"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  foreignKey({
    name: "fk_plan_stage_template",
    columns: [table.templateId],
    foreignColumns: [projectPlanTemplates.id],
  }).onDelete("cascade"),
  index("idx_project_plan_template_stages_tenant").on(table.tenantId),
  index("idx_project_plan_template_stages_tenant_template").on(table.tenantId, table.templateId),
]);
export type ProjectPlanTemplateStage = typeof projectPlanTemplateStages.$inferSelect;
export type InsertProjectPlanTemplateStage = typeof projectPlanTemplateStages.$inferInsert;

// Each stage can have default tasks that get created as kanban tasks when seeded
export const projectPlanTemplateTasks = mysqlTable("project_plan_template_tasks", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  stageId: int("stageId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  sortOrder: int("sortOrder").default(0).notNull(),
  defaultColumn: mysqlEnum("defaultColumn", ["backlog", "todo", "in_progress", "review", "done"]).default("todo").notNull(),
  priority: mysqlEnum("taskPriority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  foreignKey({
    name: "fk_plan_task_stage",
    columns: [table.stageId],
    foreignColumns: [projectPlanTemplateStages.id],
  }).onDelete("cascade"),
  index("idx_project_plan_template_tasks_tenant").on(table.tenantId),
  index("idx_project_plan_template_tasks_tenant_stage").on(table.tenantId, table.stageId),
]);
export type ProjectPlanTemplateTask = typeof projectPlanTemplateTasks.$inferSelect;
export type InsertProjectPlanTemplateTask = typeof projectPlanTemplateTasks.$inferInsert;


// ─── Client Activities (Notes, Photos, Files, SMS, Emails) ─────────────────
export const clientActivities = mysqlTable("client_activities", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  leadId: int("leadId"),
  type: mysqlEnum("activityType", ["note", "photo", "file", "sms", "email"]).notNull(),
  title: varchar("title", { length: 255 }),
  content: text("content"),
  // For files/photos
  fileUrl: text("fileUrl"),
  fileKey: text("fileKey"),
  fileName: varchar("fileName", { length: 255 }),
  fileMimeType: varchar("fileMimeType", { length: 128 }),
  // Portal visibility
  portalVisible: boolean("portalVisible").default(false).notNull(),
  // Metadata
  createdBy: int("createdBy").notNull(),
  createdByName: varchar("createdByName", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ClientActivity = typeof clientActivities.$inferSelect;
export type InsertClientActivity = typeof clientActivities.$inferInsert;

// ─── Email Events (Tracking: sent, delivered, opened, clicked, bounced) ──────
export const emailEvents = mysqlTable("email_events", {
  id: int("id").autoincrement().primaryKey(),
  activityId: int("activityId").notNull(),
  resendEmailId: varchar("resendEmailId", { length: 128 }),
  recipientEmail: varchar("recipientEmail", { length: 320 }),
  status: mysqlEnum("status", ["sent", "delivered", "opened", "clicked", "bounced", "complained"]).default("sent").notNull(),
  sentAt: timestamp("sentAt"),
  deliveredAt: timestamp("deliveredAt"),
  openedAt: timestamp("openedAt"),
  clickedAt: timestamp("clickedAt"),
  bouncedAt: timestamp("bouncedAt"),
  bounceReason: text("bounceReason"),
  openCount: int("openCount").default(0).notNull(),
  clickCount: int("clickCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type EmailEvent = typeof emailEvents.$inferSelect;
export type InsertEmailEvent = typeof emailEvents.$inferInsert;

// ─── Shared Inbox / Central Email Hub ────────────────────────────────────────

// Admin-defined tags/flags for inbox messages
export const inboxTags = mysqlTable("inbox_tags", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  name: varchar("name", { length: 64 }).notNull(),
  color: varchar("color", { length: 32 }).default("#6366f1").notNull(),
  description: varchar("description", { length: 255 }),
  active: boolean("active").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_inbox_tags_tenant").on(table.tenantId),
  index("idx_inbox_tags_tenant_active").on(table.tenantId, table.active),
]);
export type InboxTag = typeof inboxTags.$inferSelect;
export type InsertInboxTag = typeof inboxTags.$inferInsert;

// Inbox messages — both inbound and outbound, threaded
export const inboxMessages = mysqlTable("inbox_messages", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  threadId: varchar("threadId", { length: 128 }).notNull(),
  parentId: int("parentId"),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  resendEmailId: varchar("resendEmailId", { length: 128 }),
  graphMessageId: varchar("graphMessageId", { length: 512 }), // Microsoft Graph message ID
  graphConversationId: varchar("graphConversationId", { length: 512 }),
  messageId: varchar("messageId", { length: 512 }),
  inReplyTo: varchar("inReplyTo", { length: 512 }),
  emailReferences: text("emailReferences"),
  fromAddress: varchar("fromAddress", { length: 320 }).notNull(),
  fromName: varchar("fromName", { length: 255 }),
  toAddresses: text("toAddresses").notNull(),
  ccAddresses: text("ccAddresses"),
  bccAddresses: text("bccAddresses"),
  receivedByAddress: varchar("receivedByAddress", { length: 320 }),
  subject: varchar("subject", { length: 1000 }),
  htmlBody: mediumtext("htmlBody"),
  textBody: mediumtext("textBody"),
  attachments: json("attachments"),
  matchedJobId: int("matchedJobId"),
  matchedLeadId: int("matchedLeadId"),
  matchedClientEmail: varchar("matchedClientEmail", { length: 320 }),
  assignedToId: int("assignedToId"),
  assignedToName: varchar("assignedToName", { length: 100 }),
  assignedAt: timestamp("assignedAt"),
  status: mysqlEnum("inboxStatus", ["new", "open", "replied", "closed", "spam"]).default("new").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  isStarred: boolean("isStarred").default(false).notNull(),
  portalVisible: boolean("portalVisible").default(false).notNull(),
  activityId: int("activityId"),
  autoReplySent: boolean("autoReplySent").default(false).notNull(),
  feedbackRating: int("feedbackRating"),
  feedbackComment: text("feedbackComment"),
  feedbackAt: timestamp("feedbackAt"),
  createdBy: int("createdBy"),
  createdByName: varchar("createdByName", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_inbox_messages_tenant").on(table.tenantId),
  index("idx_inbox_messages_thread_tenant").on(table.tenantId, table.threadId),
  index("idx_inbox_messages_tenant_graph_conversation").on(table.tenantId, table.graphConversationId),
]);
export type InboxMessage = typeof inboxMessages.$inferSelect;
export type InsertInboxMessage = typeof inboxMessages.$inferInsert;

// Inbox tickets — one durable helpdesk case per email thread
export const inboxTickets = mysqlTable("inbox_tickets", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  threadId: varchar("threadId", { length: 128 }).notNull(),
  graphConversationId: varchar("graphConversationId", { length: 512 }),
  subject: varchar("subject", { length: 1000 }),
  requesterEmail: varchar("requesterEmail", { length: 320 }),
  requesterName: varchar("requesterName", { length: 255 }),
  receivedByAddress: varchar("receivedByAddress", { length: 320 }),
  queue: varchar("queue", { length: 50 }),
  channel: mysqlEnum("channel", ["email", "phone", "web", "portal", "manual"]).default("email").notNull(),
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
  status: mysqlEnum("status", ["new", "open", "waiting_customer", "waiting_internal", "customer_replied", "resolved", "closed", "spam"]).default("new").notNull(),
  waitingOn: mysqlEnum("waitingOn", ["customer", "internal", "staff", "none"]).default("staff").notNull(),
  assignedToId: int("assignedToId"),
  assignedToName: varchar("assignedToName", { length: 100 }),
  assignedAt: timestamp("assignedAt"),
  lastResponderName: varchar("lastResponderName", { length: 255 }),
  lastResponderEmail: varchar("lastResponderEmail", { length: 320 }),
  matchedJobId: int("matchedJobId"),
  matchedLeadId: int("matchedLeadId"),
  matchedClientEmail: varchar("matchedClientEmail", { length: 320 }),
  firstMessageId: int("firstMessageId"),
  latestMessageId: int("latestMessageId"),
  latestDirection: mysqlEnum("latestDirection", ["inbound", "outbound"]),
  messageCount: int("messageCount").default(0).notNull(),
  unreadCount: int("unreadCount").default(0).notNull(),
  isStarred: boolean("isStarred").default(false).notNull(),
  lastInboundAt: timestamp("lastInboundAt"),
  lastOutboundAt: timestamp("lastOutboundAt"),
  lastMessageAt: timestamp("lastMessageAt"),
  slaWarningAt: timestamp("slaWarningAt"),
  slaDueAt: timestamp("slaDueAt"),
  slaBreachedAt: timestamp("slaBreachedAt"),
  slaRuleId: int("slaRuleId"),
  slaMetric: mysqlEnum("slaMetric", ["first_response", "next_response", "resolution"]),
  slaFirstResponseDueAt: timestamp("slaFirstResponseDueAt"),
  slaNextResponseDueAt: timestamp("slaNextResponseDueAt"),
  slaResolutionDueAt: timestamp("slaResolutionDueAt"),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: int("resolvedBy"),
  resolvedByName: varchar("resolvedByName", { length: 100 }),
  resolutionNotes: text("resolutionNotes"),
  closedReason: varchar("closedReason", { length: 100 }),
  createdBy: int("createdBy"),
  createdByName: varchar("createdByName", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("uq_inbox_tickets_tenant_thread").on(table.tenantId, table.threadId),
  index("idx_inbox_tickets_tenant").on(table.tenantId),
  index("idx_inbox_tickets_tenant_status").on(table.tenantId, table.status),
  index("idx_inbox_tickets_tenant_assignee").on(table.tenantId, table.assignedToId),
  index("idx_inbox_tickets_tenant_last_message").on(table.tenantId, table.lastMessageAt),
  index("idx_inbox_tickets_tenant_graph_conversation").on(table.tenantId, table.graphConversationId),
]);
export type InboxTicket = typeof inboxTickets.$inferSelect;
export type InsertInboxTicket = typeof inboxTickets.$inferInsert;

// Private ticket notes — never emailed to customers.
export const inboxTicketNotes = mysqlTable("inbox_ticket_notes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  ticketId: int("ticketId").notNull(),
  body: text("body").notNull(),
  createdBy: int("createdBy"),
  createdByName: varchar("createdByName", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_inbox_ticket_notes_tenant_ticket").on(table.tenantId, table.ticketId),
  index("idx_inbox_ticket_notes_ticket").on(table.ticketId),
]);
export type InboxTicketNote = typeof inboxTicketNotes.$inferSelect;
export type InsertInboxTicketNote = typeof inboxTicketNotes.$inferInsert;

// Shared reply templates for canned staff responses.
export const inboxReplyTemplates = mysqlTable("inbox_reply_templates", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  queue: varchar("queue", { length: 50 }),
  category: varchar("category", { length: 80 }),
  subject: varchar("subject", { length: 255 }),
  bodyHtml: mediumtext("bodyHtml").notNull(),
  bodyText: mediumtext("bodyText"),
  active: boolean("active").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdBy: int("createdBy"),
  createdByName: varchar("createdByName", { length: 100 }),
  updatedBy: int("updatedBy"),
  updatedByName: varchar("updatedByName", { length: 100 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_inbox_reply_templates_tenant").on(table.tenantId),
  index("idx_inbox_reply_templates_tenant_active").on(table.tenantId, table.active),
  index("idx_inbox_reply_templates_tenant_queue").on(table.tenantId, table.queue),
]);
export type InboxReplyTemplate = typeof inboxReplyTemplates.$inferSelect;
export type InsertInboxReplyTemplate = typeof inboxReplyTemplates.$inferInsert;

// Lightweight presence used to warn when another staff member has a ticket open/replying.
export const inboxTicketPresence = mysqlTable("inbox_ticket_presence", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  threadId: varchar("threadId", { length: 128 }).notNull(),
  userId: int("userId").notNull(),
  userName: varchar("userName", { length: 100 }),
  mode: mysqlEnum("mode", ["viewing", "replying"]).default("viewing").notNull(),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("uq_inbox_ticket_presence_tenant_thread_user").on(table.tenantId, table.threadId, table.userId),
  index("idx_inbox_ticket_presence_tenant_thread").on(table.tenantId, table.threadId),
]);
export type InboxTicketPresence = typeof inboxTicketPresence.$inferSelect;
export type InsertInboxTicketPresence = typeof inboxTicketPresence.$inferInsert;

// Junction table: inbox tickets ↔ tags
export const inboxTicketTags = mysqlTable("inbox_ticket_tags", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: int("ticketId").notNull(),
  tagId: int("tagId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("uq_inbox_ticket_tags_ticket_tag").on(table.ticketId, table.tagId),
  index("idx_inbox_ticket_tags_ticket").on(table.ticketId),
  index("idx_inbox_ticket_tags_tag").on(table.tagId),
]);
export type InboxTicketTag = typeof inboxTicketTags.$inferSelect;

// Junction table: inbox messages ↔ tags
export const inboxMessageTags = mysqlTable("inbox_message_tags", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull(),
  tagId: int("tagId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type InboxMessageTag = typeof inboxMessageTags.$inferSelect;

// Per-user email signature blocks
export const emailSignatures = mysqlTable("email_signatures", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  htmlContent: mediumtext("htmlContent").notNull(),
  isDefault: boolean("isDefault").default(true).notNull(),
  schedule: varchar("schedule", { length: 20 }).default("always"),  // 'always' | 'business_hours' | 'out_of_office'
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_email_signatures_tenant").on(table.tenantId),
  index("idx_email_signatures_tenant_user").on(table.tenantId, table.userId),
]);
export type EmailSignature = typeof emailSignatures.$inferSelect;
export type InsertEmailSignature = typeof emailSignatures.$inferInsert;

// Inbox settings (singleton row per setting key)
export const inboxSettings = mysqlTable("inbox_settings", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  settingKey: varchar("settingKey", { length: 64 }).notNull(),
  settingValue: text("settingValue").notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_inbox_settings_tenant").on(table.tenantId),
  uniqueIndex("uq_inbox_settings_tenant_key").on(table.tenantId, table.settingKey),
]);
export type InboxSetting = typeof inboxSettings.$inferSelect;
export type InsertInboxSetting = typeof inboxSettings.$inferInsert;

// SLA action rules for inbox messages
export const inboxSlaRules = mysqlTable("inbox_sla_rules", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  queue: varchar("queue", { length: 50 }),
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]),
  firstResponseHours: int("firstResponseHours").default(4).notNull(),
  nextResponseHours: int("nextResponseHours").default(24).notNull(),
  resolutionHours: int("resolutionHours").default(72).notNull(),
  warningHours: int("warningHours").default(24).notNull(),
  escalationHours: int("escalationHours").default(36).notNull(),
  reminderTargets: varchar("reminderTargets", { length: 512 }).default('["assigned","manager"]').notNull(),
  managerEmail: varchar("managerEmail", { length: 320 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_inbox_sla_rules_tenant").on(table.tenantId),
  index("idx_inbox_sla_rules_tenant_active").on(table.tenantId, table.active),
]);
export type InboxSlaRule = typeof inboxSlaRules.$inferSelect;
export type InsertInboxSlaRule = typeof inboxSlaRules.$inferInsert;


// ─── Inbox Addresses (multiple receiving addresses with auto-assignment rules) ─
export const inboxAddresses = mysqlTable("inbox_addresses", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  address: varchar("address", { length: 320 }).notNull().unique(),
  displayName: varchar("displayName", { length: 100 }).notNull(),
  description: varchar("description", { length: 255 }),
  provider: varchar("provider", { length: 20 }).notNull().default("msgraph"), // "msgraph" primary; "resend" legacy inbound compatibility
  module: varchar("module", { length: 50 }), // "sales" | "construction" | "approvals" | "admin"
  deltaLink: text("deltaLink"), // Microsoft Graph delta sync token
  lastSyncAt: timestamp("lastSyncAt"), // Last successful sync timestamp
  defaultAssigneeId: int("defaultAssigneeId"),
  defaultAssigneeName: varchar("defaultAssigneeName", { length: 100 }),
  autoTagIds: json("autoTagIds"),
  active: boolean("active").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_inbox_addresses_tenant").on(table.tenantId),
]);
export type InboxAddress = typeof inboxAddresses.$inferSelect;
export type InsertInboxAddress = typeof inboxAddresses.$inferInsert;

// ─── Check Measure: Variance Items ──────────────────────────────────────────
export const cmVarianceItems = mysqlTable("cm_variance_items", {
  id: int("id").autoincrement().primaryKey(),
  workbookId: int("workbookId").notNull().references(() => checkMeasureWorkbooks.id, { onDelete: "cascade" }),
  tabName: varchar("tabName", { length: 64 }).notNull(),
  itemDescription: varchar("itemDescription", { length: 255 }).notNull(),
  originalQty: decimal("originalQty", { precision: 10, scale: 3 }),
  measuredQty: decimal("measuredQty", { precision: 10, scale: 3 }),
  varianceQty: decimal("varianceQty", { precision: 10, scale: 3 }),
  uom: varchar("uom", { length: 16 }).default("ea"),
  severity: mysqlEnum("severity", ["minor", "moderate", "major"]).default("minor").notNull(),
  notes: text("notes"),
  resolvedAt: timestamp("resolvedAt"),
  resolvedBy: int("resolvedBy").references(() => users.id),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CmVarianceItem = typeof cmVarianceItems.$inferSelect;
export type InsertCmVarianceItem = typeof cmVarianceItems.$inferInsert;

// ─── Check Measure: Component Orders ────────────────────────────────────────
export const cmComponentOrders = mysqlTable("cm_component_orders", {
  id: int("id").autoincrement().primaryKey(),
  workbookId: int("workbookId").notNull().references(() => checkMeasureWorkbooks.id, { onDelete: "cascade" }),
  orderNumber: varchar("orderNumber", { length: 64 }),
  supplier: varchar("supplier", { length: 255 }),
  status: mysqlEnum("status", ["draft", "submitted", "confirmed", "shipped", "received", "cancelled"]).default("draft").notNull(),
  totalCost: decimal("totalCost", { precision: 12, scale: 2 }),
  lineItems: json("lineItems"),
  notes: text("notes"),
  orderedBy: int("orderedBy").references(() => users.id),
  orderedByName: varchar("orderedByName", { length: 255 }),
  orderedAt: timestamp("orderedAt"),
  receivedAt: timestamp("receivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CmComponentOrder = typeof cmComponentOrders.$inferSelect;
export type InsertCmComponentOrder = typeof cmComponentOrders.$inferInsert;

// ─── Check Measure: Trades Work Orders ──────────────────────────────────────
export const cmWorkOrders = mysqlTable("cm_work_orders", {
  id: int("id").autoincrement().primaryKey(),
  workbookId: int("workbookId").notNull().references(() => checkMeasureWorkbooks.id, { onDelete: "cascade" }),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  orderNumber: varchar("orderNumber", { length: 64 }),
  tradeType: varchar("tradeType", { length: 128 }).notNull(),
  description: text("description"),
  scope: text("scope"),
  assignedTo: varchar("assignedTo", { length: 255 }),
  assignedPhone: varchar("assignedPhone", { length: 64 }),
  assignedEmail: varchar("assignedEmail", { length: 320 }),
  status: mysqlEnum("status", ["draft", "issued", "accepted", "in_progress", "completed", "cancelled"]).default("draft").notNull(),
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
  scheduledDate: timestamp("scheduledDate"),
  completedDate: timestamp("completedDate"),
  estimatedCost: decimal("estimatedCost", { precision: 12, scale: 2 }),
  actualCost: decimal("actualCost", { precision: 12, scale: 2 }),
  lineItems: json("lineItems"),
  notes: text("notes"),
  createdBy: int("createdBy").references(() => users.id),
  createdByName: varchar("createdByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CmWorkOrder = typeof cmWorkOrders.$inferSelect;
export type InsertCmWorkOrder = typeof cmWorkOrders.$inferInsert;


// ─── Equipment ──────────────────────────────────────────────────────────────
export const equipment = mysqlTable("equipment", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 128 }),
  description: text("description"),
  serialNumber: varchar("serialNumber", { length: 128 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Equipment = typeof equipment.$inferSelect;
export type InsertEquipment = typeof equipment.$inferInsert;

// ─── Equipment Bookings ─────────────────────────────────────────────────────
export const equipmentBookings = mysqlTable("equipment_bookings", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  equipmentId: int("equipmentId").notNull().references(() => equipment.id, { onDelete: "cascade" }),
  scheduleEventId: int("scheduleEventId"),
  jobId: int("jobId").references(() => constructionJobs.id, { onDelete: "set null" }),
  startDate: timestamp("startDate").notNull(),
  endDate: timestamp("endDate").notNull(),
  notes: text("notes"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  foreignKey({
    name: "fk_equipment_booking_event",
    columns: [table.scheduleEventId],
    foreignColumns: [constructionScheduleEvents.id],
  }).onDelete("cascade"),
  index("idx_equipment_bookings_tenant").on(table.tenantId),
  index("idx_equipment_bookings_tenant_equipment").on(table.tenantId, table.equipmentId),
  index("idx_equipment_bookings_tenant_job").on(table.tenantId, table.jobId),
]);
export type EquipmentBooking = typeof equipmentBookings.$inferSelect;
export type InsertEquipmentBooking = typeof equipmentBookings.$inferInsert;

// ─── Trade Portal Access ────────────────────────────────────────────────────
export const tradePortalAccess = mysqlTable("trade_portal_access", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  installerId: int("installerId").notNull().references(() => constructionInstallers.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 320 }).notNull(),
  accessToken: varchar("accessToken", { length: 128 }).notNull().unique(),
  isActive: boolean("isActive").default(true).notNull(),
  lastAccessedAt: timestamp("lastAccessedAt"),
  lastViewedNewsAt: timestamp("lastViewedNewsAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TradePortalAccess = typeof tradePortalAccess.$inferSelect;

// ─── Trade Portal Sessions ──────────────────────────────────────────────────
export const tradePortalSessions = mysqlTable("trade_portal_sessions", {
  id: int("id").autoincrement().primaryKey(),
  tradePortalAccessId: int("tradePortalAccessId").notNull(),
  sessionToken: varchar("sessionToken", { length: 128 }).notNull().unique(),
  magicLinkToken: varchar("magicLinkToken", { length: 128 }).unique(),
  magicLinkExpiresAt: timestamp("magicLinkExpiresAt"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  foreignKey({
    name: "fk_trade_session_access",
    columns: [table.tradePortalAccessId],
    foreignColumns: [tradePortalAccess.id],
  }).onDelete("cascade"),
]);
export type TradePortalSession = typeof tradePortalSessions.$inferSelect;

// ─── Trade Availabilities ───────────────────────────────────────────────────
export const tradeAvailabilities = mysqlTable("trade_availabilities", {
  id: int("id").autoincrement().primaryKey(),
  installerId: int("installerId").notNull().references(() => constructionInstallers.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  status: mysqlEnum("status", ["available", "unavailable", "partial"]).default("available").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TradeAvailability = typeof tradeAvailabilities.$inferSelect;

// ─── Trade Invoices ─────────────────────────────────────────────────────────
export const tradeInvoices = mysqlTable("trade_invoices", {
  id: int("id").autoincrement().primaryKey(),
  installerId: int("installerId").notNull().references(() => constructionInstallers.id, { onDelete: "cascade" }),
  jobId: int("jobId").references(() => constructionJobs.id, { onDelete: "set null" }),
  workOrderId: int("workOrderId").references(() => cmWorkOrders.id, { onDelete: "set null" }),
  invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull(),
  invoiceDate: timestamp("invoiceDate"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  gstAmount: decimal("gstAmount", { precision: 12, scale: 2 }).default("0"),
  totalWithGst: decimal("totalWithGst", { precision: 12, scale: 2 }),
  approvedAmount: decimal("approvedAmount", { precision: 12, scale: 2 }),
  approvedGstAmount: decimal("approvedGstAmount", { precision: 12, scale: 2 }),
  approvedTotalWithGst: decimal("approvedTotalWithGst", { precision: 12, scale: 2 }),
  description: text("description"),
  fileUrl: text("fileUrl"),
  fileKey: varchar("fileKey", { length: 512 }),
  // OCR / AI extraction
  ocrStatus: mysqlEnum("ocrStatus", ["pending", "extracting", "extracted", "confirmed", "failed"]).default("pending").notNull(),
  ocrRawData: json("ocrRawData"), // raw AI extraction result
  ocrConfidence: decimal("ocrConfidence", { precision: 5, scale: 2 }),
  // Workflow status
  status: mysqlEnum("status", ["draft", "submitted", "under_review", "pending_approval", "approved", "paid", "rejected"]).default("draft").notNull(),
  submittedAt: timestamp("submittedAt"),
  reviewedAt: timestamp("reviewedAt"),
  reviewedBy: int("reviewedBy").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
  // Xero integration
  xeroBillId: varchar("xeroBillId", { length: 128 }),
  xeroBillNumber: varchar("xeroBillNumber", { length: 64 }),
  notes: text("notes"),
  approvalAdjustmentReason: text("approvalAdjustmentReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TradeInvoice = typeof tradeInvoices.$inferSelect;
export type InsertTradeInvoice = typeof tradeInvoices.$inferInsert;

// ─── Trade Invoice Photos (Proof of Work) ──────────────────────────────────
export const tradeInvoicePhotoStageEnum = mysqlEnum("trade_invoice_photo_stage", ["before", "during", "after"]);
export const tradeInvoicePhotos = mysqlTable("trade_invoice_photos", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull().references(() => tradeInvoices.id, { onDelete: "cascade" }),
  installerId: int("installerId").notNull().references(() => constructionInstallers.id, { onDelete: "cascade" }),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileName: varchar("fileName", { length: 255 }),
  caption: text("caption"),
  stage: tradeInvoicePhotoStageEnum,
  reviewedAt: timestamp("reviewedAt"),
  reviewedBy: varchar("reviewedBy", { length: 255 }),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type TradeInvoicePhoto = typeof tradeInvoicePhotos.$inferSelect;
export type InsertTradeInvoicePhoto = typeof tradeInvoicePhotos.$inferInsert;

// ─── Trade Invoice Lines ────────────────────────────────────────────────────
export const tradeInvoiceLines = mysqlTable("trade_invoice_lines", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull().references(() => tradeInvoices.id, { onDelete: "cascade" }),
  lineNumber: int("lineNumber").default(1).notNull(),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).default("1"),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  gstAmount: decimal("gstAmount", { precision: 12, scale: 2 }).default("0"),
  approvedAmount: decimal("approvedAmount", { precision: 12, scale: 2 }),
  approvedGstAmount: decimal("approvedGstAmount", { precision: 12, scale: 2 }),
  // Job / PO / Milestone linking
  jobId: int("jobId").references(() => constructionJobs.id, { onDelete: "set null" }),
  workOrderId: int("workOrderId").references(() => cmWorkOrders.id, { onDelete: "set null" }),
  milestoneId: int("milestoneId"),
  // Subcontract milestone linking
  subcontractId: int("subcontractId").references(() => projectSubcontracts.id, { onDelete: "set null" }),
  subcontractMilestoneIndex: int("subcontractMilestoneIndex"), // index into paymentSchedule JSON array
  // Per-line approval
  approvalStatus: mysqlEnum("approvalStatus", ["pending", "approved", "rejected"]).default("pending").notNull(),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedAt: timestamp("approvedAt"),
  rejectionReason: text("rejectionReason"),
  approvalAdjustmentReason: text("approvalAdjustmentReason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TradeInvoiceLine = typeof tradeInvoiceLines.$inferSelect;
export type InsertTradeInvoiceLine = typeof tradeInvoiceLines.$inferInsert;

// ─── Trade Invoice Approvals (Audit Log) ────────────────────────────────────
export const tradeInvoiceApprovals = mysqlTable("trade_invoice_approvals", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull().references(() => tradeInvoices.id, { onDelete: "cascade" }),
  lineId: int("lineId").references(() => tradeInvoiceLines.id, { onDelete: "cascade" }),
  supervisorId: int("supervisorId").notNull().references(() => users.id),
  supervisorName: varchar("supervisorName", { length: 255 }),
  action: mysqlEnum("action", ["approved", "rejected", "returned"]).notNull(),
  comments: text("comments"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TradeInvoiceApproval = typeof tradeInvoiceApprovals.$inferSelect;
export type InsertTradeInvoiceApproval = typeof tradeInvoiceApprovals.$inferInsert;

// ─── PO Milestones (Progress Payment Schedule) ─────────────────────────────
export const poMilestones = mysqlTable("po_milestones", {
  id: int("id").autoincrement().primaryKey(),
  workOrderId: int("workOrderId").notNull().references(() => cmWorkOrders.id, { onDelete: "cascade" }),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  stage: varchar("stage", { length: 128 }).notNull(),
  description: text("description"),
  percentage: decimal("percentage", { precision: 5, scale: 2 }).notNull(), // e.g. 30.00
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  retentionPercent: decimal("retentionPercent", { precision: 5, scale: 2 }).default("5.00"),
  retentionAmount: decimal("retentionAmount", { precision: 12, scale: 2 }).default("0"),
  sortOrder: int("sortOrder").default(0).notNull(),
  status: mysqlEnum("status", ["pending", "claimed", "approved", "paid", "retention_held", "retention_released"]).default("pending").notNull(),
  claimedAt: timestamp("claimedAt"),
  approvedAt: timestamp("approvedAt"),
  paidAt: timestamp("paidAt"),
  retentionReleasedAt: timestamp("retentionReleasedAt"),
  invoiceLineId: int("invoiceLineId"), // links to the trade_invoice_line that claimed this milestone
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PoMilestone = typeof poMilestones.$inferSelect;
export type InsertPoMilestone = typeof poMilestones.$inferInsert;

// ─── Trade Remittances ──────────────────────────────────────────────────────
export const tradeRemittances = mysqlTable("trade_remittances", {
  id: int("id").autoincrement().primaryKey(),
  installerId: int("installerId").notNull().references(() => constructionInstallers.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  date: timestamp("date").notNull(),
  reference: varchar("reference", { length: 128 }),
  fileUrl: text("fileUrl"),
  fileKey: varchar("fileKey", { length: 512 }),
  notes: text("notes"),
  source: mysqlEnum("source", ["manual", "xero"]).default("manual").notNull(),
  xeroPaymentId: varchar("xeroPaymentId", { length: 128 }),
  xeroInvoiceId: varchar("xeroInvoiceId", { length: 128 }),
  xeroInvoiceNumber: varchar("xeroInvoiceNumber", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TradeRemittance = typeof tradeRemittances.$inferSelect;

// ─── Trade Photos ───────────────────────────────────────────────────────────
export const tradePhotos = mysqlTable("trade_photos", {
  id: int("id").autoincrement().primaryKey(),
  installerId: int("installerId").notNull().references(() => constructionInstallers.id, { onDelete: "cascade" }),
  jobId: int("jobId").references(() => constructionJobs.id, { onDelete: "set null" }),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  caption: text("caption"),
  category: mysqlEnum("category", ["progress", "issue", "completion", "before", "after", "other"]).default("progress").notNull(),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
});
export type TradePhoto = typeof tradePhotos.$inferSelect;

// ─── Trade Messages ─────────────────────────────────────────────────────────
export const tradeMessages = mysqlTable("trade_messages", {
  id: int("id").autoincrement().primaryKey(),
  installerId: int("installerId").notNull().references(() => constructionInstallers.id, { onDelete: "cascade" }),
  jobId: int("jobId").references(() => constructionJobs.id, { onDelete: "set null" }),
  content: text("content").notNull(),
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  senderName: varchar("senderName", { length: 255 }),
  attachmentUrl: text("attachmentUrl"),
  attachmentKey: varchar("attachmentKey", { length: 512 }),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type TradeMessage = typeof tradeMessages.$inferSelect;

// ─── Trade Notification Rules ──────────────────────────────────────────────
export const tradeNotificationRules = mysqlTable("trade_notification_rules", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  triggerType: mysqlEnum("triggerType", ["before_job", "after_job", "on_assignment", "availability_reminder"]).notNull(),
  channel: mysqlEnum("channel", ["sms", "email", "both"]).default("email").notNull(),
  hoursOffset: int("hoursOffset").default(24).notNull(),
  messageTemplate: text("messageTemplate"), // Message template with {{variables}}
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type TradeNotificationRule = typeof tradeNotificationRules.$inferSelect;
export type InsertTradeNotificationRule = typeof tradeNotificationRules.$inferInsert;

// ─── Xero Payment Sync Log ─────────────────────────────────────────────────
export const xeroPaymentSyncLog = mysqlTable("xero_payment_sync_log", {
  id: int("id").autoincrement().primaryKey(),
  xeroPaymentId: varchar("xeroPaymentId", { length: 128 }).notNull(),
  xeroInvoiceId: varchar("xeroInvoiceId", { length: 128 }),
  xeroInvoiceNumber: varchar("xeroInvoiceNumber", { length: 64 }),
  installerId: int("installerId").references(() => constructionInstallers.id),
  remittanceId: int("remittanceId").references(() => tradeRemittances.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  paymentDate: timestamp("paymentDate").notNull(),
  status: mysqlEnum("status", ["synced", "skipped", "error"]).default("synced").notNull(),
  errorMessage: text("errorMessage"),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
});
export type XeroPaymentSyncLog = typeof xeroPaymentSyncLog.$inferSelect;


// ─── Overdue Alert Dismissals ───────────────────────────────────────────────
export const overdueAlertDismissals = mysqlTable("overdue_alert_dismissals", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: mysqlEnum("action", ["dismiss", "snooze"]).notNull(),
  snoozedUntil: timestamp("snoozedUntil"), // null for dismiss, future timestamp for snooze
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type OverdueAlertDismissal = typeof overdueAlertDismissals.$inferSelect;
export type InsertOverdueAlertDismissal = typeof overdueAlertDismissals.$inferInsert;

// ─── Xero Cost Report Imports ───────────────────────────────────────────────
export const xeroCostImportBatches = mysqlTable("xero_cost_import_batches", {
  id: int("id").autoincrement().primaryKey(),
  appTenantId: int("appTenantId").references(() => tenants.id),
  filename: varchar("filename", { length: 512 }).notNull(),
  uploadedBy: int("uploadedBy").references(() => users.id),
  uploadedByName: varchar("uploadedByName", { length: 255 }),
  totalRows: int("totalRows").default(0).notNull(),
  importedRows: int("importedRows").default(0).notNull(),
  skippedRows: int("skippedRows").default(0).notNull(),
  duplicateRows: int("duplicateRows").default(0).notNull(),
  dateRangeStart: varchar("dateRangeStart", { length: 32 }),
  dateRangeEnd: varchar("dateRangeEnd", { length: 32 }),
  processingCursor: int("processingCursor").default(0).notNull(),
  parsedDataKey: varchar("parsedDataKey", { length: 512 }),
  status: mysqlEnum("importStatus", ["processing", "completed", "failed"]).default("processing").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type XeroCostImportBatch = typeof xeroCostImportBatches.$inferSelect;
export type InsertXeroCostImportBatch = typeof xeroCostImportBatches.$inferInsert;

export const xeroCostImportItems = mysqlTable("xero_cost_import_items", {
  id: int("id").autoincrement().primaryKey(),
  appTenantId: int("appTenantId").references(() => tenants.id),
  batchId: int("batchId").notNull().references(() => xeroCostImportBatches.id, { onDelete: "cascade" }),
  jobId: int("jobId").references(() => constructionJobs.id, { onDelete: "set null" }),
  importHash: varchar("importHash", { length: 64 }).notNull().unique(), // SHA-256 hash for dedup
  // Data from the report
  date: timestamp("date"),
  projectName: varchar("projectName", { length: 255 }).notNull(), // e.g. "NSW-98520-IS-AB-ic"
  projectState: varchar("projectState", { length: 64 }),
  itemType: varchar("itemType", { length: 64 }).notNull(), // "Expense", "Task", etc.
  itemName: text("itemName"), // Description of the cost
  itemCode: varchar("itemCode", { length: 128 }),
  reference: varchar("reference", { length: 512 }),
  supplierName: varchar("supplierName", { length: 255 }), // From group header
  costExGst: decimal("costExGst", { precision: 12, scale: 4 }).default("0"),
  costIncGst: decimal("costIncGst", { precision: 12, scale: 4 }).default("0"),
  actual: decimal("actual", { precision: 12, scale: 4 }).default("0"),
  totalInvoiced: decimal("totalInvoiced", { precision: 12, scale: 4 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type XeroCostImportItem = typeof xeroCostImportItems.$inferSelect;
export type InsertXeroCostImportItem = typeof xeroCostImportItems.$inferInsert;


// ─── Xero Budget Imports ────────────────────────────────────────────────────
export const xeroBudgetImportBatches = mysqlTable("xero_budget_import_batches", {
  id: int("id").autoincrement().primaryKey(),
  appTenantId: int("appTenantId").references(() => tenants.id),
  filename: varchar("filename", { length: 512 }).notNull(),
  uploadedBy: int("uploadedBy").references(() => users.id),
  uploadedByName: varchar("uploadedByName", { length: 255 }),
  totalRows: int("totalRows").default(0).notNull(),
  importedRows: int("importedRows").default(0).notNull(),
  skippedRows: int("skippedRows").default(0).notNull(),
  duplicateRows: int("duplicateRows").default(0).notNull(),
  status: mysqlEnum("budgetImportStatus", ["processing", "completed", "failed"]).default("processing").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type XeroBudgetImportBatch = typeof xeroBudgetImportBatches.$inferSelect;
export type InsertXeroBudgetImportBatch = typeof xeroBudgetImportBatches.$inferInsert;

export const xeroBudgetImportItems = mysqlTable("xero_budget_import_items", {
  id: int("id").autoincrement().primaryKey(),
  appTenantId: int("appTenantId").references(() => tenants.id),
  batchId: int("batchId").notNull(),
  jobId: int("jobId").references(() => constructionJobs.id, { onDelete: "set null" }),
  importHash: varchar("budgetImportHash", { length: 64 }).notNull().unique(),
  // Data from the report
  contactName: varchar("contactName", { length: 255 }),
  projectName: varchar("projectName", { length: 255 }).notNull(),
  projectState: varchar("projectState", { length: 64 }),
  rawCategory: text("rawCategory"), // Original category name from spreadsheet
  category: mysqlEnum("budgetCategory", [
    "authorities_councils_certifiers",
    "builders_fees",
    "da_commissions",
    "sub_contractors_others",
    "stock_building_costs",
    "other",
  ]).default("other").notNull(),
  estimatedCostExGst: decimal("estimatedCostExGst", { precision: 12, scale: 2 }).default("0"),
  estimatedCostIncGst: decimal("estimatedCostIncGst", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  foreignKey({
    name: "fk_xero_budget_item_batch",
    columns: [table.batchId],
    foreignColumns: [xeroBudgetImportBatches.id],
  }).onDelete("cascade"),
]);
export type XeroBudgetImportItem = typeof xeroBudgetImportItems.$inferSelect;
export type InsertXeroBudgetImportItem = typeof xeroBudgetImportItems.$inferInsert;

// ─── User Settings (synced across devices) ─────────────────────────────────
export const userSettings = mysqlTable("user_settings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  themeMode: varchar("themeMode", { length: 16 }).default("light"),
  colorScheme: varchar("colorScheme", { length: 32 }).default("default"),
  customLogoUrl: text("customLogoUrl"),
  appIconUrl: text("appIconUrl"),
  faviconUrl: text("faviconUrl"),
  companyDetails: json("companyDetails"),
  proposalText: json("proposalText"),
  companyTheme: json("companyTheme"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = typeof userSettings.$inferInsert;


// ─── Patio Planner Projects ─────────────────────────────────────────────────
export const patioPlanner = mysqlTable("patio_planner", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  quoteId: int("quoteId").references(() => quotes.id, { onDelete: "set null" }),
  name: varchar("name", { length: 255 }).notNull(),
  // Photo
  photoUrl: text("photoUrl"),
  photoKey: text("photoKey"),
  // Overlay positioning
  overlayX: decimal("overlayX", { precision: 10, scale: 2 }).default("50"),
  overlayY: decimal("overlayY", { precision: 10, scale: 2 }).default("50"),
  overlayScale: decimal("overlayScale", { precision: 6, scale: 3 }).default("1.000"),
  overlayRotation: decimal("overlayRotation", { precision: 6, scale: 2 }).default("0"),
  overlayOpacity: decimal("overlayOpacity", { precision: 4, scale: 2 }).default("0.60"),
  // Structure type and orientation
  structureType: varchar("structureType", { length: 32 }).default("patio"), // patio | carport
  flipped: boolean("flipped").default(false), // false = attachment on left, true = attachment on right (mirrored)
  gutterStyle: varchar("gutterStyle", { length: 32 }).default("quad"), // none | quad | half-round | fascia
  downpipeStyle: varchar("downpipeStyle", { length: 32 }).default("round"), // none | round | square
  roofPanel: varchar("roofPanel", { length: 32 }).default("double-u"), // double-u | slendek | wavetek | climatek-v | ambitek | ceiltek
  connectionType: varchar("connectionType", { length: 32 }).default("flyover-bracket"), // flyover-bracket | through-eave | back-channel | crank-post
  // Structure dimensions
  roofStyle: varchar("roofStyle", { length: 32 }).default("flyover"),
  structureWidth: decimal("structureWidth", { precision: 8, scale: 0 }).default("6000"),
  structureProjection: decimal("structureProjection", { precision: 8, scale: 0 }).default("4000"),
  roofPitch: decimal("roofPitch", { precision: 5, scale: 1 }).default("5.0"),
  beamHeight: decimal("beamHeight", { precision: 8, scale: 0 }).default("2700"),
  postHeight: decimal("postHeight", { precision: 8, scale: 0 }).default("2400"),
  floorToGround: decimal("floorToGround", { precision: 6, scale: 0 }).default("150"),
  beamSize: varchar("beamSize", { length: 64 }),
  postCount: int("postCount").default(2),
  // Colorbond colours
  roofColour: varchar("roofColour", { length: 64 }).default("Surfmist"),
  beamColour: varchar("beamColour", { length: 64 }).default("Surfmist"),
  postColour: varchar("postColour", { length: 64 }).default("Surfmist"),
  gutterColour: varchar("gutterColour", { length: 64 }).default("Surfmist"),
  fasciaColour: varchar("fasciaColour", { length: 64 }).default("Surfmist"),
  // Windows & doors (JSON array of positioned items — Session 2)
  windowsDoors: json("windowsDoors"),
  // Engineering validation data (JSON: windRegion, enclosure, beamSize, beamType, postSize)
  engineeringData: json("engineeringData"),
  // Annotations (JSON array of text notes on the canvas)
  annotations: json("annotations"),
  // AI render history (JSON array of render entries with URLs, prompts, timestamps)
  renderHistory: json("renderHistory"),
  // Scale calibration (JSON: { point1: {x,y}, point2: {x,y}, realDistanceMm: number })
  calibrationData: json("calibrationData"),
  // Composite export
  compositeUrl: text("compositeUrl"),
  compositeKey: text("compositeKey"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_patio_planner_tenant").on(table.tenantId),
  tenantUserIdx: index("idx_patio_planner_tenant_user").on(table.tenantId, table.userId),
  tenantQuoteIdx: index("idx_patio_planner_tenant_quote").on(table.tenantId, table.quoteId),
}));
export type PatioPlanner = typeof patioPlanner.$inferSelect;
export type InsertPatioPlanner = typeof patioPlanner.$inferInsert;


// ─── Render Cost Logs ─────────────────────────────────────────────────────────
export const renderCostLogs = mysqlTable("render_cost_logs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  userId: int("userId").notNull(), // adviser who generated
  projectId: int("projectId"), // patio planner project ID (nullable for future use)
  renderMode: varchar("renderMode", { length: 16 }).notNull(), // "full" | "quick" | "batch"
  stylePreset: varchar("stylePreset", { length: 64 }), // preset used (nullable)
  creditCost: decimal("creditCost", { precision: 10, scale: 4 }).notNull(), // cost in credits
  renderCount: int("renderCount").default(1).notNull(), // number of renders (>1 for batch)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_render_cost_logs_tenant").on(table.tenantId),
  tenantCreatedIdx: index("idx_render_cost_logs_tenant_created").on(table.tenantId, table.createdAt),
  tenantUserIdx: index("idx_render_cost_logs_tenant_user").on(table.tenantId, table.userId),
}));
export type RenderCostLog = typeof renderCostLogs.$inferSelect;
export type InsertRenderCostLog = typeof renderCostLogs.$inferInsert;


// ─── Project Subcontracts ─────────────────────────────────────────────────────
export const projectSubcontracts = mysqlTable("project_subcontracts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  installerId: int("installerId").references(() => constructionInstallers.id, { onDelete: "set null" }),
  // Header fields
  jobNumber: varchar("jobNumber", { length: 32 }),
  clientName: varchar("clientName", { length: 255 }),
  constructionManager: varchar("constructionManager", { length: 255 }),
  subcontractorName: varchar("subcontractorName", { length: 255 }),
  subcontractorPhone: varchar("subcontractorPhone", { length: 64 }),
  siteAddress: text("siteAddress"),
  // Financial
  subcontractSum: decimal("subcontractSum", { precision: 12, scale: 2 }),
  // Payment Schedule (JSON array of milestone objects)
  paymentSchedule: json("paymentSchedule").$type<PaymentMilestone[]>(),
  // Dates
  estimatedCommencement: timestamp("estimatedCommencement"),
  estimatedCompletion: timestamp("estimatedCompletion"),
  // Checklists (JSON objects)
  buildingFile: json("buildingFile").$type<BuildingFileChecklist>(),
  inspections: json("inspections").$type<InspectionChecklist>(),
  otherContractors: json("otherContractors").$type<OtherContractorsChecklist>(),
  electricalCabling: json("electricalCabling").$type<ElectricalCablingChecklist>(),
  downpipes: json("downpipes").$type<DownpipesChecklist>(),
  flashingBySubcontractor: varchar("flashingBySubcontractor", { length: 16 }).default("N/A"),
  // Status & signing
  status: mysqlEnum("status", ["draft", "sent", "signed", "cancelled", "declined"]).default("draft").notNull(),
  signwellDocumentId: varchar("signwellDocumentId", { length: 128 }),
  sentAt: timestamp("sentAt"),
  signedAt: timestamp("signedAt"),
  signedBySubcontractor: varchar("signedBySubcontractor", { length: 255 }),
  signedByCompany: varchar("signedByCompany", { length: 255 }),
  pdfUrl: text("pdfUrl"),
  pdfKey: text("pdfKey"),
  // Metadata
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_project_subcontracts_tenant").on(table.tenantId),
  index("idx_project_subcontracts_tenant_job").on(table.tenantId, table.jobId),
  index("idx_project_subcontracts_tenant_installer").on(table.tenantId, table.installerId),
]);
export type ProjectSubcontract = typeof projectSubcontracts.$inferSelect;
export type InsertProjectSubcontract = typeof projectSubcontracts.$inferInsert;

// ─── Subcontract JSON Types ──────────────────────────────────────────────────
export interface PaymentMilestone {
  label: string;
  amountDollars: number | null;
  percentOfTotal: number | null;
  usePercent: boolean; // true = use %, false = use $
}

export interface BuildingFileChecklist {
  plans: string; // "N/A" or description
  materialsList: string;
  approvals: string;
}

export interface InspectionChecklist {
  footings: string;
  slab: string;
  plumbing: string;
  framing: string;
  roofing: string;
  other: string;
}

export interface OtherContractorsChecklist {
  electrician: string;
  plumber: string;
  concreter: string;
  flooring: string;
  painter: string;
}

export interface ElectricalCablingChecklist {
  wall: string;
  roof: string;
  fan: string;
}

export interface DownpipesChecklist {
  toGround: string;
  toSpreader: string;
  toExistingDP: string;
  toStormwater: string;
}


// ─── Technical Library Documents ────────────────────────────────────────────
export const techLibraryDocuments = mysqlTable("tech_library_documents", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  code: varchar("code", { length: 64 }).notNull(),
  description: text("description"),
  url: text("url").notNull(),
  updatedLabel: varchar("updatedLabel", { length: 64 }),
  active: boolean("active").default(true).notNull(),
  knowledgeSummary: text("knowledgeSummary"),
  knowledgeStatus: mysqlEnum("knowledgeStatus", ["success", "failed", "pending"]),
  knowledgeError: text("knowledgeError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TechLibraryDocument = typeof techLibraryDocuments.$inferSelect;
export type InsertTechLibraryDocument = typeof techLibraryDocuments.$inferInsert;

// ─── Practical Completion Notices ──────────────────────────────────────────
export const practicalCompletionNotices = mysqlTable("practical_completion_notices", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  noticeDate: timestamp("noticeDate").notNull(),
  ownerName: varchar("ownerName", { length: 255 }).notNull(),
  ownerAddress: text("ownerAddress"),
  jobNumber: varchar("jobNumber", { length: 64 }),
  // Builder details snapshot (from company settings at time of creation)
  builderCompanyName: varchar("builderCompanyName", { length: 255 }),
  builderTradingAs: varchar("builderTradingAs", { length: 255 }),
  builderAddress: text("builderAddress"),
  builderAbn: varchar("builderAbn", { length: 32 }),
  builderLicenceAct: varchar("builderLicenceAct", { length: 64 }),
  builderLicenceNsw: varchar("builderLicenceNsw", { length: 64 }),
  builderPhone: varchar("builderPhone", { length: 32 }),
  builderAccountsEmail: varchar("builderAccountsEmail", { length: 320 }),
  builderEmail: varchar("builderEmail", { length: 320 }),
  // Defects stored as JSON array
  defects: json("defects").$type<{ description: string; id: string }[]>().default([]),
  // Signatory (the user who creates/sends)
  signatoryName: varchar("signatoryName", { length: 255 }).notNull(),
  signatoryTitle: varchar("signatoryTitle", { length: 128 }),
  // Status tracking
  status: mysqlEnum("npcStatus", ["draft", "sent", "acknowledged", "builder_signing", "builder_signed", "sent_to_client", "completed"]).default("draft").notNull(),
  pdfUrl: text("pdfUrl"),
  sentAt: timestamp("sentAt"),
  sentTo: varchar("sentTo", { length: 320 }),
  sentBy: int("sentBy").references(() => users.id),
  // SignWell fields
  signwellDocumentId: varchar("signwellDocumentId", { length: 255 }),
  signwellStatus: varchar("signwellStatus", { length: 64 }).default("none"),
  signwellSentAt: timestamp("signwellSentAt"),
  signwellCompletedAt: timestamp("signwellCompletedAt"),
  signedPdfUrl: text("signedPdfUrl"),
  builderSignedAt: timestamp("builderSignedAt"),
  clientSignedAt: timestamp("clientSignedAt"),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PracticalCompletionNotice = typeof practicalCompletionNotices.$inferSelect;
export type InsertPracticalCompletionNotice = typeof practicalCompletionNotices.$inferInsert;


// ─── WH&S SWMS Documents ──────────────────────────────────────────────────
export const swmsDocuments = mysqlTable("swms_documents", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  fileUrl: text("fileUrl").notNull(),
  fileName: varchar("fileName", { length: 255 }),
  showOnTradePortal: boolean("showOnTradePortal").default(false).notNull(),
  showOnClientPortal: boolean("showOnClientPortal").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SwmsDocument = typeof swmsDocuments.$inferSelect;
export type InsertSwmsDocument = typeof swmsDocuments.$inferInsert;

// ─── Site Inductions ──────────────────────────────────────────────────────
export const siteInductions = mysqlTable("site_inductions", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  installerId: int("installerId").notNull().references(() => constructionInstallers.id, { onDelete: "cascade" }),
  // Contractor details (snapshot at time of induction)
  contractorName: varchar("contractorName", { length: 255 }).notNull(),
  contractorPhone: varchar("contractorPhone", { length: 64 }),
  contractorEmail: varchar("contractorEmail", { length: 320 }),
  // Medical / allergies
  medicalConditions: text("medicalConditions"),
  // Certificates section (JSON array: [{name, expiryDate, status: 'Y'|'N'|'NA'}])
  certificates: json("certificates"),
  // Site-specific issues checklist (JSON array: [{item, status: 'Y'|'N'|'NA'}])
  siteChecklist: json("siteChecklist"),
  // Acknowledgement
  inductedByName: varchar("inductedByName", { length: 255 }),
  inductedByUserId: int("inductedByUserId").references(() => users.id),
  // Status
  status: mysqlEnum("status", ["pending", "completed", "expired"]).default("pending").notNull(),
  completedAt: timestamp("completedAt"),
  // PDF record
  pdfUrl: text("pdfUrl"),
  // Notification tracking
  reminderSentAt: timestamp("reminderSentAt"),
  notifiedSupervisorAt: timestamp("notifiedSupervisorAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SiteInduction = typeof siteInductions.$inferSelect;
export type InsertSiteInduction = typeof siteInductions.$inferInsert;


// ─── Induction Form Configuration ──────────────────────────────────────────
export const inductionFormConfig = mysqlTable("induction_form_config", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  // Certificates section (JSON array of certificate names to check)
  certificates: json("certificates").$type<string[]>().default([
    "White Card (Construction Induction)",
    "Working at Heights",
    "First Aid Certificate",
    "Asbestos Awareness",
    "Confined Space",
    "Electrical Licence",
    "Plumbing Licence",
    "Other Trade Licence",
  ]),
  // Site-specific checklist items (JSON array of checklist item strings)
  checklistItems: json("checklistItems").$type<string[]>().default([
    "Identified site access and egress points",
    "Identified location of first aid kit",
    "Identified location of fire extinguisher",
    "Identified emergency assembly point",
    "Identified site-specific hazards (overhead power lines, underground services, etc.)",
    "Identified location of amenities (toilet, water)",
    "Reviewed site traffic management requirements",
    "Identified exclusion zones and barricaded areas",
    "Reviewed fall prevention requirements for this site",
    "Confirmed PPE requirements (hard hat, hi-vis, safety boots, glasses, gloves)",
    "Reviewed manual handling requirements",
    "Confirmed housekeeping responsibilities",
    "Identified noise and dust control measures",
    "Confirmed working hours and break times",
    "Reviewed hot work permit requirements (if applicable)",
  ]),
  // Site rules text (displayed as read-only for trades to acknowledge)
  siteRules: text("siteRules"),
  // Emergency procedures text
  emergencyProcedures: text("emergencyProcedures"),
  // Last updated tracking
  updatedBy: int("updatedBy").references(() => users.id),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_induction_form_config_tenant").on(table.tenantId),
  tenantUniqueIdx: uniqueIndex("uq_induction_form_config_tenant").on(table.tenantId),
}));
export type InductionFormConfig = typeof inductionFormConfig.$inferSelect;
export type InsertInductionFormConfig = typeof inductionFormConfig.$inferInsert;


// ─── Job Communications (Email & SMS log per job) ──────────────────────────
export const jobCommunications = mysqlTable("job_communications", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  type: mysqlEnum("type", ["email", "sms"]).notNull(),
  direction: mysqlEnum("direction", ["outbound", "inbound"]).default("outbound").notNull(),
  recipientName: varchar("recipientName", { length: 255 }),
  recipientContact: varchar("recipientContact", { length: 320 }), // email or phone
  subject: varchar("subject", { length: 500 }), // email subject (null for SMS)
  body: text("body").notNull(),
  templateId: int("templateId"), // reference to email or sms template used
  templateName: varchar("templateName", { length: 128 }),
  status: varchar("status", { length: 32 }).default("sent"),
  deliveredAt: timestamp("deliveredAt"),
  readAt: timestamp("readAt"),
  failedReason: varchar("failedReason", { length: 500 }),
  sentBy: int("sentBy").references(() => users.id),
  sentByName: varchar("sentByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type JobCommunication = typeof jobCommunications.$inferSelect;
export type InsertJobCommunication = typeof jobCommunications.$inferInsert;


// ─── Supplier Directory ────────────────────────────────────────────────────
export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  abn: varchar("abn", { length: 20 }),
  contactName: varchar("contactName", { length: 255 }),
  phone: varchar("phone", { length: 64 }),
  email: varchar("email", { length: 320 }),
  address: text("address"),
  category: varchar("category", { length: 128 }), // e.g. "Roofing", "Electrical", "Steel"
  supplierScope: varchar("supplierScope", { length: 32 }).default("construction").notNull(), // construction or manufacturing
  paymentTerms: varchar("paymentTerms", { length: 100 }), // e.g. "Net 30", "COD", "Net 14"
  defaultGlCode: varchar("defaultGlCode", { length: 50 }),
  notes: text("notes"),
  xeroContactId: varchar("xeroContactId", { length: 128 }), // Xero Contact UUID for dedup
  xeroConnectionId: int("xeroConnectionId").references(() => xeroConnections.id, { onDelete: "set null" }),
  xeroTenantId: varchar("xeroTenantId", { length: 128 }),
  lastXeroSyncAt: timestamp("lastXeroSyncAt"),
  tradePortalFlashingOrdersEnabled: boolean("tradePortalFlashingOrdersEnabled").default(false).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Supplier = typeof suppliers.$inferSelect;
export type InsertSupplier = typeof suppliers.$inferInsert;

// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIER CATEGORIES (multi-tag system)
// ═══════════════════════════════════════════════════════════════════════════
export const supplierCategories = mysqlTable("supplier_categories", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  name: varchar("name", { length: 128 }).notNull(),
  color: varchar("color", { length: 7 }).default("#6B7280"), // hex color for badge display
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SupplierCategory = typeof supplierCategories.$inferSelect;
export type InsertSupplierCategory = typeof supplierCategories.$inferInsert;

export const supplierCategoryAssignments = mysqlTable("supplier_category_assignments", {
  id: int("id").autoincrement().primaryKey(),
  supplierId: int("supplierId").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  categoryId: int("categoryId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  foreignKey({
    name: "fk_supplier_assignment_category",
    columns: [table.categoryId],
    foreignColumns: [supplierCategories.id],
  }).onDelete("cascade"),
]);
export type SupplierCategoryAssignment = typeof supplierCategoryAssignments.$inferSelect;

// ═══════════════════════════════════════════════════════════════════════════
// JOB SHARED FILES (admin shares documents with trades per job)
// ═══════════════════════════════════════════════════════════════════════════
export const jobSharedFiles = mysqlTable("job_shared_files", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  fileName: varchar("fileName", { length: 512 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }),
  fileType: varchar("fileType", { length: 128 }),
  fileSize: int("fileSize"),
  category: varchar("category", { length: 128 }),
  description: text("description"),
  uploadedBy: int("uploadedBy").references(() => users.id),
  visible: tinyint("visible").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type JobSharedFile = typeof jobSharedFiles.$inferSelect;
export type InsertJobSharedFile = typeof jobSharedFiles.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT FAVOURITES (Smartshop bookmarked products per user)
// ═══════════════════════════════════════════════════════════════════════════
export const productFavourites = mysqlTable("product_favourites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  spaCode: varchar("spaCode", { length: 100 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_user_cat_code").on(t.userId, t.category, t.spaCode),
]);
export type ProductFavourite = typeof productFavourites.$inferSelect;
export type InsertProductFavourite = typeof productFavourites.$inferInsert;


// ─── Component Catalogue Products (replaces Teable) ─────────────────────────
export const componentCatalogueProducts = mysqlTable("component_catalogue_products", {
  id: int("id").autoincrement().primaryKey(),
  category: varchar("category", { length: 100 }).notNull(),
  spaCode: varchar("spaCode", { length: 100 }).notNull(),
  description: text("description").notNull(),
  colour: varchar("colour", { length: 255 }).default(""),
  uom: varchar("uom", { length: 32 }).default(""),
  packQtySizes: varchar("packQtySizes", { length: 100 }).default(""),
  price: decimal("price", { precision: 12, scale: 2 }).default("0"),
  tags: text("tags").default(""),           // comma-separated tags e.g. "Roof,Wall,Deck"
  subGroup: varchar("subGroup", { length: 100 }).default(""), // e.g. "Beams", "Fasteners", "Single Skin"
  isActive: boolean("isActive").default(true).notNull(),
  colourInputAllowed: boolean("colourInputAllowed").default(false).notNull(),
  colourGroup: varchar("colourGroup", { length: 64 }).default(""),  // links to colour_groups.name for product-specific dropdown
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ComponentCatalogueProduct = typeof componentCatalogueProducts.$inferSelect;
export type InsertComponentCatalogueProduct = typeof componentCatalogueProducts.$inferInsert;

// ─── Smartshop Orders (replaces Teable Construction_Orders) ─────────────────
export const smartshopOrders = mysqlTable("smartshop_orders", {
  id: int("id").autoincrement().primaryKey(),
  orderNumber: int("orderNumber"),
  userId: int("userId").notNull().references(() => users.id),
  requestedBy: varchar("requestedBy", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }),
  jobNumber: varchar("jobNumber", { length: 128 }),
  locationRequired: varchar("locationRequired", { length: 500 }),
  dateRequired: varchar("dateRequired", { length: 32 }),
  status: mysqlEnum("status", ["submitted", "processing", "shipped", "delivered", "cancelled"]).default("submitted").notNull(),
  notes: text("notes"),
  totalExGst: decimal("totalExGst", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SmartshopOrder = typeof smartshopOrders.$inferSelect;
export type InsertSmartshopOrder = typeof smartshopOrders.$inferInsert;

// ─── Smartshop Order Lines (replaces Teable Construction_Order_Lines) ────────
export const smartshopOrderLines = mysqlTable("smartshop_order_lines", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => smartshopOrders.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 100 }).notNull(),
  spaCode: varchar("spaCode", { length: 100 }).notNull(),
  description: text("description").notNull(),
  colour: varchar("colour", { length: 255 }).default(""),
  requiredColour: varchar("requiredColour", { length: 255 }).default(""),
  uom: varchar("uom", { length: 32 }).default(""),
  packQtySizes: varchar("packQtySizes", { length: 100 }).default(""),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).default("0"),
  quantity: int("quantity").default(1).notNull(),
  lineNotes: text("lineNotes"),
  lineTotal: decimal("lineTotal", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SmartshopOrderLine = typeof smartshopOrderLines.$inferSelect;
export type InsertSmartshopOrderLine = typeof smartshopOrderLines.$inferInsert;

// ─── Smartshop Order Drafts (working component order sheets) ────────────────
export const smartshopOrderDrafts = mysqlTable("smartshop_order_drafts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  jobNumber: varchar("jobNumber", { length: 128 }),
  payload: json("payload").$type<Record<string, any>>().notNull(),
  lineCount: int("lineCount").default(0).notNull(),
  totalExGst: decimal("totalExGst", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_smartshop_order_drafts_tenant_user").on(table.tenantId, table.userId),
  index("idx_smartshop_order_drafts_tenant_updated").on(table.tenantId, table.updatedAt),
  index("idx_smartshop_order_drafts_tenant_job").on(table.tenantId, table.jobNumber),
]);
export type SmartshopOrderDraft = typeof smartshopOrderDrafts.$inferSelect;
export type InsertSmartshopOrderDraft = typeof smartshopOrderDrafts.$inferInsert;

// ─── Flashing Orders ───────────────────────────────────────────────────────
export const flashingOrders = mysqlTable("flashing_orders", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderNumber: varchar("orderNumber", { length: 64 }).notNull(),
  jobId: int("jobId").references(() => constructionJobs.id, { onDelete: "set null" }),
  jobNumber: varchar("jobNumber", { length: 128 }),
  clientName: varchar("clientName", { length: 255 }),
  siteAddress: text("siteAddress"),
  supplierId: int("supplierId").references(() => suppliers.id, { onDelete: "set null" }),
  supplierName: varchar("supplierName", { length: 255 }),
  requestedByUserId: int("requestedByUserId").references(() => users.id, { onDelete: "set null" }),
  requestedByName: varchar("requestedByName", { length: 255 }),
  requestedByEmail: varchar("requestedByEmail", { length: 320 }),
  deliveryMethod: varchar("deliveryMethod", { length: 64 }).default("pickup"),
  requestedDeliveryAt: timestamp("requestedDeliveryAt"),
  status: mysqlEnum("status", ["draft", "submitted", "supplier_received", "in_production", "purchase_ordered", "ready", "completed", "cancelled", "archived"]).default("draft").notNull(),
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
  lineCount: int("lineCount").default(0).notNull(),
  totalGirthMm: decimal("totalGirthMm", { precision: 12, scale: 2 }).default("0"),
  totalLinealMetres: decimal("totalLinealMetres", { precision: 12, scale: 2 }).default("0"),
  totalExGst: decimal("totalExGst", { precision: 12, scale: 2 }).default("0"),
  siteNotes: text("siteNotes"),
  internalNotes: text("internalNotes"),
  attachments: json("attachments").$type<Array<Record<string, any>>>().default([]),
  submittedAt: timestamp("submittedAt"),
  createdBy: int("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("uq_flashing_orders_tenant_number").on(table.tenantId, table.orderNumber),
  index("idx_flashing_orders_tenant_status").on(table.tenantId, table.status),
  index("idx_flashing_orders_tenant_job").on(table.tenantId, table.jobId),
  index("idx_flashing_orders_tenant_updated").on(table.tenantId, table.updatedAt),
]);
export type FlashingOrder = typeof flashingOrders.$inferSelect;
export type InsertFlashingOrder = typeof flashingOrders.$inferInsert;

export const flashingOrderLines = mysqlTable("flashing_order_lines", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderId: int("orderId").notNull().references(() => flashingOrders.id, { onDelete: "cascade" }),
  templateId: int("templateId"),
  lineNumber: int("lineNumber").default(1).notNull(),
  profileName: varchar("profileName", { length: 255 }).notNull(),
  category: varchar("category", { length: 128 }).default("custom"),
  materialType: varchar("materialType", { length: 128 }).default("Colorbond"),
  gauge: varchar("gauge", { length: 64 }),
  colour: varchar("colour", { length: 128 }),
  colourSide: mysqlEnum("colourSide", ["inside", "outside", "both", "unspecified"]).default("unspecified").notNull(),
  finish: varchar("finish", { length: 128 }),
  quantity: int("quantity").default(1).notNull(),
  lengthMm: decimal("lengthMm", { precision: 12, scale: 2 }).default("0"),
  totalLinealMetres: decimal("totalLinealMetres", { precision: 12, scale: 2 }).default("0"),
  girthMm: decimal("girthMm", { precision: 12, scale: 2 }).default("0"),
  bendCount: int("bendCount").default(0).notNull(),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).default("0"),
  lineTotal: decimal("lineTotal", { precision: 12, scale: 2 }).default("0"),
  geometry: json("geometry").$type<Record<string, any>>().notNull(),
  foldDetails: json("foldDetails").$type<Record<string, any>>().default({}),
  manufacturingNotes: text("manufacturingNotes"),
  status: mysqlEnum("status", ["draft", "ready", "needs_clarification", "approved", "in_production", "completed", "cancelled"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_flashing_order_lines_order").on(table.orderId),
  index("idx_flashing_order_lines_tenant").on(table.tenantId),
  index("idx_flashing_order_lines_tenant_status").on(table.tenantId, table.status),
]);
export type FlashingOrderLine = typeof flashingOrderLines.$inferSelect;
export type InsertFlashingOrderLine = typeof flashingOrderLines.$inferInsert;

export const flashingProfileTemplates = mysqlTable("flashing_profile_templates", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 128 }).default("custom"),
  geometry: json("geometry").$type<Record<string, any>>().notNull(),
  defaultMaterialType: varchar("defaultMaterialType", { length: 128 }),
  defaultGauge: varchar("defaultGauge", { length: 64 }),
  defaultColour: varchar("defaultColour", { length: 128 }),
  defaultColourSide: mysqlEnum("defaultColourSide", ["inside", "outside", "both", "unspecified"]).default("unspecified").notNull(),
  defaultQuantity: int("defaultQuantity").default(1).notNull(),
  defaultLengthMm: decimal("defaultLengthMm", { precision: 12, scale: 2 }).default("0"),
  supplierCompatibility: text("supplierCompatibility"),
  notes: text("notes"),
  tags: text("tags"),
  version: int("version").default(1).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdBy: int("createdBy").references(() => users.id, { onDelete: "set null" }),
  lastUsedAt: timestamp("lastUsedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_flashing_templates_tenant_category").on(table.tenantId, table.category),
  index("idx_flashing_templates_tenant_active").on(table.tenantId, table.isActive),
]);
export type FlashingProfileTemplate = typeof flashingProfileTemplates.$inferSelect;
export type InsertFlashingProfileTemplate = typeof flashingProfileTemplates.$inferInsert;

export const flashingOrderStatusHistory = mysqlTable("flashing_order_status_history", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  orderId: int("orderId").notNull().references(() => flashingOrders.id, { onDelete: "cascade" }),
  fromStatus: varchar("fromStatus", { length: 64 }),
  toStatus: varchar("toStatus", { length: 64 }).notNull(),
  notes: text("notes"),
  changedByUserId: int("changedByUserId").references(() => users.id, { onDelete: "set null" }),
  changedByName: varchar("changedByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_flashing_status_history_order").on(table.orderId),
  index("idx_flashing_status_history_tenant").on(table.tenantId),
]);
export type FlashingOrderStatusHistory = typeof flashingOrderStatusHistory.$inferSelect;
export type InsertFlashingOrderStatusHistory = typeof flashingOrderStatusHistory.$inferInsert;

// ─── Smartshop Order Status History (Audit Log) ─────────────────────────────
export const smartshopOrderStatusHistory = mysqlTable("smartshop_order_status_history", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => smartshopOrders.id, { onDelete: "cascade" }),
  fromStatus: varchar("fromStatus", { length: 32 }).notNull(),
  toStatus: varchar("toStatus", { length: 32 }).notNull(),
  changedByUserId: int("changedByUserId").notNull().references(() => users.id),
  changedByName: varchar("changedByName", { length: 255 }).notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SmartshopOrderStatusHistory = typeof smartshopOrderStatusHistory.$inferSelect;
export type InsertSmartshopOrderStatusHistory = typeof smartshopOrderStatusHistory.$inferInsert;


// ─── Order Templates (Kits) ─────────────────────────────────────────────────
export const orderTemplates = mysqlTable("order_templates", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  tag: varchar("tag", { length: 100 }).default(""),
  createdBy: int("createdBy").notNull().references(() => users.id),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_order_templates_tenant").on(table.tenantId),
  index("idx_order_templates_tenant_active").on(table.tenantId, table.isActive),
]);
export type OrderTemplate = typeof orderTemplates.$inferSelect;
export type InsertOrderTemplate = typeof orderTemplates.$inferInsert;

// ─── Order Template Items ───────────────────────────────────────────────────
export const orderTemplateItems = mysqlTable("order_template_items", {
  id: int("id").autoincrement().primaryKey(),
  templateId: int("templateId").notNull().references(() => orderTemplates.id, { onDelete: "cascade" }),
  catalogueProductId: int("catalogueProductId"),
  spaCode: varchar("spaCode", { length: 100 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  colour: varchar("colour", { length: 255 }).default(""),
  uom: varchar("uom", { length: 32 }).default(""),
  defaultQuantity: int("defaultQuantity").default(1).notNull(),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  foreignKey({
    name: "fk_order_item_catalogue_product",
    columns: [table.catalogueProductId],
    foreignColumns: [componentCatalogueProducts.id],
  }),
]);
export type OrderTemplateItem = typeof orderTemplateItems.$inferSelect;
export type InsertOrderTemplateItem = typeof orderTemplateItems.$inferInsert;

// ─── Plans & Approvals ───────────────────────────────────────────────────────
export const constructionPlans = mysqlTable("construction_plans", {
  id: int("id").autoincrement().primaryKey(),
  jobId: int("jobId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  version: int("version").default(1).notNull(),
  parentPlanId: int("parentPlanId"), // links to previous version of same plan
  fileUrl: text("fileUrl").notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileType: varchar("fileType", { length: 100 }),
  status: mysqlEnum("status", [
    "draft",
    "submitted_to_client",
    "client_approved",
    "client_rejected",
    "submitted_to_council",
    "council_approved",
    "council_rejected",
    "archived",
  ]).default("draft").notNull(),
  category: varchar("category", { length: 100 }),
  thumbnailUrl: text("thumbnailUrl"),
  uploadedBy: int("uploadedBy").notNull(),
  submittedAt: timestamp("submittedAt"),
  approvedAt: timestamp("approvedAt"),
  rejectedAt: timestamp("rejectedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ConstructionPlan = typeof constructionPlans.$inferSelect;
export type InsertConstructionPlan = typeof constructionPlans.$inferInsert;

export const constructionPlanComments = mysqlTable("construction_plan_comments", {
  id: int("id").autoincrement().primaryKey(),
  planId: int("planId").notNull(),
  userId: int("userId"),
  portalClientId: int("portalClientId"),
  userType: mysqlEnum("userType", ["staff", "client"]).default("staff").notNull(),
  comment: text("comment").notNull(),
  attachmentUrl: text("attachmentUrl"),
  attachmentKey: varchar("attachmentKey", { length: 512 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ConstructionPlanComment = typeof constructionPlanComments.$inferSelect;
export type InsertConstructionPlanComment = typeof constructionPlanComments.$inferInsert;

export const constructionPlanAuditLog = mysqlTable("construction_plan_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  planId: int("planId").notNull(),
  jobId: int("jobId").notNull(),
  action: varchar("action", { length: 100 }).notNull(), // uploaded, submitted_to_client, client_approved, client_rejected, submitted_to_council, council_approved, council_rejected, archived, comment_added
  fromStatus: varchar("fromStatus", { length: 100 }),
  toStatus: varchar("toStatus", { length: 100 }),
  performedBy: int("performedBy"),
  performedByType: mysqlEnum("performedByType", ["staff", "client", "system"]).default("staff").notNull(),
  performedByName: varchar("performedByName", { length: 255 }),
  details: text("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ConstructionPlanAuditLog = typeof constructionPlanAuditLog.$inferSelect;
export type InsertConstructionPlanAuditLog = typeof constructionPlanAuditLog.$inferInsert;

// ─── Plan Conversions (Hand-Drawn to Architectural) ─────────────────────────
export const planConversions = mysqlTable("plan_conversions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  userId: int("userId").notNull(),
  jobId: int("jobId"),
  clientName: varchar("clientName", { length: 255 }),
  siteAddress: text("siteAddress"),
  projectTitle: varchar("projectTitle", { length: 255 }),
  diagramType: mysqlEnum("diagramType", ["floor_plan", "elevation_front", "elevation_side", "elevation_rear"]).default("floor_plan").notNull(),
  scale: varchar("scale", { length: 32 }).default("1:100"),
  status: mysqlEnum("conversionStatus", ["uploaded", "extracting", "review", "confirmed", "generated"]).default("uploaded").notNull(),
  uploadedImageUrl: text("uploadedImageUrl"),
  uploadedImageKey: varchar("uploadedImageKey", { length: 512 }),
  extractedData: json("extractedData"),
  confirmedData: json("confirmedData"),
  generatedPdfUrl: text("generatedPdfUrl"),
  generatedPdfKey: varchar("generatedPdfKey", { length: 512 }),
  notes: text("notes"),
  drawnBy: varchar("drawnBy", { length: 128 }),
  revision: varchar("revision", { length: 16 }).default("A"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_plan_conversions_tenant").on(table.tenantId),
  tenantUserIdx: index("idx_plan_conversions_tenant_user").on(table.tenantId, table.userId),
  tenantJobIdx: index("idx_plan_conversions_tenant_job").on(table.tenantId, table.jobId),
}));
export type PlanConversion = typeof planConversions.$inferSelect;
export type InsertPlanConversion = typeof planConversions.$inferInsert;

export const planConversionElements = mysqlTable("plan_conversion_elements", {
  id: int("id").autoincrement().primaryKey(),
  conversionId: int("conversionId").notNull(),
  elementType: mysqlEnum("elementType", ["post", "beam", "wall_existing", "wall_new", "opening", "dimension", "annotation", "roof_line", "gutter", "fascia"]).notNull(),
  elementNumber: varchar("elementNumber", { length: 16 }),
  label: varchar("label", { length: 128 }),
  size: varchar("size", { length: 64 }),
  material: varchar("material", { length: 64 }),
  colour: varchar("colour", { length: 64 }),
  x1: double("x1"),
  y1: double("y1"),
  x2: double("x2"),
  y2: double("y2"),
  width: double("width"),
  height: double("height"),
  rotation: double("rotation").default(0),
  connectionType: varchar("connectionType", { length: 16 }),
  bracketCode: varchar("bracketCode", { length: 32 }),
  bracketName: varchar("bracketName", { length: 128 }),
  metadata: json("metadata"),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PlanConversionElement = typeof planConversionElements.$inferSelect;
export type InsertPlanConversionElement = typeof planConversionElements.$inferInsert;


// ─── Product & Component Images ──────────────────────────────────────────────
export const productImages = mysqlTable("product_images", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  category: varchar("category", { length: 64 }).notNull(), // 'bracket', 'connection', 'product', 'component'
  code: varchar("code", { length: 64 }).notNull(), // bracket code (EXT-STD) or connection type (BCH) or product code
  name: varchar("name", { length: 255 }).notNull(), // human-readable name
  description: text("description"), // what the image shows
  imageUrl: text("imageUrl").notNull(), // /manus-storage/... path
  sourceDocument: varchar("sourceDocument", { length: 255 }), // which tech library doc it came from
  pageNumber: int("pageNumber"), // page in the source document
  tags: json("tags").$type<string[]>(), // searchable tags
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_product_images_tenant").on(table.tenantId),
  index("idx_product_images_tenant_category").on(table.tenantId, table.category),
  index("idx_product_images_tenant_code").on(table.tenantId, table.code),
]);
export type ProductImage = typeof productImages.$inferSelect;
export type InsertProductImage = typeof productImages.$inferInsert;


// ─── Push Subscriptions ─────────────────────────────────────────────────────
export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  // For main app users
  userId: int("userId"),
  // For portal users (client or trade)
  portalType: mysqlEnum("portalType", ["client", "trade"]),
  portalAccessId: int("portalAccessId"),
  // Push subscription data
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  // Metadata
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;


// ─── Spec Section Templates (admin-managed) ────────────────────────────────
export const specSectionTemplates = mysqlTable("spec_section_templates", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  hiddenSections: json("hiddenSections").notNull(), // string[] of section IDs to hide
  sectionOrder: json("sectionOrder"), // string[] custom order (null = default)
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_spec_section_templates_tenant").on(table.tenantId),
]);
export type SpecSectionTemplate = typeof specSectionTemplates.$inferSelect;
export type InsertSpecSectionTemplate = typeof specSectionTemplates.$inferInsert;


// ─── Weather Data ─────────────────────────────────────────────────────────────
export const weatherHistory = mysqlTable("weather_history", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenantId").references(() => tenants.id),
  locationName: varchar("locationName", { length: 128 }).notNull(), // e.g. "Canberra", "Goulburn", or postcode "2600"
  latitude: decimal("latitude", { precision: 8, scale: 5 }).notNull(),
  longitude: decimal("longitude", { precision: 8, scale: 5 }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  tempMax: decimal("tempMax", { precision: 4, scale: 1 }),
  tempMin: decimal("tempMin", { precision: 4, scale: 1 }),
  precipitation: decimal("precipitation", { precision: 5, scale: 1 }), // mm
  windSpeedMax: decimal("windSpeedMax", { precision: 5, scale: 1 }), // km/h
  weatherCode: int("weatherCode"), // WMO code
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  tenantLocationDateIdx: index("idx_weather_history_tenant_location_date").on(table.tenantId, table.locationName, table.date),
}));
export type WeatherHistory = typeof weatherHistory.$inferSelect;
export type InsertWeatherHistory = typeof weatherHistory.$inferInsert;

export const weatherForecastCache = mysqlTable("weather_forecast_cache", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenantId").references(() => tenants.id),
  locationKey: varchar("locationKey", { length: 128 }).notNull(), // postcode or location name
  latitude: decimal("latitude", { precision: 8, scale: 5 }).notNull(),
  longitude: decimal("longitude", { precision: 8, scale: 5 }).notNull(),
  forecastJson: text("forecastJson").notNull(), // JSON array of 7-day forecast
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
}, (table) => ({
  tenantLocationIdx: index("idx_weather_forecast_cache_tenant_location").on(table.tenantId, table.locationKey),
}));
export type WeatherForecastCache = typeof weatherForecastCache.$inferSelect;
export type InsertWeatherForecastCache = typeof weatherForecastCache.$inferInsert;

// ─── DA Zone Assignments (for automatic lead assignment by suburb/postcode) ──
export const daZoneAssignments = mysqlTable("da_zone_assignments", {
  id: int("id").autoincrement().primaryKey(),
  designAdvisorName: varchar("designAdvisorName", { length: 100 }).notNull(), // e.g. "Adam Cameron"
  designAdvisorEmail: varchar("designAdvisorEmail", { length: 320 }), // optional: for lookup
  postcodeLow: varchar("postcodeLow", { length: 16 }).notNull(), // e.g. "2620"
  postcodeHigh: varchar("postcodeHigh", { length: 16 }).notNull(), // e.g. "2680"
  state: varchar("state", { length: 32 }).notNull(), // e.g. "NSW", "ACT"
  suburbs: text("suburbs"), // optional: JSON array of specific suburbs, or null for all in range
  priority: int("priority").default(0), // higher priority = matched first
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DaZoneAssignment = typeof daZoneAssignments.$inferSelect;
export type InsertDaZoneAssignment = typeof daZoneAssignments.$inferInsert;

// ─── Security Screens Pricing & Quotes ──────────────────────────────────────
export const ssPricingSettings = mysqlTable("ss_pricing_settings", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  defaultMarkupPercent: decimal("defaultMarkupPercent", { precision: 5, scale: 2 }).default("30.00").notNull(),
  updatedBy: int("updatedBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("uq_ss_pricing_settings_tenant").on(table.tenantId),
  index("idx_ss_pricing_settings_tenant").on(table.tenantId),
]);
export type SsPricingSettings = typeof ssPricingSettings.$inferSelect;
export type InsertSsPricingSettings = typeof ssPricingSettings.$inferInsert;

export const ssPricingMatrix = mysqlTable("ss_pricing_matrix", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  brand: varchar("brand", { length: 64 }).notNull(),
  productType: varchar("productType", { length: 64 }).notNull(),
  heightMm: int("heightMm").notNull(),
  widthMm: int("widthMm").notNull(),
  priceIncGst: decimal("priceIncGst", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_ss_matrix_tenant_brand_type").on(table.tenantId, table.brand, table.productType),
  uniqueIndex("uq_ss_matrix_tenant_size").on(table.tenantId, table.brand, table.productType, table.heightMm, table.widthMm),
]);
export type SsPricingMatrix = typeof ssPricingMatrix.$inferSelect;
export type InsertSsPricingMatrix = typeof ssPricingMatrix.$inferInsert;

export const ssPriceAdjustments = mysqlTable("ss_price_adjustments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  effectiveDate: varchar("effectiveDate", { length: 10 }).notNull(),
  percentageIncrease: decimal("percentageIncrease", { precision: 6, scale: 2 }).notNull(),
  description: text("description"),
  createdBy: int("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_ss_adjustments_tenant_date").on(table.tenantId, table.effectiveDate),
]);
export type SsPriceAdjustment = typeof ssPriceAdjustments.$inferSelect;
export type InsertSsPriceAdjustment = typeof ssPriceAdjustments.$inferInsert;

export const ssCostAdditions = mysqlTable("ss_cost_additions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  cost: decimal("cost", { precision: 12, scale: 2 }).notNull(),
  uom: varchar("uom", { length: 32 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_ss_costs_tenant_category").on(table.tenantId, table.category),
]);
export type SsCostAddition = typeof ssCostAdditions.$inferSelect;
export type InsertSsCostAddition = typeof ssCostAdditions.$inferInsert;

export const ssProductOptions = mysqlTable("ss_product_options", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 64 }).notNull(),
  orderCode: varchar("orderCode", { length: 100 }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  brand: varchar("brand", { length: 64 }),
  costPrice: decimal("costPrice", { precision: 12, scale: 2 }).notNull(),
  sellPrice: decimal("sellPrice", { precision: 12, scale: 2 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_ss_options_tenant_category").on(table.tenantId, table.category),
]);
export type SsProductOption = typeof ssProductOptions.$inferSelect;
export type InsertSsProductOption = typeof ssProductOptions.$inferInsert;

export const ssGlassInfill = mysqlTable("ss_glass_infill", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  glassType: varchar("glassType", { length: 128 }).notNull(),
  description: text("description"),
  cost: decimal("cost", { precision: 12, scale: 2 }).notNull(),
  uom: varchar("uom", { length: 32 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_ss_glass_tenant").on(table.tenantId),
]);
export type SsGlassInfill = typeof ssGlassInfill.$inferSelect;
export type InsertSsGlassInfill = typeof ssGlassInfill.$inferInsert;

export const ssColours = mysqlTable("ss_colours", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  hexCode: varchar("hexCode", { length: 16 }).notNull(),
  colorbondName: varchar("colorbondName", { length: 128 }),
  surchargePercent: decimal("surchargePercent", { precision: 5, scale: 2 }).default("0.00").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
}, (table) => [
  index("idx_ss_colours_tenant_sort").on(table.tenantId, table.sortOrder),
]);
export type SsColour = typeof ssColours.$inferSelect;
export type InsertSsColour = typeof ssColours.$inferInsert;

export const ssQuotes = mysqlTable("ss_quotes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  quoteNumber: varchar("quoteNumber", { length: 32 }).notNull(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientEmail: varchar("clientEmail", { length: 320 }),
  clientPhone: varchar("clientPhone", { length: 64 }),
  siteAddress: text("siteAddress"),
  markupPercent: decimal("markupPercent", { precision: 5, scale: 2 }).default("30.00").notNull(),
  status: mysqlEnum("status", ["draft", "sent", "accepted", "declined", "expired"]).default("draft").notNull(),
  subtotalExGst: decimal("subtotalExGst", { precision: 12, scale: 2 }).default("0.00").notNull(),
  gstAmount: decimal("gstAmount", { precision: 12, scale: 2 }).default("0.00").notNull(),
  totalIncGst: decimal("totalIncGst", { precision: 12, scale: 2 }).default("0.00").notNull(),
  notes: text("notes"),
  leadId: int("leadId").references(() => crmLeads.id, { onDelete: "set null" }),
  createdBy: int("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("uq_ss_quote_tenant_number").on(table.tenantId, table.quoteNumber),
  index("idx_ss_quotes_tenant_status").on(table.tenantId, table.status),
  index("idx_ss_quotes_lead").on(table.leadId),
]);
export type SsQuote = typeof ssQuotes.$inferSelect;
export type InsertSsQuote = typeof ssQuotes.$inferInsert;

export const ssQuoteItems = mysqlTable("ss_quote_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  quoteId: int("quoteId").notNull().references(() => ssQuotes.id, { onDelete: "cascade" }),
  itemNumber: int("itemNumber").notNull(),
  brand: varchar("brand", { length: 64 }).notNull(),
  productType: varchar("productType", { length: 64 }).notNull(),
  widthMm: int("widthMm").notNull(),
  heightMm: int("heightMm").notNull(),
  quantity: int("quantity").default(1).notNull(),
  colourId: int("colourId").references(() => ssColours.id, { onDelete: "set null" }),
  colourName: varchar("colourName", { length: 128 }),
  handleSide: varchar("handleSide", { length: 32 }),
  hingeSide: varchar("hingeSide", { length: 32 }),
  openingDirection: varchar("openingDirection", { length: 32 }),
  hingePosition: varchar("hingePosition", { length: 32 }),
  glassInfillId: int("glassInfillId").references(() => ssGlassInfill.id, { onDelete: "set null" }),
  glassInfillQuantity: decimal("glassInfillQuantity", { precision: 10, scale: 2 }).default("1.00").notNull(),
  photoUrl: text("photoUrl"),
  notes: text("notes"),
  basePriceIncGst: decimal("basePriceIncGst", { precision: 12, scale: 2 }).default("0.00").notNull(),
  adjustedPrice: decimal("adjustedPrice", { precision: 12, scale: 2 }).default("0.00").notNull(),
  optionsTotal: decimal("optionsTotal", { precision: 12, scale: 2 }).default("0.00").notNull(),
  lineTotalExGst: decimal("lineTotalExGst", { precision: 12, scale: 2 }).default("0.00").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_ss_items_tenant_quote").on(table.tenantId, table.quoteId),
  index("idx_ss_items_quote").on(table.quoteId),
]);
export type SsQuoteItem = typeof ssQuoteItems.$inferSelect;
export type InsertSsQuoteItem = typeof ssQuoteItems.$inferInsert;

export const ssQuoteItemOptions = mysqlTable("ss_quote_item_options", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  quoteItemId: int("quoteItemId").notNull().references(() => ssQuoteItems.id, { onDelete: "cascade" }),
  productOptionId: int("productOptionId").references(() => ssProductOptions.id, { onDelete: "set null" }),
  quantity: int("quantity").default(1).notNull(),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull(),
  lineTotal: decimal("lineTotal", { precision: 12, scale: 2 }).notNull(),
}, (table) => [
  index("idx_ss_item_options_tenant_item").on(table.tenantId, table.quoteItemId),
]);
export type SsQuoteItemOption = typeof ssQuoteItemOptions.$inferSelect;
export type InsertSsQuoteItemOption = typeof ssQuoteItemOptions.$inferInsert;

export const ssQuoteCostAdditions = mysqlTable("ss_quote_cost_additions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  quoteId: int("quoteId").notNull().references(() => ssQuotes.id, { onDelete: "cascade" }),
  costAdditionId: int("costAdditionId").references(() => ssCostAdditions.id, { onDelete: "set null" }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).default("1.00").notNull(),
  unitCost: decimal("unitCost", { precision: 12, scale: 2 }).notNull(),
  lineTotal: decimal("lineTotal", { precision: 12, scale: 2 }).notNull(),
}, (table) => [
  index("idx_ss_quote_costs_tenant_quote").on(table.tenantId, table.quoteId),
]);
export type SsQuoteCostAddition = typeof ssQuoteCostAdditions.$inferSelect;
export type InsertSsQuoteCostAddition = typeof ssQuoteCostAdditions.$inferInsert;

// ─── Blinds Pricing & Quotes ──────────────────────────────────────
export const blindPricingSettings = mysqlTable("blind_pricing_settings", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  defaultMarkupPercent: decimal("defaultMarkupPercent", { precision: 5, scale: 2 }).default("30.00").notNull(),
  updatedBy: int("updatedBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("uq_blind_pricing_settings_tenant").on(table.tenantId),
  index("idx_blind_pricing_settings_tenant").on(table.tenantId),
]);
export type BlindPricingSettings = typeof blindPricingSettings.$inferSelect;
export type InsertBlindPricingSettings = typeof blindPricingSettings.$inferInsert;

export const blindPricingMatrix = mysqlTable("blind_pricing_matrix", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  brand: varchar("brand", { length: 64 }).notNull(),
  productType: varchar("productType", { length: 64 }).notNull(),
  fabricCategory: varchar("fabricCategory", { length: 64 }),
  fabricCategoryNumber: varchar("fabricCategoryNumber", { length: 16 }),
  categoryFabrics: text("categoryFabrics"),
  heightMm: int("heightMm").notNull(),
  widthMm: int("widthMm").notNull(),
  discountedCost: decimal("discountedCost", { precision: 12, scale: 2 }),
  supplierListPrice: decimal("supplierListPrice", { precision: 12, scale: 2 }),
  priceIncGst: decimal("priceIncGst", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_blind_matrix_tenant_brand_type").on(table.tenantId, table.brand, table.productType),
  index("idx_blind_matrix_tenant_type_category").on(table.tenantId, table.productType, table.fabricCategoryNumber),
  uniqueIndex("uq_blind_matrix_tenant_size").on(table.tenantId, table.brand, table.productType, table.heightMm, table.widthMm),
]);
export type BlindPricingMatrix = typeof blindPricingMatrix.$inferSelect;
export type InsertBlindPricingMatrix = typeof blindPricingMatrix.$inferInsert;

export const blindPriceAdjustments = mysqlTable("blind_price_adjustments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  effectiveDate: varchar("effectiveDate", { length: 10 }).notNull(),
  percentageIncrease: decimal("percentageIncrease", { precision: 6, scale: 2 }).notNull(),
  description: text("description"),
  createdBy: int("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_blind_adjustments_tenant_date").on(table.tenantId, table.effectiveDate),
]);
export type BlindPriceAdjustment = typeof blindPriceAdjustments.$inferSelect;
export type InsertBlindPriceAdjustment = typeof blindPriceAdjustments.$inferInsert;

export const blindCostAdditions = mysqlTable("blind_cost_additions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  cost: decimal("cost", { precision: 12, scale: 2 }).notNull(),
  uom: varchar("uom", { length: 32 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_blind_costs_tenant_category").on(table.tenantId, table.category),
]);
export type BlindCostAddition = typeof blindCostAdditions.$inferSelect;
export type InsertBlindCostAddition = typeof blindCostAdditions.$inferInsert;

export const blindProductOptions = mysqlTable("blind_product_options", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 64 }).notNull(),
  orderCode: varchar("orderCode", { length: 100 }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  brand: varchar("brand", { length: 64 }),
  costPrice: decimal("costPrice", { precision: 12, scale: 2 }).notNull(),
  sellPrice: decimal("sellPrice", { precision: 12, scale: 2 }).notNull(),
  priceUnit: varchar("priceUnit", { length: 32 }),
  metadata: json("metadata").$type<Record<string, any>>(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_blind_options_tenant_category").on(table.tenantId, table.category),
  uniqueIndex("uq_blind_options_tenant_category_name").on(table.tenantId, table.category, table.name),
]);
export type BlindProductOption = typeof blindProductOptions.$inferSelect;
export type InsertBlindProductOption = typeof blindProductOptions.$inferInsert;

export const blindGlassInfill = mysqlTable("blind_glass_infill", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  glassType: varchar("glassType", { length: 128 }).notNull(),
  categoryName: varchar("categoryName", { length: 64 }),
  categoryNumber: varchar("categoryNumber", { length: 16 }),
  fabricBrand: varchar("fabricBrand", { length: 128 }),
  fabricType: varchar("fabricType", { length: 128 }),
  fabricWidth: varchar("fabricWidth", { length: 64 }),
  description: text("description"),
  cost: decimal("cost", { precision: 12, scale: 2 }).notNull(),
  uom: varchar("uom", { length: 32 }).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_blind_glass_tenant").on(table.tenantId),
  index("idx_blind_glass_tenant_category").on(table.tenantId, table.categoryNumber),
  uniqueIndex("uq_blind_glass_tenant_category_type").on(table.tenantId, table.categoryNumber, table.glassType),
]);
export type BlindGlassInfill = typeof blindGlassInfill.$inferSelect;
export type InsertBlindGlassInfill = typeof blindGlassInfill.$inferInsert;

export const blindColours = mysqlTable("blind_colours", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  hexCode: varchar("hexCode", { length: 16 }).notNull(),
  colorbondName: varchar("colorbondName", { length: 128 }),
  surchargePercent: decimal("surchargePercent", { precision: 5, scale: 2 }).default("0.00").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
}, (table) => [
  index("idx_blind_colours_tenant_sort").on(table.tenantId, table.sortOrder),
]);
export type BlindColour = typeof blindColours.$inferSelect;
export type InsertBlindColour = typeof blindColours.$inferInsert;

export const blindFabricColours = mysqlTable("blind_fabric_colours", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  fabricRangeId: int("fabricRangeId").references(() => blindGlassInfill.id, { onDelete: "set null" }),
  fabricRangeName: varchar("fabricRangeName", { length: 128 }),
  categoryNumber: varchar("categoryNumber", { length: 16 }),
  name: varchar("name", { length: 128 }).notNull(),
  hexCode: varchar("hexCode", { length: 16 }),
  swatchUrl: varchar("swatchUrl", { length: 255 }),
  isActive: boolean("isActive").default(true).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_blind_fabric_colours_tenant_category").on(table.tenantId, table.categoryNumber),
  index("idx_blind_fabric_colours_tenant_range").on(table.tenantId, table.fabricRangeId),
  uniqueIndex("uq_blind_fabric_colours_tenant_range_name").on(table.tenantId, table.fabricRangeId, table.name),
]);
export type BlindFabricColour = typeof blindFabricColours.$inferSelect;
export type InsertBlindFabricColour = typeof blindFabricColours.$inferInsert;

export const blindQuotes = mysqlTable("blind_quotes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  quoteNumber: varchar("quoteNumber", { length: 32 }).notNull(),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  clientEmail: varchar("clientEmail", { length: 320 }),
  clientPhone: varchar("clientPhone", { length: 64 }),
  siteAddress: text("siteAddress"),
  markupPercent: decimal("markupPercent", { precision: 5, scale: 2 }).default("30.00").notNull(),
  status: mysqlEnum("status", ["draft", "sent", "accepted", "declined", "expired"]).default("draft").notNull(),
  subtotalExGst: decimal("subtotalExGst", { precision: 12, scale: 2 }).default("0.00").notNull(),
  gstAmount: decimal("gstAmount", { precision: 12, scale: 2 }).default("0.00").notNull(),
  totalIncGst: decimal("totalIncGst", { precision: 12, scale: 2 }).default("0.00").notNull(),
  notes: text("notes"),
  leadId: int("leadId").references(() => crmLeads.id, { onDelete: "set null" }),
  createdBy: int("createdBy").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  uniqueIndex("uq_blind_quote_tenant_number").on(table.tenantId, table.quoteNumber),
  index("idx_blind_quotes_tenant_status").on(table.tenantId, table.status),
  index("idx_blind_quotes_lead").on(table.leadId),
]);
export type BlindQuote = typeof blindQuotes.$inferSelect;
export type InsertBlindQuote = typeof blindQuotes.$inferInsert;

export const blindQuoteItems = mysqlTable("blind_quote_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  quoteId: int("quoteId").notNull().references(() => blindQuotes.id, { onDelete: "cascade" }),
  itemNumber: int("itemNumber").notNull(),
  brand: varchar("brand", { length: 64 }).notNull(),
  productType: varchar("productType", { length: 64 }).notNull(),
  widthMm: int("widthMm").notNull(),
  heightMm: int("heightMm").notNull(),
  quantity: int("quantity").default(1).notNull(),
  colourId: int("colourId").references(() => blindColours.id, { onDelete: "set null" }),
  colourName: varchar("colourName", { length: 128 }),
  handleSide: varchar("handleSide", { length: 32 }),
  hingeSide: varchar("hingeSide", { length: 32 }),
  openingDirection: varchar("openingDirection", { length: 32 }),
  hingePosition: varchar("hingePosition", { length: 32 }),
  glassInfillId: int("glassInfillId").references(() => blindGlassInfill.id, { onDelete: "set null" }),
  glassInfillQuantity: decimal("glassInfillQuantity", { precision: 10, scale: 2 }).default("1.00").notNull(),
  fabricColourId: int("fabricColourId").references(() => blindFabricColours.id, { onDelete: "set null" }),
  fabricColourName: varchar("fabricColourName", { length: 128 }),
  photoUrl: text("photoUrl"),
  notes: text("notes"),
  basePriceIncGst: decimal("basePriceIncGst", { precision: 12, scale: 2 }).default("0.00").notNull(),
  adjustedPrice: decimal("adjustedPrice", { precision: 12, scale: 2 }).default("0.00").notNull(),
  optionsTotal: decimal("optionsTotal", { precision: 12, scale: 2 }).default("0.00").notNull(),
  lineTotalExGst: decimal("lineTotalExGst", { precision: 12, scale: 2 }).default("0.00").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_blind_items_tenant_quote").on(table.tenantId, table.quoteId),
  index("idx_blind_items_quote").on(table.quoteId),
]);
export type BlindQuoteItem = typeof blindQuoteItems.$inferSelect;
export type InsertBlindQuoteItem = typeof blindQuoteItems.$inferInsert;

export const blindQuoteItemOptions = mysqlTable("blind_quote_item_options", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  quoteItemId: int("quoteItemId").notNull().references(() => blindQuoteItems.id, { onDelete: "cascade" }),
  productOptionId: int("productOptionId").references(() => blindProductOptions.id, { onDelete: "set null" }),
  quantity: int("quantity").default(1).notNull(),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull(),
  lineTotal: decimal("lineTotal", { precision: 12, scale: 2 }).notNull(),
}, (table) => [
  index("idx_blind_item_options_tenant_item").on(table.tenantId, table.quoteItemId),
]);
export type BlindQuoteItemOption = typeof blindQuoteItemOptions.$inferSelect;
export type InsertBlindQuoteItemOption = typeof blindQuoteItemOptions.$inferInsert;

export const blindQuoteCostAdditions = mysqlTable("blind_quote_cost_additions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  quoteId: int("quoteId").notNull().references(() => blindQuotes.id, { onDelete: "cascade" }),
  costAdditionId: int("costAdditionId").references(() => blindCostAdditions.id, { onDelete: "set null" }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).default("1.00").notNull(),
  unitCost: decimal("unitCost", { precision: 12, scale: 2 }).notNull(),
  lineTotal: decimal("lineTotal", { precision: 12, scale: 2 }).notNull(),
}, (table) => [
  index("idx_blind_quote_costs_tenant_quote").on(table.tenantId, table.quoteId),
]);
export type BlindQuoteCostAddition = typeof blindQuoteCostAdditions.$inferSelect;
export type InsertBlindQuoteCostAddition = typeof blindQuoteCostAdditions.$inferInsert;

// ─── Proposal Library (Sales Content) ────────────────────────────────────────
export const proposalLibraryItems = mysqlTable("proposal_library_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }).notNull(),
  sectionType: varchar("sectionType", { length: 50 }).notNull().default("all"),
  contentType: varchar("contentType", { length: 50 }).notNull().default("overview"),
  title: varchar("title", { length: 255 }).notNull(),
  body: mediumtext("body"),
  imageUrl: text("imageUrl"),
  imageAlt: varchar("imageAlt", { length: 255 }),
  originalFileName: varchar("originalFileName", { length: 255 }),
  originalImageWidth: int("originalImageWidth"),
  originalImageHeight: int("originalImageHeight"),
  imageWidth: int("imageWidth"),
  imageHeight: int("imageHeight"),
  imageSizeBytes: int("imageSizeBytes"),
  imageMimeType: varchar("imageMimeType", { length: 80 }),
  imageWarning: text("imageWarning"),
  defaultIncluded: boolean("defaultIncluded").notNull().default(true),
  isActive: boolean("isActive").notNull().default(true),
  sortOrder: int("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_proposal_library_tenant").on(table.tenantId),
  index("idx_proposal_library_tenant_section").on(table.tenantId, table.sectionType, table.isActive),
  index("idx_proposal_library_tenant_default").on(table.tenantId, table.defaultIncluded, table.isActive),
]);
export type ProposalLibraryItem = typeof proposalLibraryItems.$inferSelect;
export type InsertProposalLibraryItem = typeof proposalLibraryItems.$inferInsert;

// ─── Proposals (Centralised Proposal Generation) ─────────────────────────────
export const proposals = mysqlTable("proposals", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  proposalNumber: varchar("proposalNumber", { length: 32 }).notNull().unique(),
  clientId: int("clientId"), // FK → crmLeads.id
  preparedBy: int("preparedBy"), // FK → users.id
  status: mysqlEnum("status", ["draft", "sent", "viewed", "accepted", "declined", "expired"]).default("draft").notNull(),
  sentAt: timestamp("sentAt"),
  sentTo: varchar("sentTo", { length: 320 }),
  expiresAt: timestamp("expiresAt"),
  signedAt: timestamp("signedAt"),
  signwellDocumentId: varchar("signwellDocumentId", { length: 128 }),

  // Section selection (JSON array: [{type, quoteId, label, worksPrice, description}])
  sections: json("sections").$type<{
    type: "opq" | "deck" | "eclipse" | "blind" | "louvre" | "security_door" | "security_screen";
    quoteId: number;
    label: string;
    worksPrice: number;
    description?: string;
  }[]>().default([]),

  // Shared additional costs (all line items at master level)
  approvals: decimal("approvals", { precision: 12, scale: 2 }).default("0"),
  delivery: decimal("delivery", { precision: 12, scale: 2 }).default("0"),
  siteClean: decimal("siteClean", { precision: 12, scale: 2 }).default("0"),
  engineering: decimal("engineering", { precision: 12, scale: 2 }).default("0"),
  demolition: decimal("demolition", { precision: 12, scale: 2 }).default("0"),
  travel: decimal("travel", { precision: 12, scale: 2 }).default("0"),
  constructionMgmt: decimal("constructionMgmt", { precision: 12, scale: 2 }).default("0"),
  councilFees: decimal("councilFees", { precision: 12, scale: 2 }).default("0"),
  homeWarranty: decimal("homeWarranty", { precision: 12, scale: 2 }).default("0"),
  plumbing: decimal("plumbing", { precision: 12, scale: 2 }).default("0"),
  electrical: decimal("electrical", { precision: 12, scale: 2 }).default("0"),
  concrete: decimal("concrete", { precision: 12, scale: 2 }).default("0"),
  footings: decimal("footings", { precision: 12, scale: 2 }).default("0"),
  attachmentToHouse: decimal("attachmentToHouse", { precision: 12, scale: 2 }).default("0"),
  gableBrackets: decimal("gableBrackets", { precision: 12, scale: 2 }).default("0"),
  otherCostLabel: varchar("otherCostLabel", { length: 256 }),
  otherCostAmount: decimal("otherCostAmount", { precision: 12, scale: 2 }).default("0"),
  // Editable content (draft state)
  termsAndConditions: text("termsAndConditions"),
  scopeOfWorks: text("scopeOfWorks"),
  exclusions: text("exclusions"),

  // Proposal-level adjustments
  discountPercent: decimal("discountPercent", { precision: 5, scale: 2 }).default("0"),
  discountAmount: decimal("discountAmount", { precision: 12, scale: 2 }).default("0"),
  markupPercent: decimal("markupPercent", { precision: 5, scale: 2 }).default("0"),
  markupAmount: decimal("markupAmount", { precision: 12, scale: 2 }).default("0"),

  // Computed totals (stored after generation)
  sectionsSubtotalExGst: decimal("sectionsSubtotalExGst", { precision: 12, scale: 2 }).default("0"),
  additionalCostsTotal: decimal("additionalCostsTotal", { precision: 12, scale: 2 }).default("0"),
  adjustmentAmount: decimal("adjustmentAmount", { precision: 12, scale: 2 }).default("0"),
  grandTotalExGst: decimal("grandTotalExGst", { precision: 12, scale: 2 }).default("0"),
  gstAmount: decimal("gstAmount", { precision: 12, scale: 2 }).default("0"),
  grandTotalIncGst: decimal("grandTotalIncGst", { precision: 12, scale: 2 }).default("0"),

  // PDF & Presentation
  coverMessage: text("coverMessage"),
  validityDays: int("validityDays").default(30),
  depositPercent: decimal("depositPercent", { precision: 5, scale: 2 }).default("20"),
  depositAmount: decimal("depositAmount", { precision: 12, scale: 2 }).default("0"),
  // Progress Payments (JSON: Record<string, {percent: string, amount: string}>)
  progressPayments: json("progressPayments"),
  proposalLibraryItemIds: json("proposalLibraryItemIds").$type<number[]>().default([]),
  pdfUrl: text("pdfUrl"),
  pdfGeneratedAt: timestamp("pdfGeneratedAt"),

  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_proposals_tenant").on(table.tenantId),
]);
export type Proposal = typeof proposals.$inferSelect;
export type InsertProposal = typeof proposals.$inferInsert;

// ─── Proposal Activity Log ───────────────────────────────────────────────────
export const proposalActivity = mysqlTable("proposal_activity", {
  id: int("id").autoincrement().primaryKey(),
  proposalId: int("proposalId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  userId: int("userId"),
  detail: text("detail"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ProposalActivity = typeof proposalActivity.$inferSelect;
export type InsertProposalActivity = typeof proposalActivity.$inferInsert;


// ─── Climbo Accounts (Google Review Integration) ─────────────────────────────
export const climboAccounts = mysqlTable("climbo_accounts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  region: varchar("region", { length: 64 }),
  apiKey: varchar("apiKey", { length: 512 }),
  accountId: varchar("accountId", { length: 128 }),
  webhookUrl: varchar("webhookUrl", { length: 512 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_climbo_accounts_tenant").on(table.tenantId),
}));
export type ClimboAccount = typeof climboAccounts.$inferSelect;
export type InsertClimboAccount = typeof climboAccounts.$inferInsert;

// ─── Google Reviews ──────────────────────────────────────────────────────────
export const googleReviews = mysqlTable("google_reviews", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  leadId: int("leadId"),
  climboAccountId: int("climboAccountId"),
  reviewerName: varchar("reviewerName", { length: 255 }),
  rating: int("rating"),
  reviewText: text("reviewText"),
  reviewDate: timestamp("reviewDate"),
  googleReviewId: varchar("googleReviewId", { length: 255 }),
  locationName: varchar("locationName", { length: 255 }),
  replyText: text("replyText"),
  replyDate: timestamp("replyDate"),
  source: varchar("source", { length: 64 }).default("climbo"),
  rawPayload: json("rawPayload").$type<Record<string, unknown>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_google_reviews_tenant").on(table.tenantId),
  tenantLeadIdx: index("idx_google_reviews_tenant_lead").on(table.tenantId, table.leadId),
  tenantGoogleIdx: index("idx_google_reviews_tenant_google_id").on(table.tenantId, table.googleReviewId),
}));
export type GoogleReview = typeof googleReviews.$inferSelect;
export type InsertGoogleReview = typeof googleReviews.$inferInsert;


// ─── Territory Postcodes (DB-backed territory → branch → postcode mappings) ──
export const territoryPostcodes = mysqlTable("territory_postcodes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  territory: varchar("territory", { length: 128 }).notNull(),
  branchId: int("branchId").notNull().references(() => branches.id, { onDelete: "cascade" }),
  postcode: varchar("postcode", { length: 10 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("uq_territory_postcode").on(t.tenantId, t.territory, t.postcode),
  index("idx_territory_postcodes_tenant").on(t.tenantId),
]);
export type TerritoryPostcode = typeof territoryPostcodes.$inferSelect;
export type InsertTerritoryPostcode = typeof territoryPostcodes.$inferInsert;


// ─── Nylas Calendar Grants ──────────────────────────────────────────────────
export const nylasGrants = mysqlTable("nylas_grants", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  grantId: varchar("grantId", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 320 }),
  provider: varchar("provider", { length: 64 }),
  status: mysqlEnum("status", ["active", "revoked", "error"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_nylas_grants_tenant").on(table.tenantId),
  index("idx_nylas_grants_user_tenant").on(table.tenantId, table.userId),
]);
export type NylasGrant = typeof nylasGrants.$inferSelect;
export type InsertNylasGrant = typeof nylasGrants.$inferInsert;


// ─── DA (Design Adviser) Commission Ledger ──────────────────────────────────
export const daCommissions = mysqlTable("da_commissions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  daUserId: int("daUserId").notNull().references(() => users.id),
  daName: varchar("daName", { length: 255 }).notNull(),
  // Link to job/quote
  constructionJobId: int("constructionJobId").references(() => constructionJobs.id, { onDelete: "set null" }),
  quoteId: int("quoteId"),
  quoteType: varchar("quoteType", { length: 20 }), // 'structure' | 'deck' | 'eclipse'
  jobNo: varchar("jobNo", { length: 64 }),
  contractNo: varchar("contractNo", { length: 64 }),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  // Commission amounts
  totalCommission: decimal("totalCommission", { precision: 12, scale: 2 }).default("0").notNull(),
  amountPaid: decimal("amountPaid", { precision: 12, scale: 2 }).default("0").notNull(),
  adjustmentsTotal: decimal("adjustmentsTotal", { precision: 12, scale: 2 }).default("0").notNull(),
  balanceDue: decimal("balanceDue", { precision: 12, scale: 2 }).default("0").notNull(),
  // Status tracking
  depositReceivedAt: timestamp("depositReceivedAt"),
  contractSignedAt: timestamp("contractSignedAt"),
  completedAt: timestamp("completedAt"),
  status: mysqlEnum("status", ["pending", "deposit_received", "partial_paid", "fully_paid", "closed"]).default("pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_da_commissions_tenant").on(table.tenantId),
  tenantUserIdx: index("idx_da_commissions_tenant_user").on(table.tenantId, table.daUserId),
  tenantJobIdx: index("idx_da_commissions_tenant_job").on(table.tenantId, table.constructionJobId),
}));
export type DaCommission = typeof daCommissions.$inferSelect;
export type InsertDaCommission = typeof daCommissions.$inferInsert;

// ─── DA Commission Adjustments (Audit Trail) ────────────────────────────────
export const daCommissionAdjustments = mysqlTable("da_commission_adjustments", {
  id: int("id").autoincrement().primaryKey(),
  commissionId: int("commissionId").notNull().references(() => daCommissions.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(), // positive = increase, negative = decrease
  reason: text("reason").notNull(),
  adjustedByUserId: int("adjustedByUserId").notNull().references(() => users.id),
  adjustedByName: varchar("adjustedByName", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type DaCommissionAdjustment = typeof daCommissionAdjustments.$inferSelect;
export type InsertDaCommissionAdjustment = typeof daCommissionAdjustments.$inferInsert;

// ─── DA Invoices ────────────────────────────────────────────────────────────
export const daInvoices = mysqlTable("da_invoices", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  daUserId: int("daUserId").notNull().references(() => users.id),
  daName: varchar("daName", { length: 255 }).notNull(),
  invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull(),
  // Link to commission record(s)
  commissionId: int("commissionId").references(() => daCommissions.id, { onDelete: "set null" }),
  // Invoice details
  amountExGst: decimal("amountExGst", { precision: 12, scale: 2 }).notNull(),
  gstAmount: decimal("gstAmount", { precision: 12, scale: 2 }).notNull(),
  totalIncGst: decimal("totalIncGst", { precision: 12, scale: 2 }).notNull(),
  description: text("description"), // e.g. "Commission claim against Job J-001 — $5,000"
  // DA personal details snapshot
  abn: varchar("abn", { length: 32 }),
  bankBsb: varchar("bankBsb", { length: 16 }),
  bankAccount: varchar("bankAccount", { length: 32 }),
  bankName: varchar("bankName", { length: 128 }),
  paymentTerms: varchar("paymentTerms", { length: 64 }).default("14 days"),
  // Workflow
  status: mysqlEnum("status", ["draft", "submitted", "approved", "rejected", "paid"]).default("draft").notNull(),
  submittedAt: timestamp("submittedAt"),
  approvedAt: timestamp("approvedAt"),
  approvedByUserId: int("approvedByUserId").references(() => users.id),
  approvedByName: varchar("approvedByName", { length: 255 }),
  rejectedAt: timestamp("rejectedAt"),
  rejectionReason: text("rejectionReason"),
  paidAt: timestamp("paidAt"),
  // Xero integration
  xeroInvoiceId: varchar("xeroInvoiceId", { length: 128 }),
  xeroContactId: varchar("xeroContactId", { length: 128 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_da_invoices_tenant").on(table.tenantId),
  tenantUserIdx: index("idx_da_invoices_tenant_user").on(table.tenantId, table.daUserId),
  tenantCommissionIdx: index("idx_da_invoices_tenant_commission").on(table.tenantId, table.commissionId),
}));
export type DaInvoice = typeof daInvoices.$inferSelect;
export type InsertDaInvoice = typeof daInvoices.$inferInsert;

// ─── DA Personal Details ────────────────────────────────────────────────────
export const daPersonalDetails = mysqlTable("da_personal_details", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  fullName: varchar("fullName", { length: 255 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 64 }),
  address: text("address"),
  abn: varchar("abn", { length: 32 }),
  bankBsb: varchar("bankBsb", { length: 16 }),
  bankAccount: varchar("bankAccount", { length: 32 }),
  bankName: varchar("bankName", { length: 128 }),
  paymentTerms: varchar("paymentTerms", { length: 64 }).default("14 days"),
  xeroContactId: varchar("xeroContactId", { length: 128 }), // linked Xero supplier card
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_da_personal_details_tenant").on(table.tenantId),
  tenantUserIdx: index("idx_da_personal_details_tenant_user").on(table.tenantId, table.userId),
}));
export type DaPersonalDetails = typeof daPersonalDetails.$inferSelect;
export type InsertDaPersonalDetails = typeof daPersonalDetails.$inferInsert;


// ─── User Schedule & Availability ───────────────────────────────────────────
export const userScheduleBlocks = mysqlTable("user_schedule_blocks", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  userId: int("userId").notNull(),
  dayOfWeek: int("dayOfWeek").notNull(), // 0=Sun, 1=Mon, ... 6=Sat
  startTime: varchar("startTime", { length: 5 }).notNull(), // "HH:MM"
  endTime: varchar("endTime", { length: 5 }).notNull(), // "HH:MM"
  effectiveFrom: varchar("effectiveFrom", { length: 10 }), // "YYYY-MM-DD" or null = always
  effectiveTo: varchar("effectiveTo", { length: 10 }), // "YYYY-MM-DD" or null = ongoing
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_user_schedule_blocks_tenant").on(table.tenantId),
  index("idx_user_schedule_blocks_user_tenant").on(table.tenantId, table.userId),
]);
export type UserScheduleBlock = typeof userScheduleBlocks.$inferSelect;
export type InsertUserScheduleBlock = typeof userScheduleBlocks.$inferInsert;

export const userTimeOff = mysqlTable("user_time_off", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  userId: int("userId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // "YYYY-MM-DD"
  endDate: varchar("endDate", { length: 10 }), // optional multi-day
  reason: varchar("reason", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_user_time_off_tenant").on(table.tenantId),
  index("idx_user_time_off_user_tenant").on(table.tenantId, table.userId),
]);
export type UserTimeOff = typeof userTimeOff.$inferSelect;
export type InsertUserTimeOff = typeof userTimeOff.$inferInsert;

// ─── CRM Dropdown Options (Admin-configurable) ─────────────────────────────
export const crmDropdownOptions = mysqlTable("crm_dropdown_options", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  category: varchar("category", { length: 64 }).notNull(), // e.g. "lead_status", "product_type", "lead_source", "outcome"
  value: varchar("value", { length: 128 }).notNull(),
  label: varchar("label", { length: 128 }).notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_crm_dropdown_options_tenant").on(table.tenantId),
  index("idx_crm_dropdown_options_tenant_category").on(table.tenantId, table.category),
]);

// ─── User Notification Preferences ──────────────────────────────────────────
export const userNotificationPreferences = mysqlTable("user_notification_preferences", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  userId: int("userId").notNull(),
  eventType: varchar("eventType", { length: 64 }).notNull(), // e.g. "schedule_event", "document_uploaded", "activity_posted", "news_published", "invoice_status", "variation_created"
  channelEmail: boolean("channelEmail").default(true).notNull(),
  channelSms: boolean("channelSms").default(false).notNull(),
  channelPush: boolean("channelPush").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
}, (table) => [
  index("idx_user_notification_preferences_tenant").on(table.tenantId),
  index("idx_user_notification_preferences_user_tenant").on(table.tenantId, table.userId),
  index("idx_user_notification_preferences_tenant_event").on(table.tenantId, table.eventType),
]);


// ─── Calendar View Members ──────────────────────────────────────────────────
export const calendarViewMembers = mysqlTable("calendar_view_members", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  viewType: mysqlEnum("viewType", ["construction_team", "trades", "delivery", "design_advisors", "admin_office"]).notNull(),
  userId: int("userId").notNull(),
  sortOrder: int("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_calendar_view_members_tenant").on(table.tenantId),
  uniqueIndex("uq_calendar_view_members_tenant_view_user").on(table.tenantId, table.viewType, table.userId),
]);

// ─── User Calendar Selections (persisted people picker state) ───────────────
export const userCalendarSelections = mysqlTable("user_calendar_selections", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  viewType: mysqlEnum("viewType", ["construction_team", "trades", "delivery", "design_advisors", "admin_office"]).notNull(),
  selectedUserId: int("selectedUserId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_user_calendar_selections_tenant").on(table.tenantId),
  index("idx_user_calendar_selections_user_tenant").on(table.tenantId, table.userId),
]);
export type UserCalendarSelection = typeof userCalendarSelections.$inferSelect;


// ─── Manufacturing Module ──────────────────────────────────────────────────────

/**
 * Manufacturing orders received from Construction component orders.
 * Each manufacturing order links to a cm_component_order and tracks overall production status.
 */
export const manufacturingOrders = mysqlTable("manufacturing_orders", {
  id: int("id").autoincrement().primaryKey(),
  componentOrderId: int("componentOrderId").notNull().references(() => cmComponentOrders.id, { onDelete: "cascade" }),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  orderNumber: varchar("orderNumber", { length: 64 }),
  clientName: varchar("clientName", { length: 255 }).notNull(),
  siteAddress: text("siteAddress"),
  status: mysqlEnum("status", ["received", "in_production", "partially_complete", "completed", "ready_for_dispatch", "dispatched", "on_hold", "cancelled"]).default("received").notNull(),
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
  targetDate: timestamp("targetDate"),
  completedAt: timestamp("completedAt"),
  notes: text("notes"),
  receivedBy: int("receivedBy").references(() => users.id),
  receivedByName: varchar("receivedByName", { length: 255 }),
  receivedAt: timestamp("receivedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ManufacturingOrder = typeof manufacturingOrders.$inferSelect;
export type InsertManufacturingOrder = typeof manufacturingOrders.$inferInsert;

/**
 * Individual manufacturing tasks (line items) grouped by product/category/colour.
 * Each task represents a specific item to be manufactured or procured.
 */
export const manufacturingTasks = mysqlTable("manufacturing_tasks", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => manufacturingOrders.id, { onDelete: "cascade" }),
  productCode: varchar("productCode", { length: 128 }),
  productName: varchar("productName", { length: 255 }).notNull(),
  category: varchar("category", { length: 128 }), // e.g. "Beam", "Post", "Roof", "Bracket"
  colour: varchar("colour", { length: 128 }),
  colourGroup: varchar("colourGroup", { length: 128 }),
  quantity: int("quantity").default(1).notNull(),
  unit: varchar("unit", { length: 32 }).default("ea"), // ea, m, m2, etc.
  length: decimal("length", { precision: 10, scale: 2 }), // in mm
  width: decimal("width", { precision: 10, scale: 2 }),
  description: text("description"),
  sourceType: mysqlEnum("sourceType", ["manufacture", "procure"]).default("manufacture").notNull(),
  supplier: varchar("supplier", { length: 255 }), // for externally procured items
  status: mysqlEnum("status", ["pending", "scheduled", "in_progress", "completed", "on_hold", "cancelled"]).default("pending").notNull(),
  scheduledDate: timestamp("scheduledDate"),
  completedAt: timestamp("completedAt"),
  branchId: int("branchId").references(() => branches.id),
  branchName: varchar("branchName", { length: 128 }),
  notes: text("notes"),
  qrToken: varchar("qrToken", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ManufacturingTask = typeof manufacturingTasks.$inferSelect;
export type InsertManufacturingTask = typeof manufacturingTasks.$inferInsert;

/**
 * Manufacturing schedule entries for the calendar view.
 * Links tasks to specific dates and branches for production scheduling.
 */
export const manufacturingSchedule = mysqlTable("manufacturing_schedule", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").references(() => manufacturingTasks.id, { onDelete: "cascade" }),
  orderId: int("orderId").notNull().references(() => manufacturingOrders.id, { onDelete: "cascade" }),
  branchId: int("branchId").notNull().references(() => branches.id),
  branchName: varchar("branchName", { length: 128 }).notNull(),
  scheduledDate: timestamp("scheduledDate").notNull(),
  scheduledEndDate: timestamp("scheduledEndDate"),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["scheduled", "in_progress", "completed", "cancelled"]).default("scheduled").notNull(),
  assignedTo: varchar("assignedTo", { length: 255 }),
  createdBy: int("createdBy").references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ManufacturingScheduleEntry = typeof manufacturingSchedule.$inferSelect;
export type InsertManufacturingScheduleEntry = typeof manufacturingSchedule.$inferInsert;

/**
 * Manufacturing purchase orders for externally procured materials.
 * Mirrors the Construction PO system (cmWorkOrders pattern).
 */
export const manufacturingPurchaseOrders = mysqlTable("manufacturing_purchase_orders", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  orderId: int("orderId").references(() => manufacturingOrders.id, { onDelete: "set null" }),
  poNumber: varchar("poNumber", { length: 64 }),
  supplier: varchar("supplier", { length: 255 }).notNull(),
  supplierEmail: varchar("supplierEmail", { length: 320 }),
  supplierPhone: varchar("supplierPhone", { length: 64 }),
  supplierAddress: text("supplierAddress"),
  supplierAbn: varchar("supplierAbn", { length: 64 }),
  deliverToBranchId: int("deliverToBranchId").references(() => branches.id, { onDelete: "set null" }),
  deliverToBranchName: varchar("deliverToBranchName", { length: 128 }),
  deliverToAddress: text("deliverToAddress"),
  paymentTermsDays: int("paymentTermsDays").default(14),
  status: mysqlEnum("status", ["draft", "issued", "confirmed", "partially_received", "received", "paid", "cancelled"]).default("draft").notNull(),
  lineItems: json("lineItems"), // Array of { productName, productCode, quantity, unit, unitPrice, totalPrice, colour, description }
  totalAmount: decimal("totalAmount", { precision: 12, scale: 2 }),
  requiredByDate: timestamp("requiredByDate"),
  issuedAt: timestamp("issuedAt"),
  receivedAt: timestamp("receivedAt"),
  paidAt: timestamp("paidAt"),
  invoiceDueAt: timestamp("invoiceDueAt"),
  lastSentAt: timestamp("lastSentAt"),
  confirmationToken: varchar("confirmationToken", { length: 128 }),
  confirmationStatus: mysqlEnum("confirmationStatus", ["pending", "confirmed", "declined"]).default("pending").notNull(),
  supplierEta: timestamp("supplierEta"),
  supplierConfirmationName: varchar("supplierConfirmationName", { length: 255 }),
  supplierConfirmationNotes: text("supplierConfirmationNotes"),
  confirmedAt: timestamp("confirmedAt"),
  approvalStatus: mysqlEnum("approvalStatus", ["not_required", "pending", "approved", "rejected"]).default("not_required").notNull(),
  approvalRequiredAt: timestamp("approvalRequiredAt"),
  approvedBy: int("approvedBy").references(() => users.id),
  approvedByName: varchar("approvedByName", { length: 255 }),
  approvedAt: timestamp("approvedAt"),
  rejectedBy: int("rejectedBy").references(() => users.id),
  rejectedByName: varchar("rejectedByName", { length: 255 }),
  rejectedAt: timestamp("rejectedAt"),
  approvalNotes: text("approvalNotes"),
  grnUrl: text("grnUrl"),
  notes: text("notes"),
  xeroPoId: varchar("xeroPoId", { length: 255 }),
  xeroContactId: varchar("xeroContactId", { length: 255 }),
  xeroSyncedAt: timestamp("xeroSyncedAt"),
  createdBy: int("createdBy").references(() => users.id),
  createdByName: varchar("createdByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ManufacturingPurchaseOrder = typeof manufacturingPurchaseOrders.$inferSelect;
export type InsertManufacturingPurchaseOrder = typeof manufacturingPurchaseOrders.$inferInsert;

export const manufacturingPoAuditTrail = mysqlTable("manufacturing_po_audit_trail", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  action: mysqlEnum("action", ["create", "approve", "reject", "issue", "send", "confirm", "receive", "return", "mark_paid", "escalate", "update", "xero_sync"]).notNull(),
  userId: int("userId").references(() => users.id),
  userName: varchar("userName", { length: 255 }),
  notes: text("notes"),
  metadata: json("metadata").$type<Record<string, any>>().default({}),
  stockMovements: json("stockMovements").$type<Array<{
    itemName: string;
    productCode?: string | null;
    quantity: number;
    unit?: string | null;
    unitPrice?: number | null;
    stockItemId?: number | null;
    inventoryMovementId?: number | null;
  }>>().default([]),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_manufacturing_po_audit_po").on(table.purchaseOrderId),
  index("idx_manufacturing_po_audit_tenant").on(table.tenantId),
  foreignKey({
    name: "fk_manufacturing_po_audit_po",
    columns: [table.purchaseOrderId],
    foreignColumns: [manufacturingPurchaseOrders.id],
  }).onDelete("cascade"),
]);
export type ManufacturingPoAuditTrail = typeof manufacturingPoAuditTrail.$inferSelect;
export type InsertManufacturingPoAuditTrail = typeof manufacturingPoAuditTrail.$inferInsert;

export const manufacturingPoAttachments = mysqlTable("manufacturing_po_attachments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  contentType: varchar("contentType", { length: 128 }),
  fileSize: int("fileSize"),
  storageKey: text("storageKey").notNull(),
  url: text("url").notNull(),
  attachmentType: mysqlEnum("attachmentType", ["delivery_docket", "photo", "other"]).default("other").notNull(),
  uploadedBy: int("uploadedBy").references(() => users.id),
  uploadedByName: varchar("uploadedByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_manufacturing_po_attachments_po").on(table.purchaseOrderId),
  index("idx_manufacturing_po_attachments_tenant").on(table.tenantId),
  foreignKey({
    name: "fk_manufacturing_po_attachments_po",
    columns: [table.purchaseOrderId],
    foreignColumns: [manufacturingPurchaseOrders.id],
  }).onDelete("cascade"),
]);
export type ManufacturingPoAttachment = typeof manufacturingPoAttachments.$inferSelect;
export type InsertManufacturingPoAttachment = typeof manufacturingPoAttachments.$inferInsert;

export const manufacturingPoReturns = mysqlTable("manufacturing_po_returns", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  purchaseOrderId: int("purchaseOrderId").notNull(),
  poLineItemId: int("poLineItemId"),
  productCode: varchar("productCode", { length: 128 }),
  productName: varchar("productName", { length: 255 }),
  returnQty: decimal("returnQty", { precision: 12, scale: 4 }).notNull(),
  unit: varchar("unit", { length: 32 }),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 4 }),
  creditAmount: decimal("creditAmount", { precision: 12, scale: 2 }),
  reason: text("reason"),
  conditionStatus: mysqlEnum("conditionStatus", ["damaged", "incorrect_item", "over_supply", "other"]).default("other").notNull(),
  stockItemId: int("stockItemId"),
  inventoryMovementId: int("inventoryMovementId"),
  returnedBy: varchar("returnedBy", { length: 255 }),
  returnedAt: timestamp("returnedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_manufacturing_po_returns_po").on(table.purchaseOrderId),
  index("idx_manufacturing_po_returns_tenant").on(table.tenantId),
  foreignKey({
    name: "fk_manufacturing_po_returns_po",
    columns: [table.purchaseOrderId],
    foreignColumns: [manufacturingPurchaseOrders.id],
  }).onDelete("cascade"),
]);
export type ManufacturingPoReturn = typeof manufacturingPoReturns.$inferSelect;
export type InsertManufacturingPoReturn = typeof manufacturingPoReturns.$inferInsert;

/**
 * Drivers available for manufacturing dispatch deliveries.
 */
export const manufacturingDrivers = mysqlTable("manufacturing_drivers", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 64 }),
  email: varchar("email", { length: 320 }),
  vehicle: varchar("vehicle", { length: 255 }),
  licencePlate: varchar("licencePlate", { length: 32 }),
  licenceNumber: varchar("licenceNumber", { length: 64 }),
  licenceExpiry: timestamp("licenceExpiry"),
  userId: int("userId").references(() => users.id),
  isActive: boolean("isActive").default(true).notNull(),
  notes: text("notes"),
  driverAccessToken: varchar("driver_access_token", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ManufacturingDriver = typeof manufacturingDrivers.$inferSelect;
export type InsertManufacturingDriver = typeof manufacturingDrivers.$inferInsert;

/**
 * Dispatch records for completed manufacturing orders.
 * Tracks delivery scheduling, driver assignment, and delivery confirmation.
 */
export const manufacturingDispatches = mysqlTable("manufacturing_dispatches", {
  id: int("id").autoincrement().primaryKey(),
  orderId: int("orderId").notNull().references(() => manufacturingOrders.id, { onDelete: "cascade" }),
  dispatchNumber: varchar("dispatchNumber", { length: 64 }),
  status: mysqlEnum("status", ["pending", "scheduled", "in_transit", "delivered", "failed", "cancelled"]).default("pending").notNull(),
  driverId: int("driverId").references(() => manufacturingDrivers.id),
  driverName: varchar("driverName", { length: 255 }),
  scheduledDate: timestamp("scheduledDate"),
  scheduledTimeSlot: varchar("scheduledTimeSlot", { length: 64 }),
  deliveryAddress: text("deliveryAddress"),
  deliveryContact: varchar("deliveryContact", { length: 255 }),
  deliveryPhone: varchar("deliveryPhone", { length: 64 }),
  deliveryNotes: text("deliveryNotes"),
  dispatchedAt: timestamp("dispatchedAt"),
  deliveredAt: timestamp("deliveredAt"),
  deliverySignature: text("deliverySignature"),
  failureReason: text("failureReason"),
  createdBy: int("createdBy").references(() => users.id),
  createdByName: varchar("createdByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ManufacturingDispatch = typeof manufacturingDispatches.$inferSelect;
export type InsertManufacturingDispatch = typeof manufacturingDispatches.$inferInsert;


// ─── Inventory Control ──────────────────────────────────────────────────────
export const inventoryStockItems = mysqlTable("inventory_stock_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  code: varchar("code", { length: 50 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  serialNumber: varchar("serial_number", { length: 128 }),
  category: varchar("category", { length: 100 }).notNull().default("general"),
  unit: varchar("unit", { length: 20 }).notNull().default("EA"),
  unitType: mysqlEnum("unit_type", ["unit", "lm"]).notNull().default("unit"),
  reorderQty: decimal("reorder_qty", { precision: 12, scale: 2 }),
  minStockLevel: decimal("min_stock_level", { precision: 12, scale: 2 }),
  branchId: int("branch_id"),
  conditionIndicator: mysqlEnum("condition_indicator", ["new", "damaged", "off_cut"]).notNull().default("new"),
  actualSize: decimal("actual_size", { precision: 12, scale: 2 }),
  actualWidth: decimal("actual_width", { precision: 12, scale: 2 }),
  actualHeight: decimal("actual_height", { precision: 12, scale: 2 }),
  sourceFullLength: decimal("source_full_length", { precision: 12, scale: 2 }),
  sourceFullWidth: decimal("source_full_width", { precision: 12, scale: 2 }),
  sourceFullHeight: decimal("source_full_height", { precision: 12, scale: 2 }),
  description: text("description"),
  supplier: varchar("supplier", { length: 255 }),
  costPrice: decimal("cost_price", { precision: 12, scale: 2 }),
  catalogueItemId: int("catalogue_item_id"),
  manufacturingCatalogueProductId: int("manufacturing_catalogue_product_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  foreignKey({
    name: "fk_inventory_item_catalogue",
    columns: [table.catalogueItemId],
    foreignColumns: [componentCatalogueProducts.id],
  }),
]);
export type InventoryStockItem = typeof inventoryStockItems.$inferSelect;
export type InsertInventoryStockItem = typeof inventoryStockItems.$inferInsert;

export const inventoryMovements = mysqlTable("inventory_movements", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  stockItemId: int("stock_item_id").notNull(),
  branchId: int("branch_id").notNull(),
  movementType: mysqlEnum("movement_type", ["purchase", "purchase_return", "allocation", "manufacture_use", "adjustment_waste", "transfer_in", "transfer_out"]).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  unitType: mysqlEnum("unit_type", ["unit", "lm"]).notNull().default("unit"),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: int("reference_id"),
  notes: text("notes"),
  unitCostAtTime: decimal("unit_cost_at_time", { precision: 12, scale: 2 }),
  createdBy: varchar("created_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type InsertInventoryMovement = typeof inventoryMovements.$inferInsert;

export const inventoryTransfers = mysqlTable("inventory_transfers", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  transferNumber: varchar("transfer_number", { length: 30 }).notNull().unique(),
  stockItemId: int("stock_item_id").notNull(),
  fromBranchId: int("from_branch_id").notNull(),
  toBranchId: int("to_branch_id").notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 2 }).notNull(),
  unitType: mysqlEnum("unit_type", ["unit", "lm"]).notNull().default("unit"),
  status: mysqlEnum("status", ["pending", "approved", "in_transit", "completed", "cancelled"]).notNull().default("pending"),
  notes: text("notes"),
  requestedBy: varchar("requested_by", { length: 255 }),
  approvedBy: varchar("approved_by", { length: 255 }),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type InventoryTransfer = typeof inventoryTransfers.$inferSelect;
export type InsertInventoryTransfer = typeof inventoryTransfers.$inferInsert;


// ─── Stocktakes ──────────────────────────────────────────────────────────────
export const stocktakeStatusEnum = mysqlEnum("stocktake_status", ["in_progress", "review", "finalised", "cancelled"]);

export const stocktakes = mysqlTable("stocktakes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  stocktakeNumber: varchar("stocktake_number", { length: 50 }).notNull(),
  branchId: int("branch_id"),
  status: mysqlEnum("status", ["in_progress", "review", "pending_approval", "finalised", "cancelled"]).notNull().default("in_progress"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  createdBy: varchar("created_by", { length: 255 }),
  finalisedBy: varchar("finalised_by", { length: 255 }),
  notes: text("notes"),
  totalItems: int("total_items").default(0),
  itemsCounted: int("items_counted").default(0),
  totalVarianceValue: decimal("total_variance_value", { precision: 12, scale: 2 }).default("0"),
  approvalStatus: varchar("approval_status", { length: 20 }).default("not_required"),
  approvedBy: int("approved_by"),
  approvedAt: timestamp("approved_at"),
  approvalNotes: text("approval_notes"),
  varianceThresholdPct: decimal("variance_threshold_pct", { precision: 5, scale: 2 }).default("10.00"),
  varianceThresholdValue: decimal("variance_threshold_value", { precision: 12, scale: 2 }).default("500.00"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type Stocktake = typeof stocktakes.$inferSelect;
export type InsertStocktake = typeof stocktakes.$inferInsert;

export const stocktakeLines = mysqlTable("stocktake_lines", {
  id: int("id").autoincrement().primaryKey(),
  stocktakeId: int("stocktake_id").notNull(),
  stockItemId: int("stock_item_id").notNull(),
  conditionIndicator: mysqlEnum("condition_indicator", ["new", "damaged", "off_cut"]).notNull().default("new"),
  colour: varchar("colour", { length: 100 }),
  actualSize: decimal("actual_size", { precision: 12, scale: 2 }),
  actualWidth: decimal("actual_width", { precision: 12, scale: 2 }),
  actualHeight: decimal("actual_height", { precision: 12, scale: 2 }),
  sourceFullLength: decimal("source_full_length", { precision: 12, scale: 2 }),
  sourceFullWidth: decimal("source_full_width", { precision: 12, scale: 2 }),
  sourceFullHeight: decimal("source_full_height", { precision: 12, scale: 2 }),
  systemQty: decimal("system_qty", { precision: 12, scale: 4 }).default("0"),
  countedQty: decimal("counted_qty", { precision: 12, scale: 4 }),
  variance: decimal("variance", { precision: 12, scale: 4 }),
  unitCost: decimal("unit_cost", { precision: 12, scale: 4 }).default("0"),
  varianceValue: decimal("variance_value", { precision: 12, scale: 4 }),
  adjustmentCreated: boolean("adjustment_created").default(false),
  countedAt: timestamp("counted_at"),
  countedBy: varchar("counted_by", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type StocktakeLine = typeof stocktakeLines.$inferSelect;
export type InsertStocktakeLine = typeof stocktakeLines.$inferInsert;


// ─── Manufacturing PO Receipts (Goods Received Notes) ─────────────────────────
export const manufacturingPoReceipts = mysqlTable("manufacturing_po_receipts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  purchaseOrderId: int("purchase_order_id").notNull(),
  poLineItemId: int("po_line_item_id"),
  productCode: varchar("product_code", { length: 128 }),
  productName: varchar("product_name", { length: 255 }),
  orderedQty: decimal("ordered_qty", { precision: 12, scale: 4 }),
  previouslyReceivedQty: decimal("previously_received_qty", { precision: 12, scale: 4 }),
  receivedQty: decimal("received_qty", { precision: 12, scale: 4 }).notNull().default("0"),
  unit: varchar("unit", { length: 32 }),
  unitPrice: decimal("unit_price", { precision: 12, scale: 4 }),
  stockItemId: int("stock_item_id"),
  inventoryMovementId: int("inventory_movement_id"),
  receivedBy: varchar("received_by", { length: 255 }),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  conditionStatus: mysqlEnum("condition_status", ["good", "damaged", "partial_damage"]).notNull().default("good"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
export type ManufacturingPoReceipt = typeof manufacturingPoReceipts.$inferSelect;
export type InsertManufacturingPoReceipt = typeof manufacturingPoReceipts.$inferInsert;

// ─── Manufacturing Supplier Invoices ──────────────────────────────────────────
export const manufacturingSupplierInvoices = mysqlTable("manufacturing_supplier_invoices", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  invoiceNumber: varchar("invoice_number", { length: 100 }).notNull(),
  supplierName: varchar("supplier_name", { length: 255 }).notNull(),
  supplierEmail: varchar("supplier_email", { length: 255 }),
  purchaseOrderId: int("purchase_order_id"),
  invoiceDate: timestamp("invoice_date").notNull(),
  dueDate: timestamp("due_date"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  gst: decimal("gst", { precision: 12, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 12, scale: 2 }).notNull().default("0"),
  status: mysqlEnum("status", ["draft", "pending_match", "matched", "variance_flagged", "approved", "rejected", "paid"]).notNull().default("draft"),
  matchStatus: mysqlEnum("match_status", ["unmatched", "partial_match", "full_match", "variance"]).notNull().default("unmatched"),
  varianceAmount: decimal("variance_amount", { precision: 12, scale: 2 }).default("0"),
  varianceThreshold: decimal("variance_threshold", { precision: 12, scale: 2 }).default("100"),
  approvedBy: varchar("approved_by", { length: 255 }),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  notes: text("notes"),
  xeroInvoiceId: varchar("xero_invoice_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_manufacturing_supplier_invoices_tenant").on(table.tenantId),
  index("idx_manufacturing_supplier_invoices_tenant_po").on(table.tenantId, table.purchaseOrderId),
]);
export type ManufacturingSupplierInvoice = typeof manufacturingSupplierInvoices.$inferSelect;
export type InsertManufacturingSupplierInvoice = typeof manufacturingSupplierInvoices.$inferInsert;

// ─── Manufacturing Invoice Lines ──────────────────────────────────────────────
export const manufacturingInvoiceLines = mysqlTable("manufacturing_invoice_lines", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoice_id").notNull(),
  poLineItemId: int("po_line_item_id"),
  description: varchar("description", { length: 500 }).notNull(),
  quantity: decimal("quantity", { precision: 12, scale: 4 }).notNull().default("0"),
  unitPrice: decimal("unit_price", { precision: 12, scale: 4 }).notNull().default("0"),
  lineTotal: decimal("line_total", { precision: 12, scale: 2 }).notNull().default("0"),
  poQty: decimal("po_qty", { precision: 12, scale: 4 }).default("0"),
  poUnitPrice: decimal("po_unit_price", { precision: 12, scale: 4 }).default("0"),
  receivedQty: decimal("received_qty", { precision: 12, scale: 4 }).default("0"),
  qtyVariance: decimal("qty_variance", { precision: 12, scale: 4 }).default("0"),
  priceVariance: decimal("price_variance", { precision: 12, scale: 4 }).default("0"),
  matchStatus: mysqlEnum("match_status", ["matched", "qty_variance", "price_variance", "both_variance", "unmatched"]).notNull().default("unmatched"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type ManufacturingInvoiceLine = typeof manufacturingInvoiceLines.$inferSelect;
export type InsertManufacturingInvoiceLine = typeof manufacturingInvoiceLines.$inferInsert;



// ─── Driver Geotracking ─────────────────────────────────────────────────────
export const driverLocations = mysqlTable("driver_locations", {
  id: int("id").autoincrement().primaryKey(),
  driverId: int("driver_id").notNull().references(() => manufacturingDrivers.id),
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  heading: decimal("heading", { precision: 5, scale: 1 }),
  speed: decimal("speed", { precision: 6, scale: 2 }),
  accuracy: decimal("accuracy", { precision: 8, scale: 2 }),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type DriverLocation = typeof driverLocations.$inferSelect;

// ─── User Geotracking (Trades & Construction) ───────────────────────────────
export const userLocations = mysqlTable("user_locations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  userId: int("user_id").notNull().references(() => users.id),
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  heading: decimal("heading", { precision: 5, scale: 1 }),
  speed: decimal("speed", { precision: 6, scale: 2 }),
  accuracy: decimal("accuracy", { precision: 8, scale: 2 }),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
}, (table) => [
  index("idx_user_locations_tenant").on(table.tenantId),
  index("idx_user_locations_tenant_user_recorded").on(table.tenantId, table.userId, table.recordedAt),
]);
export type UserLocation = typeof userLocations.$inferSelect;

// ─── Text Blocks (Engineering & Specifications) ──────────────────────────────
export const textBlocks = mysqlTable("text_blocks", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  category: varchar("category", { length: 50 }).notNull().default("Engineering"), // Engineering | Specifications
  content: text("content").notNull(),
  imageUrl: text("image_url"),
  imageKey: varchar("image_key", { length: 500 }),
  sortOrder: int("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tenantIdx: index("idx_text_blocks_tenant").on(table.tenantId),
  tenantCategoryIdx: index("idx_text_blocks_tenant_category").on(table.tenantId, table.category, table.isActive),
}));
export type TextBlock = typeof textBlocks.$inferSelect;


// ─── Notification Log ────────────────────────────────────────────────────────
export const notificationLog = mysqlTable("notification_log", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  type: varchar("type", { length: 64 }).notNull(), // email, sms, push, owner_notify
  settingKey: varchar("setting_key", { length: 128 }), // the notification setting key that triggered this
  recipientType: varchar("recipient_type", { length: 32 }).notNull(), // owner, user, client, trade
  recipientId: varchar("recipient_id", { length: 128 }), // user ID, email, or phone
  channel: varchar("channel", { length: 32 }).notNull(), // email, sms, push, in_app
  title: varchar("title", { length: 500 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("sent"), // sent, suppressed, failed
  suppressionReason: varchar("suppression_reason", { length: 128 }), // setting_disabled, quiet_hours, user_preference
  metadata: text("metadata"), // JSON with extra context
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_notification_log_tenant").on(table.tenantId),
  index("idx_notification_log_tenant_created").on(table.tenantId, table.createdAt),
]);
export type NotificationLogEntry = typeof notificationLog.$inferSelect;
export type InsertNotificationLogEntry = typeof notificationLog.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════════
// SUPPLIER FEEDBACK (category ratings + notes)
// ═══════════════════════════════════════════════════════════════════════════
export const supplierFeedback = mysqlTable("supplier_feedback", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  supplierId: int("supplierId").notNull().references(() => suppliers.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id), // who submitted the feedback
  // Category ratings (1-5 scale)
  timeliness: int("timeliness").notNull(), // delivery on time
  quality: int("quality").notNull(), // product/service quality
  communication: int("communication").notNull(), // responsiveness
  pricing: int("pricing").notNull(), // pricing accuracy/fairness
  overallRating: decimal("overallRating", { precision: 3, scale: 2 }).notNull(), // computed average of 4 categories
  notes: text("notes"), // free-text feedback
  // Optional context links
  poId: int("poId"), // link to cmComponentOrders if triggered from PO receipt
  jobId: int("jobId"), // link to constructionJobs if triggered from job context
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_supplier_feedback_tenant").on(table.tenantId),
  index("idx_supplier_feedback_tenant_supplier").on(table.tenantId, table.supplierId),
  index("idx_supplier_feedback_tenant_po").on(table.tenantId, table.poId),
]);
export type SupplierFeedbackRow = typeof supplierFeedback.$inferSelect;
export type InsertSupplierFeedback = typeof supplierFeedback.$inferInsert;

// ─── User Dashboard Config (App Central widget preferences) ─────────────────
export const userDashboardConfig = mysqlTable("user_dashboard_config", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  userId: int("userId").notNull(),
  widgetLayout: json("widgetLayout").$type<{ widgets: { id: string; visible: boolean; order: number }[] }>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_user_dashboard_config_tenant").on(table.tenantId),
  index("idx_user_dashboard_config_tenant_user").on(table.tenantId, table.userId),
]);


// ─── Checklist Items (Admin-managed pricing for spec sheet checklist) ─────────
export const checklistItems = mysqlTable("checklist_items", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  section: varchar("section", { length: 64 }).notNull(), // e.g. "site_works", "electrical", "plumbing"
  label: varchar("label", { length: 255 }).notNull(),
  unitPrice: decimal("unitPrice", { precision: 12, scale: 2 }).notNull().default("0"),
  unit: varchar("unit", { length: 20 }).notNull().default("each"), // "each" | "m" | "m2" | "lump"
  sortOrder: int("sortOrder").notNull().default(0),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_checklist_items_tenant").on(t.tenantId),
]);
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type InsertChecklistItem = typeof checklistItems.$inferInsert;


// ─── Chat System ──────────────────────────────────────────────────────────
export const chatChannels = mysqlTable("chat_channels", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["system", "team", "job"]).notNull().default("job"),
  jobId: int("jobId").references(() => constructionJobs.id, { onDelete: "set null" }),
  description: varchar("description", { length: 500 }),
  isArchived: boolean("isArchived").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_chat_channels_tenant").on(table.tenantId),
  index("idx_chat_channels_tenant_type").on(table.tenantId, table.type),
  index("idx_chat_channels_tenant_job").on(table.tenantId, table.jobId),
]);
export type ChatChannel = typeof chatChannels.$inferSelect;
export type InsertChatChannel = typeof chatChannels.$inferInsert;

export const chatChannelMembers = mysqlTable("chat_channel_members", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  channelId: int("channelId").notNull().references(() => chatChannels.id, { onDelete: "cascade" }),
  userId: int("userId").references(() => users.id, { onDelete: "cascade" }),
  memberType: mysqlEnum("memberType", ["user", "trade"]).notNull().default("user"),
  memberId: int("memberId").notNull(), // userId for 'user' type, installerId for 'trade' type
  role: mysqlEnum("role", ["admin", "member"]).notNull().default("member"),
  lastReadAt: timestamp("lastReadAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_chat_channel_members_tenant").on(table.tenantId),
  index("idx_chat_channel_members_tenant_channel").on(table.tenantId, table.channelId),
  index("idx_chat_channel_members_tenant_user").on(table.tenantId, table.userId),
]);
export type ChatChannelMember = typeof chatChannelMembers.$inferSelect;
export type InsertChatChannelMember = typeof chatChannelMembers.$inferInsert;

export const chatMessages = mysqlTable("chat_messages", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  channelId: int("channelId").notNull().references(() => chatChannels.id, { onDelete: "cascade" }),
  senderId: int("senderId").notNull().references(() => users.id, { onDelete: "cascade" }),
  senderName: varchar("senderName", { length: 255 }).notNull(),
  content: text("content").notNull(),
  attachments: json("attachments"), // Array of { url, filename, mimeType, size }
  mentions: json("mentions"), // Array of userId numbers
  isPinned: boolean("isPinned").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_chat_messages_tenant").on(table.tenantId),
  index("idx_chat_messages_tenant_channel").on(table.tenantId, table.channelId),
]);
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

// ─── Chat Message Reactions ──────────────────────────────────────────────────
export const chatMessageReactions = mysqlTable("chat_message_reactions", {
  id: int("id").autoincrement().primaryKey(),
  messageId: int("messageId").notNull().references(() => chatMessages.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  emoji: varchar("emoji", { length: 16 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ChatMessageReaction = typeof chatMessageReactions.$inferSelect;
export type InsertChatMessageReaction = typeof chatMessageReactions.$inferInsert;

// ─── Support Submissions ────────────────────────────────────────────────────
export const supportSubmissions = mysqlTable("support_submissions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  userName: text("userName"),
  userEmail: varchar("userEmail", { length: 320 }),
  type: mysqlEnum("type", ["bug", "suggestion"]).notNull(),
  // Bug-specific fields
  screen: varchar("screen", { length: 255 }),
  action: varchar("action", { length: 500 }),
  stepsToReproduce: text("stepsToReproduce"),
  expectedBehaviour: text("expectedBehaviour"),
  actualBehaviour: text("actualBehaviour"),
  // Suggestion-specific fields
  category: varchar("category", { length: 100 }),
  title: varchar("title", { length: 500 }),
  // Shared fields
  description: text("description"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  status: mysqlEnum("status", ["new", "in_progress", "resolved", "closed", "wont_fix"]).default("new").notNull(),
  attachments: json("attachments"), // Array of { url, filename, mimeType, size }
  assignedToUserId: int("assignedToUserId").references(() => users.id, { onDelete: "set null" }),
  assignedToUserName: text("assignedToUserName"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_support_submissions_tenant").on(table.tenantId),
  index("idx_support_submissions_tenant_status").on(table.tenantId, table.status),
]);

export type SupportSubmission = typeof supportSubmissions.$inferSelect;
export type InsertSupportSubmission = typeof supportSubmissions.$inferInsert;

// ─── Invitations ────────────────────────────────────────────────────────────
export const invitations = mysqlTable("invitations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 255 }),
  role: mysqlEnum("role", ["user", "admin", "super_admin", "design_adviser", "office_user", "construction_user", "driver", "warehouse"]).default("user").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  status: mysqlEnum("status", ["pending", "accepted", "expired", "revoked"]).default("pending").notNull(),
  invitedById: int("invitedById").notNull(),
  invitedByName: varchar("invitedByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
}, (table) => ({
  tenantIdx: index("idx_invitations_tenantId").on(table.tenantId),
  tenantEmailStatusIdx: index("idx_invitations_tenant_email_status").on(table.tenantId, table.email, table.status),
}));

export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = typeof invitations.$inferInsert;

// ─── Support Submission Notes (Admin Comments Thread) ────────────────────────
export const supportSubmissionNotes = mysqlTable("support_submission_notes", {
  id: int("id").autoincrement().primaryKey(),
  submissionId: int("submissionId").notNull().references(() => supportSubmissions.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  userName: text("userName"),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SupportSubmissionNote = typeof supportSubmissionNotes.$inferSelect;
export type InsertSupportSubmissionNote = typeof supportSubmissionNotes.$inferInsert;


// ─── Rain Days ──────────────────────────────────────────────────────────────
export const rainDays = mysqlTable("rain_days", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  zone: varchar("zone", { length: 100 }), // optional zone/region filter
  reason: text("reason"),
  status: mysqlEnum("rainDayStatus", ["pending", "approved", "executed", "revoked"]).default("pending").notNull(),
  declaredByUserId: int("declaredByUserId").notNull().references(() => users.id),
  declaredByUserName: varchar("declaredByUserName", { length: 255 }),
  approvedByUserId: int("approvedByUserId").references(() => users.id),
  approvedByUserName: varchar("approvedByUserName", { length: 255 }),
  approvedAt: timestamp("approvedAt"),
  executedAt: timestamp("executedAt"),
  revokedAt: timestamp("revokedAt"),
  weatherData: json("weatherData"), // { precipitation, tempMax, tempMin, weatherCode, source }
  affectedJobCount: int("affectedJobCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_rain_days_tenant").on(table.tenantId),
  index("idx_rain_days_tenant_date").on(table.tenantId, table.date),
]);
export type RainDay = typeof rainDays.$inferSelect;
export type InsertRainDay = typeof rainDays.$inferInsert;

// ─── Rain Day Job Impacts ───────────────────────────────────────────────────
export const rainDayJobImpacts = mysqlTable("rain_day_job_impacts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  rainDayId: int("rainDayId").notNull().references(() => rainDays.id, { onDelete: "cascade" }),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  clientName: varchar("clientName", { length: 255 }),
  siteAddress: text("siteAddress"),
  scheduleEventId: int("scheduleEventId"),
  originalDate: varchar("originalDate", { length: 10 }).notNull(), // YYYY-MM-DD
  newDate: varchar("newDate", { length: 10 }), // YYYY-MM-DD, set after approval
  tradeIds: json("tradeIds"), // array of installer IDs assigned to the event
  clientNotified: boolean("clientNotified").default(false).notNull(),
  clientNotifiedAt: timestamp("clientNotifiedAt"),
  tradesNotified: boolean("tradesNotified").default(false).notNull(),
  tradesNotifiedAt: timestamp("tradesNotifiedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_rain_day_job_impacts_tenant").on(table.tenantId),
  index("idx_rain_day_job_impacts_tenant_rain_day").on(table.tenantId, table.rainDayId),
  foreignKey({
    name: "fk_rain_impact_event",
    columns: [table.scheduleEventId],
    foreignColumns: [constructionScheduleEvents.id],
  }).onDelete("set null"),
]);
export type RainDayJobImpact = typeof rainDayJobImpacts.$inferSelect;
export type InsertRainDayJobImpact = typeof rainDayJobImpacts.$inferInsert;

// ─── Extension of Time Records ──────────────────────────────────────────────
export const extensionOfTimeRecords = mysqlTable("extension_of_time_records", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  jobId: int("jobId").notNull().references(() => constructionJobs.id, { onDelete: "cascade" }),
  clientName: varchar("clientName", { length: 255 }),
  rainDayId: int("rainDayId").references(() => rainDays.id, { onDelete: "set null" }),
  rainDate: varchar("rainDate", { length: 10 }), // YYYY-MM-DD
  daysClaimed: int("daysClaimed").default(1).notNull(),
  cumulativeDays: int("cumulativeDays").notNull(), // running total for this job
  reason: text("reason"),
  formalNoticeUrl: text("formalNoticeUrl"), // S3 URL to the formal EOT notice PDF
  sentAt: timestamp("sentAt"), // when the formal notice was sent to client
  sentToEmail: varchar("sentToEmail", { length: 320 }),
  createdByUserId: int("createdByUserId").references(() => users.id),
  createdByUserName: varchar("createdByUserName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_extension_of_time_records_tenant").on(table.tenantId),
  index("idx_extension_of_time_records_tenant_job").on(table.tenantId, table.jobId),
]);
export type ExtensionOfTimeRecord = typeof extensionOfTimeRecords.$inferSelect;
export type InsertExtensionOfTimeRecord = typeof extensionOfTimeRecords.$inferInsert;


// ═══════════════════════════════════════════════════════════════════════════════
// BUILDING APPROVALS MODULE
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Approval Workflow Templates ────────────────────────────────────────────
export const approvalWorkflowTemplates = mysqlTable("approval_workflow_templates", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  jurisdiction: mysqlEnum("jurisdiction", ["NSW", "ACT"]).notNull(),
  pathwayCode: varchar("pathwayCode", { length: 64 }).notNull(), // e.g. NSW_DA_CC_OC, ACT_DA_BA_COU
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  // JSON array of state definitions: [{code, label, order, type: 'lodgement'|'construction'}]
  states: json("states"),
  // JSON array of transitions: [{from, to, conditions, autoTasks}]
  transitions: json("transitions"),
  // JSON array of gate definitions: [{gateNumber, name, blockingConditions}]
  gates: json("gates"),
  // JSON array of document requirements: [{docType, label, required, stage}]
  documentChecklist: json("documentChecklist"),
  // JSON array of intake checklist questions: [{id, question, type, options, helpText}]
  intakeChecklist: json("intakeChecklist"),
  active: boolean("active").default(true).notNull(),
  version: int("version").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdByUserId: int("createdByUserId").references(() => users.id),
}, (table) => [
  index("idx_approval_workflow_templates_tenant").on(table.tenantId),
  index("idx_approval_workflow_templates_tenant_pathway").on(table.tenantId, table.pathwayCode),
  index("idx_approval_workflow_templates_tenant_jurisdiction").on(table.tenantId, table.jurisdiction),
]);
export type ApprovalWorkflowTemplate = typeof approvalWorkflowTemplates.$inferSelect;
export type InsertApprovalWorkflowTemplate = typeof approvalWorkflowTemplates.$inferInsert;

// ─── Approval Projects ──────────────────────────────────────────────────────
export const approvalProjects = mysqlTable("approval_projects", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  projectNumber: varchar("projectNumber", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  jurisdiction: mysqlEnum("jurisdiction", ["NSW", "ACT"]).notNull(),
  // Property details
  propertyAddress: text("propertyAddress"),
  propertySuburb: varchar("propertySuburb", { length: 128 }),
  propertyState: varchar("propertyState", { length: 16 }),
  propertyPostcode: varchar("propertyPostcode", { length: 10 }),
  lotNumber: varchar("lotNumber", { length: 32 }),
  dpNumber: varchar("dpNumber", { length: 32 }),
  sectionNumber: varchar("sectionNumber", { length: 32 }),
  blockNumber: varchar("blockNumber", { length: 32 }),
  zoning: varchar("zoning", { length: 128 }),
  // Scope
  buildingClass: varchar("buildingClass", { length: 64 }).default("10a"),
  estimatedCost: decimal("estimatedCost", { precision: 14, scale: 2 }),
  descriptionOfWork: text("descriptionOfWork"),
  targetStartDate: timestamp("targetStartDate"),
  // Parties (linked)
  clientContactId: int("clientContactId"),
  clientName: varchar("clientName", { length: 255 }),
  applicantName: varchar("applicantName", { length: 255 }),
  applicantContactId: int("applicantContactId"),
  certifierName: varchar("certifierName", { length: 255 }),
  certifierContactId: int("certifierContactId"),
  // Risk flags (JSON object with boolean fields)
  riskFlags: json("riskFlags"), // {heritage, bushfire, flood, trees, easements, strata, nca, lease, utility}
  // Pathway
  recommendedPathway: varchar("recommendedPathway", { length: 64 }),
  confirmedPathway: varchar("confirmedPathway", { length: 64 }),
  pathwayConfidence: mysqlEnum("pathwayConfidence", ["high", "medium", "low"]),
  pathwayAssumptions: text("pathwayAssumptions"),
  workflowTemplateId: int("workflowTemplateId"),
  hbcfRequired: boolean("hbcfRequired").default(false).notNull(),
  hbcfRequirementReason: varchar("hbcfRequirementReason", { length: 255 }),
  hbcfStatus: varchar("hbcfStatus", { length: 32 }).default("not_required").notNull(),
  hbcfCertificateId: int("hbcfCertificateId"),
  hbcfFlaggedAt: timestamp("hbcfFlaggedAt"),
  // Current state
  currentState: varchar("currentState", { length: 64 }).default("intake"),
  currentGate: int("currentGate").default(0),
  overallStatus: mysqlEnum("overallStatus", ["intake", "active", "on_hold", "completed", "cancelled"]).default("intake").notNull(),
  // CRM linking
  crmJobId: int("crmJobId"),
  crmLeadId: int("crmLeadId"),
  // Assignment
  projectManagerId: int("projectManagerId").references(() => users.id),
  projectManagerName: varchar("projectManagerName", { length: 255 }),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  completedAt: timestamp("completedAt"),
  createdByUserId: int("createdByUserId").references(() => users.id),
}, (table) => [
  index("idx_approval_projects_tenant").on(table.tenantId),
  foreignKey({
    name: "fk_approval_project_workflow",
    columns: [table.workflowTemplateId],
    foreignColumns: [approvalWorkflowTemplates.id],
  }),
]);
export type ApprovalProject = typeof approvalProjects.$inferSelect;
export type InsertApprovalProject = typeof approvalProjects.$inferInsert;

// ─── Approval Pathway Assessments ───────────────────────────────────────────
export const approvalPathwayAssessments = mysqlTable("approval_pathway_assessments", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => approvalProjects.id, { onDelete: "cascade" }),
  // JSON object: checklist responses {questionId: answer}
  checklistResponses: json("checklistResponses"),
  // Result
  recommendedPathway: varchar("recommendedPathway", { length: 64 }),
  confidence: mysqlEnum("confidence", ["high", "medium", "low"]),
  assumptions: text("assumptions"),
  notes: text("notes"),
  // Audit
  assessedByUserId: int("assessedByUserId").references(() => users.id),
  assessedByName: varchar("assessedByName", { length: 255 }),
  assessedAt: timestamp("assessedAt").defaultNow().notNull(),
  supersededAt: timestamp("supersededAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ApprovalPathwayAssessment = typeof approvalPathwayAssessments.$inferSelect;
export type InsertApprovalPathwayAssessment = typeof approvalPathwayAssessments.$inferInsert;

// ─── Approval Lodgements ────────────────────────────────────────────────────
export const approvalLodgements = mysqlTable("approval_lodgements", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => approvalProjects.id, { onDelete: "cascade" }),
  lodgementType: varchar("lodgementType", { length: 64 }).notNull(), // NSW_DA, NSW_CDC, NSW_CC, NSW_OC, ACT_DA, ACT_BA, ACT_COU, etc.
  // External tracking
  externalPortal: varchar("externalPortal", { length: 128 }),
  externalReferenceNumber: varchar("externalReferenceNumber", { length: 128 }),
  authorityName: varchar("authorityName", { length: 255 }),
  authorityContactId: int("authorityContactId"),
  // Status state machine
  status: varchar("status", { length: 64 }).default("draft").notNull(),
  // Key dates
  submittedAt: timestamp("submittedAt"),
  acceptedAt: timestamp("acceptedAt"),
  feePaidAt: timestamp("feePaidAt"),
  determinationAt: timestamp("determinationAt"),
  expiresAt: timestamp("expiresAt"),
  // Determination
  determinationOutcome: mysqlEnum("determinationOutcome", ["approved", "approved_with_conditions", "refused", "withdrawn", "deferred"]),
  determinationNotes: text("determinationNotes"),
  // Applicant / consent
  applicantName: varchar("applicantName", { length: 255 }),
  ownerConsentSigned: boolean("ownerConsentSigned").default(false),
  ownerConsentSignedAt: timestamp("ownerConsentSignedAt"),
  // Fees
  estimatedFees: decimal("estimatedFees", { precision: 12, scale: 2 }),
  actualFees: decimal("actualFees", { precision: 12, scale: 2 }),
  levies: decimal("levies", { precision: 12, scale: 2 }),
  paymentReference: varchar("paymentReference", { length: 128 }),
  // Pack status
  packStatus: mysqlEnum("packStatus", ["incomplete", "internal_review", "rejected_internally", "client_signature", "ready_for_lodgement", "lodged", "superseded"]).default("incomplete"),
  // API sync
  apiSource: varchar("apiSource", { length: 64 }),
  lastSyncAt: timestamp("lastSyncAt"),
  // Assignment
  assignedToUserId: int("assignedToUserId").references(() => users.id),
  assignedToName: varchar("assignedToName", { length: 255 }),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdByUserId: int("createdByUserId").references(() => users.id),
});
export type ApprovalLodgement = typeof approvalLodgements.$inferSelect;
export type InsertApprovalLodgement = typeof approvalLodgements.$inferInsert;

// ─── Approval Documents ─────────────────────────────────────────────────────
export const approvalDocuments = mysqlTable("approval_documents", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => approvalProjects.id, { onDelete: "cascade" }),
  lodgementId: int("lodgementId").references(() => approvalLodgements.id, { onDelete: "set null" }),
  // Document metadata
  documentType: varchar("documentType", { length: 128 }).notNull(), // e.g. "architectural_plans", "survey", "basix_certificate"
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  // Current version
  currentVersionId: int("currentVersionId"),
  versionCount: int("versionCount").default(1).notNull(),
  // Status
  status: mysqlEnum("status", ["required", "draft", "pending_review", "approved", "rejected", "superseded", "not_applicable"]).default("required").notNull(),
  // Signature
  signatureRequired: boolean("signatureRequired").default(false),
  signatureStatus: mysqlEnum("signatureStatus", ["not_required", "pending", "signed", "rejected"]).default("not_required"),
  signedAt: timestamp("signedAt"),
  signedBy: varchar("signedBy", { length: 255 }),
  // Flags
  isRedacted: boolean("isRedacted").default(false),
  isPublic: boolean("isPublic").default(false),
  isCurrentForConstruction: boolean("isCurrentForConstruction").default(false),
  // Prepared by
  preparedByParty: varchar("preparedByParty", { length: 255 }),
  preparedByContactId: int("preparedByContactId"),
  // Checklist requirement
  checklistRequired: boolean("checklistRequired").default(false),
  checklistStage: varchar("checklistStage", { length: 64 }),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdByUserId: int("createdByUserId").references(() => users.id),
});
export type ApprovalDocument = typeof approvalDocuments.$inferSelect;
export type InsertApprovalDocument = typeof approvalDocuments.$inferInsert;

// ─── Approval Document Versions ─────────────────────────────────────────────
export const approvalDocumentVersions = mysqlTable("approval_document_versions", {
  id: int("id").autoincrement().primaryKey(),
  documentId: int("documentId").notNull().references(() => approvalDocuments.id, { onDelete: "cascade" }),
  versionNumber: int("versionNumber").notNull(),
  // File storage
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileMimeType: varchar("fileMimeType", { length: 128 }),
  fileSize: int("fileSize"), // bytes
  fileHash: varchar("fileHash", { length: 128 }),
  // Metadata
  revisionNotes: text("revisionNotes"),
  supersedes: int("supersedes"), // previous version ID
  // Audit
  uploadedByUserId: int("uploadedByUserId").references(() => users.id),
  uploadedByName: varchar("uploadedByName", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ApprovalDocumentVersion = typeof approvalDocumentVersions.$inferSelect;
export type InsertApprovalDocumentVersion = typeof approvalDocumentVersions.$inferInsert;

// ─── Approval RFIs ──────────────────────────────────────────────────────────
export const approvalRfis = mysqlTable("approval_rfis", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => approvalProjects.id, { onDelete: "cascade" }),
  lodgementId: int("lodgementId").references(() => approvalLodgements.id, { onDelete: "set null" }),
  // RFI details
  rfiNumber: varchar("rfiNumber", { length: 32 }),
  subject: varchar("subject", { length: 255 }).notNull(),
  description: text("description"),
  requestedBy: varchar("requestedBy", { length: 255 }), // authority/certifier name
  // Assignment
  assignedToUserId: int("assignedToUserId").references(() => users.id),
  assignedToName: varchar("assignedToName", { length: 255 }),
  assignedToContactId: int("assignedToContactId"), // external consultant
  assignedToContactName: varchar("assignedToContactName", { length: 255 }),
  // Dates
  receivedAt: timestamp("receivedAt"),
  dueAt: timestamp("dueAt"),
  respondedAt: timestamp("respondedAt"),
  // Status
  status: mysqlEnum("status", ["open", "in_progress", "responded", "closed", "overdue"]).default("open").notNull(),
  isBlocking: boolean("isBlocking").default(false).notNull(),
  blockingGate: int("blockingGate"),
  // Response
  responseNotes: text("responseNotes"),
  responseDocumentIds: json("responseDocumentIds"), // array of document IDs attached as response
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdByUserId: int("createdByUserId").references(() => users.id),
});
export type ApprovalRfi = typeof approvalRfis.$inferSelect;
export type InsertApprovalRfi = typeof approvalRfis.$inferInsert;

// ─── Approval Conditions ────────────────────────────────────────────────────
export const approvalConditions = mysqlTable("approval_conditions", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => approvalProjects.id, { onDelete: "cascade" }),
  lodgementId: int("lodgementId").references(() => approvalLodgements.id, { onDelete: "set null" }),
  // Condition details
  conditionNumber: varchar("conditionNumber", { length: 32 }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  category: mysqlEnum("category", ["pre_commencement", "during_works", "prior_to_occupation", "ongoing", "other"]).default("other").notNull(),
  // Status
  status: mysqlEnum("status", ["not_started", "in_progress", "evidence_submitted", "satisfied", "waived", "not_applicable"]).default("not_started").notNull(),
  isBlocking: boolean("isBlocking").default(false).notNull(),
  blockingGate: int("blockingGate"),
  // Evidence
  evidenceNotes: text("evidenceNotes"),
  evidenceDocumentIds: json("evidenceDocumentIds"), // array of document IDs
  satisfiedAt: timestamp("satisfiedAt"),
  satisfiedByUserId: int("satisfiedByUserId").references(() => users.id),
  satisfiedByName: varchar("satisfiedByName", { length: 255 }),
  // Assignment
  assignedToUserId: int("assignedToUserId").references(() => users.id),
  assignedToName: varchar("assignedToName", { length: 255 }),
  dueAt: timestamp("dueAt"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdByUserId: int("createdByUserId").references(() => users.id),
});
export type ApprovalCondition = typeof approvalConditions.$inferSelect;
export type InsertApprovalCondition = typeof approvalConditions.$inferInsert;

// ─── Approval Tasks ─────────────────────────────────────────────────────────
export const approvalTasks = mysqlTable("approval_tasks", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => approvalProjects.id, { onDelete: "cascade" }),
  lodgementId: int("lodgementId").references(() => approvalLodgements.id, { onDelete: "set null" }),
  // Task details
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  taskType: mysqlEnum("taskType", ["document", "review", "signature", "lodgement", "payment", "inspection", "notification", "gate_check", "custom"]).default("custom").notNull(),
  // Status
  status: mysqlEnum("status", ["pending", "in_progress", "completed", "skipped", "blocked"]).default("pending").notNull(),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  // Assignment
  assignedToUserId: int("assignedToUserId").references(() => users.id),
  assignedToName: varchar("assignedToName", { length: 255 }),
  // Dates
  dueAt: timestamp("dueAt"),
  completedAt: timestamp("completedAt"),
  // Workflow linkage
  workflowState: varchar("workflowState", { length: 64 }),
  gateNumber: int("gateNumber"),
  autoGenerated: boolean("autoGenerated").default(false),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdByUserId: int("createdByUserId").references(() => users.id),
});
export type ApprovalTask = typeof approvalTasks.$inferSelect;
export type InsertApprovalTask = typeof approvalTasks.$inferInsert;

// ─── Approval Inspections ───────────────────────────────────────────────────
export const approvalInspections = mysqlTable("approval_inspections", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => approvalProjects.id, { onDelete: "cascade" }),
  lodgementId: int("lodgementId").references(() => approvalLodgements.id, { onDelete: "set null" }),
  // Inspection details
  inspectionType: varchar("inspectionType", { length: 128 }).notNull(), // e.g. "footing", "frame", "final", "waterproofing"
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  // Scheduling
  scheduledDate: timestamp("scheduledDate"),
  scheduledTime: varchar("scheduledTime", { length: 16 }),
  inspectorName: varchar("inspectorName", { length: 255 }),
  inspectorContactId: int("inspectorContactId"),
  // Status
  status: mysqlEnum("status", ["required", "scheduled", "booked", "passed", "failed", "cancelled", "deferred"]).default("required").notNull(),
  // Results
  result: mysqlEnum("result", ["pass", "fail", "conditional_pass", "not_inspected"]),
  resultNotes: text("resultNotes"),
  resultDocumentIds: json("resultDocumentIds"), // photos, reports
  inspectedAt: timestamp("inspectedAt"),
  // Defects
  hasDefects: boolean("hasDefects").default(false),
  defectCount: int("defectCount").default(0),
  // Blocking
  isBlocking: boolean("isBlocking").default(false),
  blockingGate: int("blockingGate"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdByUserId: int("createdByUserId").references(() => users.id),
});
export type ApprovalInspection = typeof approvalInspections.$inferSelect;
export type InsertApprovalInspection = typeof approvalInspections.$inferInsert;

// ─── Approval Inspection Defects ────────────────────────────────────────────
export const approvalInspectionDefects = mysqlTable("approval_inspection_defects", {
  id: int("id").autoincrement().primaryKey(),
  inspectionId: int("inspectionId").notNull(),
  projectId: int("projectId").notNull().references(() => approvalProjects.id, { onDelete: "cascade" }),
  // Defect details
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  severity: mysqlEnum("severity", ["minor", "major", "critical"]).default("minor").notNull(),
  // Status
  status: mysqlEnum("status", ["open", "in_progress", "rectified", "verified", "accepted"]).default("open").notNull(),
  // Assignment
  assignedToUserId: int("assignedToUserId").references(() => users.id),
  assignedToName: varchar("assignedToName", { length: 255 }),
  // Evidence
  evidenceDocumentIds: json("evidenceDocumentIds"),
  rectifiedAt: timestamp("rectifiedAt"),
  verifiedAt: timestamp("verifiedAt"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  foreignKey({
    name: "fk_approval_defect_inspection",
    columns: [table.inspectionId],
    foreignColumns: [approvalInspections.id],
  }).onDelete("cascade"),
]);
export type ApprovalInspectionDefect = typeof approvalInspectionDefects.$inferSelect;
export type InsertApprovalInspectionDefect = typeof approvalInspectionDefects.$inferInsert;

// ─── Approval Fees ──────────────────────────────────────────────────────────
export const approvalFees = mysqlTable("approval_fees", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => approvalProjects.id, { onDelete: "cascade" }),
  lodgementId: int("lodgementId").references(() => approvalLodgements.id, { onDelete: "set null" }),
  // Fee details
  feeType: varchar("feeType", { length: 128 }).notNull(), // e.g. "da_fee", "section_94_levy", "long_service_levy", "hbc_insurance"
  description: varchar("description", { length: 255 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  gstInclusive: boolean("gstInclusive").default(true),
  // Payment
  isPaid: boolean("isPaid").default(false),
  paidAt: timestamp("paidAt"),
  paymentReference: varchar("paymentReference", { length: 128 }),
  paymentMethod: varchar("paymentMethod", { length: 64 }),
  paymentEvidenceUrl: text("paymentEvidenceUrl"),
  // Due date
  dueAt: timestamp("dueAt"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdByUserId: int("createdByUserId").references(() => users.id),
});
export type ApprovalFee = typeof approvalFees.$inferSelect;
export type InsertApprovalFee = typeof approvalFees.$inferInsert;

// ─── Approval Certificates ──────────────────────────────────────────────────
export const approvalCertificates = mysqlTable("approval_certificates", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => approvalProjects.id, { onDelete: "cascade" }),
  lodgementId: int("lodgementId").references(() => approvalLodgements.id, { onDelete: "set null" }),
  // Certificate details
  certificateType: varchar("certificateType", { length: 64 }).notNull(), // CDC, CC, OC, BA, COU
  certificateNumber: varchar("certificateNumber", { length: 128 }),
  issuedBy: varchar("issuedBy", { length: 255 }),
  issuedAt: timestamp("issuedAt"),
  expiresAt: timestamp("expiresAt"),
  // Document
  documentUrl: text("documentUrl"),
  documentId: int("documentId").references(() => approvalDocuments.id),
  // Notes
  notes: text("notes"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdByUserId: int("createdByUserId").references(() => users.id),
});
export type ApprovalCertificate = typeof approvalCertificates.$inferSelect;
export type InsertApprovalCertificate = typeof approvalCertificates.$inferInsert;

// ─── Approval Audit Log ─────────────────────────────────────────────────────
export const approvalAuditLog = mysqlTable("approval_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull().references(() => approvalProjects.id, { onDelete: "cascade" }),
  // Event
  eventType: varchar("eventType", { length: 64 }).notNull(), // e.g. "status_change", "document_upload", "condition_satisfied", "gate_passed"
  entityType: varchar("entityType", { length: 64 }).notNull(), // e.g. "project", "lodgement", "document", "rfi", "condition", "inspection"
  entityId: int("entityId").notNull(),
  // Details
  summary: varchar("summary", { length: 500 }).notNull(),
  details: json("details"), // full change payload
  previousValue: text("previousValue"),
  newValue: text("newValue"),
  // Actor
  userId: int("userId").references(() => users.id),
  userName: varchar("userName", { length: 255 }),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ApprovalAuditLogEntry = typeof approvalAuditLog.$inferSelect;
export type InsertApprovalAuditLogEntry = typeof approvalAuditLog.$inferInsert;

// ─── Approval Integration Credentials ───────────────────────────────────────
export const approvalIntegrationCredentials = mysqlTable("approval_integration_credentials", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  serviceName: varchar("serviceName", { length: 128 }).notNull(), // e.g. "nsw_planning_portal", "act_edevelopment"
  description: varchar("description", { length: 255 }),
  // Credentials (encrypted in practice — stored as reference)
  credentialType: varchar("credentialType", { length: 64 }), // "api_key", "oauth", "username_password"
  credentialRef: varchar("credentialRef", { length: 255 }), // reference to secrets manager
  // Status
  active: boolean("active").default(true).notNull(),
  lastTestedAt: timestamp("lastTestedAt"),
  lastTestResult: varchar("lastTestResult", { length: 64 }),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdByUserId: int("createdByUserId").references(() => users.id),
}, (table) => [
  index("idx_approval_integration_credentials_tenant").on(table.tenantId),
]);
export type ApprovalIntegrationCredential = typeof approvalIntegrationCredentials.$inferSelect;
export type InsertApprovalIntegrationCredential = typeof approvalIntegrationCredentials.$inferInsert;

// ─── Approval Sync Logs ─────────────────────────────────────────────────────
export const approvalSyncLogs = mysqlTable("approval_sync_logs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  credentialId: int("credentialId"),
  lodgementId: int("lodgementId").references(() => approvalLodgements.id, { onDelete: "set null" }),
  projectId: int("projectId").references(() => approvalProjects.id, { onDelete: "cascade" }),
  // Sync details
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  endpoint: varchar("endpoint", { length: 512 }),
  status: mysqlEnum("status", ["success", "partial", "failed"]).notNull(),
  recordsProcessed: int("recordsProcessed").default(0),
  errorMessage: text("errorMessage"),
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_approval_sync_logs_tenant").on(table.tenantId),
  foreignKey({
    name: "fk_approval_sync_credential",
    columns: [table.credentialId],
    foreignColumns: [approvalIntegrationCredentials.id],
  }).onDelete("set null"),
]);
export type ApprovalSyncLog = typeof approvalSyncLogs.$inferSelect;
export type InsertApprovalSyncLog = typeof approvalSyncLogs.$inferInsert;

// ─── HBCF Builder Profile, Certificates, and Policy Matches ─────────────────
export const hbcfBuilderProfiles = mysqlTable("hbcf_builder_profiles", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  builderName: varchar("builderName", { length: 255 }).notNull(),
  tradingName: varchar("tradingName", { length: 255 }),
  abn: varchar("abn", { length: 32 }),
  licenceNumber: varchar("licenceNumber", { length: 64 }),
  insurerName: varchar("insurerName", { length: 255 }),
  annualLimit: decimal("annualLimit", { precision: 14, scale: 2 }).default("0").notNull(),
  annualLimitUsed: decimal("annualLimitUsed", { precision: 14, scale: 2 }).default("0").notNull(),
  annualLimitYear: int("annualLimitYear"),
  apiEnabled: boolean("apiEnabled").default(false).notNull(),
  apiBaseUrl: text("apiBaseUrl"),
  apiKeyRef: varchar("apiKeyRef", { length: 255 }),
  apiMonthlyLimit: int("apiMonthlyLimit").default(2500).notNull(),
  apiCallsThisMonth: int("apiCallsThisMonth").default(0).notNull(),
  apiCallMonth: varchar("apiCallMonth", { length: 7 }),
  lastSyncAt: timestamp("lastSyncAt"),
  lastSyncStatus: varchar("lastSyncStatus", { length: 32 }),
  lastSyncError: text("lastSyncError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  updatedByUserId: int("updatedByUserId").references(() => users.id),
}, (table) => [
  uniqueIndex("uq_hbcf_builder_profiles_tenant").on(table.tenantId),
  index("idx_hbcf_builder_profiles_tenant").on(table.tenantId),
]);
export type HbcfBuilderProfile = typeof hbcfBuilderProfiles.$inferSelect;
export type InsertHbcfBuilderProfile = typeof hbcfBuilderProfiles.$inferInsert;

export const hbcfCertificates = mysqlTable("hbcf_certificates", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  approvalProjectId: int("approvalProjectId").references(() => approvalProjects.id, { onDelete: "set null" }),
  quoteId: int("quoteId").references(() => quotes.id, { onDelete: "set null" }),
  crmLeadId: int("crmLeadId").references(() => crmLeads.id, { onDelete: "set null" }),
  certificateNumber: varchar("certificateNumber", { length: 128 }),
  policyNumber: varchar("policyNumber", { length: 128 }),
  status: varchar("status", { length: 32 }).default("draft").notNull(),
  policyStatusGroup: varchar("policyStatusGroup", { length: 32 }),
  builderName: varchar("builderName", { length: 255 }),
  builderLicenceNumber: varchar("builderLicenceNumber", { length: 64 }),
  insurerName: varchar("insurerName", { length: 255 }),
  ownerName: varchar("ownerName", { length: 255 }),
  propertyAddress: text("propertyAddress"),
  propertySuburb: varchar("propertySuburb", { length: 128 }),
  propertyPostcode: varchar("propertyPostcode", { length: 10 }),
  contractPrice: decimal("contractPrice", { precision: 14, scale: 2 }),
  issuedAt: timestamp("issuedAt"),
  expiresAt: timestamp("expiresAt"),
  certificateUrl: text("certificateUrl"),
  source: varchar("source", { length: 32 }).default("manual").notNull(),
  externalId: varchar("externalId", { length: 255 }),
  rawPayload: json("rawPayload"),
  lastSyncedAt: timestamp("lastSyncedAt"),
  syncStatus: varchar("syncStatus", { length: 32 }).default("not_synced").notNull(),
  syncError: text("syncError"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdByUserId: int("createdByUserId").references(() => users.id),
}, (table) => [
  index("idx_hbcf_certificates_tenant").on(table.tenantId),
  index("idx_hbcf_certificates_project").on(table.approvalProjectId),
  index("idx_hbcf_certificates_quote").on(table.quoteId),
  index("idx_hbcf_certificates_lead").on(table.crmLeadId),
  index("idx_hbcf_certificates_policy").on(table.policyNumber),
  index("idx_hbcf_certificates_status").on(table.status),
  index("idx_hbcf_certificates_policy_status_group").on(table.policyStatusGroup),
]);
export type HbcfCertificate = typeof hbcfCertificates.$inferSelect;
export type InsertHbcfCertificate = typeof hbcfCertificates.$inferInsert;

export const hbcfPolicyMatches = mysqlTable("hbcf_policy_matches", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  leadId: int("leadId").references(() => crmLeads.id, { onDelete: "set null" }),
  quoteId: int("quoteId").references(() => quotes.id, { onDelete: "set null" }),
  policyNumber: varchar("policyNumber", { length: 128 }),
  certificateNumber: varchar("certificateNumber", { length: 128 }),
  builderName: varchar("builderName", { length: 255 }),
  builderLicenceNumber: varchar("builderLicenceNumber", { length: 64 }),
  insurerName: varchar("insurerName", { length: 255 }),
  ownerName: varchar("ownerName", { length: 255 }),
  propertyAddress: text("propertyAddress"),
  propertySuburb: varchar("propertySuburb", { length: 128 }),
  propertyPostcode: varchar("propertyPostcode", { length: 10 }),
  contractPrice: decimal("contractPrice", { precision: 14, scale: 2 }),
  issuedAt: timestamp("issuedAt"),
  isOurs: boolean("isOurs").default(false).notNull(),
  matchConfidence: mysqlEnum("matchConfidence", ["high", "medium", "low"]).default("medium").notNull(),
  matchReason: varchar("matchReason", { length: 255 }),
  source: varchar("source", { length: 32 }).default("api").notNull(),
  rawPayload: json("rawPayload"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_hbcf_policy_matches_tenant").on(table.tenantId),
  index("idx_hbcf_policy_matches_lead").on(table.leadId),
  index("idx_hbcf_policy_matches_quote").on(table.quoteId),
  index("idx_hbcf_policy_matches_policy").on(table.policyNumber),
  index("idx_hbcf_policy_matches_builder").on(table.builderName),
  index("idx_hbcf_policy_matches_is_ours").on(table.isOurs),
]);
export type HbcfPolicyMatch = typeof hbcfPolicyMatches.$inferSelect;
export type InsertHbcfPolicyMatch = typeof hbcfPolicyMatches.$inferInsert;

export const hbcfSyncLogs = mysqlTable("hbcf_sync_logs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id),
  syncType: varchar("syncType", { length: 64 }).default("manual").notNull(),
  certificatesChecked: int("certificatesChecked").default(0).notNull(),
  certificatesUpdated: int("certificatesUpdated").default(0).notNull(),
  competitorMatchesFound: int("competitorMatchesFound").default(0).notNull(),
  errors: int("errors").default(0).notNull(),
  errorDetails: text("errorDetails"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  status: varchar("status", { length: 32 }).default("pending").notNull(),
  source: varchar("source", { length: 32 }).default("api").notNull(),
  externalId: varchar("externalId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_hbcf_sync_logs_tenant").on(table.tenantId),
  index("idx_hbcf_sync_logs_status").on(table.status),
  index("idx_hbcf_sync_logs_completed").on(table.completedAt),
]);
export type HbcfSyncLog = typeof hbcfSyncLogs.$inferSelect;
export type InsertHbcfSyncLog = typeof hbcfSyncLogs.$inferInsert;

// ============================================================
// PUBLIC DA TRACKER (ACT ArcGIS)
// ============================================================

export const daTrackerApplications = mysqlTable("da_tracker_applications", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenantId").references(() => tenants.id),
  daNumber: bigint("da_number", { mode: "number" }).notNull(),
  objectId: int("object_id").notNull(),
  activity: int("activity"),
  blockKey: bigint("block_key", { mode: "number" }),
  district: varchar("district", { length: 100 }),
  division: varchar("division", { length: 100 }),
  section: int("section"),
  block: int("block"),
  lodgementDate: timestamp("lodgement_date"),
  applicationType: varchar("application_type", { length: 20 }),
  subclass: varchar("subclass", { length: 100 }),
  shapeArea: double("shape_area"),
  shapeLength: double("shape_length"),
  centroidLat: double("centroid_lat"),
  centroidLng: double("centroid_lng"),
  polygonJson: json("polygon_json"),
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  removedAt: timestamp("removed_at"),
  lastHash: varchar("last_hash", { length: 64 }),
}, (table) => [
  index("idx_da_tracker_tenant").on(table.tenantId),
  index("idx_da_tracker_da_number").on(table.daNumber),
  index("idx_da_tracker_district").on(table.district),
  index("idx_da_tracker_division").on(table.division),
  index("idx_da_tracker_subclass").on(table.subclass),
  index("idx_da_tracker_lodgement").on(table.lodgementDate),
  index("idx_da_tracker_centroid").on(table.centroidLat, table.centroidLng),
]);
export type DaTrackerApplication = typeof daTrackerApplications.$inferSelect;
export type InsertDaTrackerApplication = typeof daTrackerApplications.$inferInsert;

export const daTrackerWebhookSubscriptions = mysqlTable("da_tracker_webhook_subscriptions", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenantId").references(() => tenants.id),
  userId: int("user_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  filterDistrict: varchar("filter_district", { length: 100 }),
  filterDivision: varchar("filter_division", { length: 100 }),
  filterSubclass: varchar("filter_subclass", { length: 100 }),
  filterApplicationType: varchar("filter_application_type", { length: 20 }),
  notifyMethod: varchar("notify_method", { length: 20 }).notNull().default("in_app"),
  webhookUrl: varchar("webhook_url", { length: 500 }),
  emailAddress: varchar("email_address", { length: 255 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_da_tracker_subscription_tenant").on(table.tenantId),
]);
export type DaTrackerWebhookSubscription = typeof daTrackerWebhookSubscriptions.$inferSelect;
export type InsertDaTrackerWebhookSubscription = typeof daTrackerWebhookSubscriptions.$inferInsert;

export const daTrackerWebhookDeliveries = mysqlTable("da_tracker_webhook_deliveries", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenantId").references(() => tenants.id),
  subscriptionId: int("subscription_id").notNull(),
  daApplicationId: int("da_application_id").notNull(),
  eventType: varchar("event_type", { length: 30 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  attempts: int("attempts").notNull().default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  deliveredAt: timestamp("delivered_at"),
  responseStatus: int("response_status"),
  responseBody: text("response_body"),
  errorMessage: text("error_message"),
  payload: json("payload"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_da_webhook_delivery_tenant").on(table.tenantId),
  index("idx_da_webhook_delivery_sub").on(table.subscriptionId),
  index("idx_da_webhook_delivery_status").on(table.status),
]);
export type DaTrackerWebhookDelivery = typeof daTrackerWebhookDeliveries.$inferSelect;
export type InsertDaTrackerWebhookDelivery = typeof daTrackerWebhookDeliveries.$inferInsert;

export const daTrackerPollLog = mysqlTable("da_tracker_poll_log", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenantId").references(() => tenants.id),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  totalFetched: int("total_fetched"),
  newApplications: int("new_applications").default(0),
  updatedApplications: int("updated_applications").default(0),
  removedApplications: int("removed_applications").default(0),
  errorMessage: text("error_message"),
  durationMs: int("duration_ms"),
}, (table) => [
  index("idx_da_tracker_poll_log_tenant").on(table.tenantId),
]);
export type DaTrackerPollLog = typeof daTrackerPollLog.$inferSelect;

// ─── Competitor Intelligence ────────────────────────────────────────────────
export const daCompetitorWatchlist = mysqlTable("da_competitor_watchlist", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenantId").references(() => tenants.id),
  companyName: varchar("company_name", { length: 255 }).notNull(),
  notes: text("notes"),
  colour: varchar("colour", { length: 20 }).default("#ef4444"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: int("created_by"),
}, (table) => [
  index("idx_da_competitor_watchlist_tenant").on(table.tenantId),
]);
export type DaCompetitorWatchlist = typeof daCompetitorWatchlist.$inferSelect;
export type InsertDaCompetitorWatchlist = typeof daCompetitorWatchlist.$inferInsert;

export const clientDas = mysqlTable("client_das", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenantId").references(() => tenants.id),
  leadId: int("lead_id"),
  quoteId: int("quote_id"),
  daNumber: varchar("da_number", { length: 32 }).notNull(),
  companyName: varchar("company_name", { length: 255 }),
  applicantName: varchar("applicant_name", { length: 255 }),
  proposalText: text("proposal_text"),
  streetAddress: varchar("street_address", { length: 500 }),
  suburb: varchar("suburb", { length: 128 }),
  lodgementDate: timestamp("lodgement_date"),
  daStage: varchar("da_stage", { length: 50 }),
  decision: varchar("decision", { length: 100 }),
  decisionDate: timestamp("decision_date"),
  isOurs: boolean("is_ours").default(false).notNull(),
  matchType: mysqlEnum("match_type", ["address", "name", "both", "manual"]).notNull(),
  matchConfidence: mysqlEnum("match_confidence", ["high", "medium", "low"]).notNull(),
  centroidLat: double("centroid_lat"),
  centroidLng: double("centroid_lng"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_client_das_tenant").on(table.tenantId),
  index("idx_client_das_lead").on(table.leadId),
  index("idx_client_das_quote").on(table.quoteId),
  index("idx_client_das_da_number").on(table.daNumber),
  index("idx_client_das_company").on(table.companyName),
  index("idx_client_das_is_ours").on(table.isOurs),
]);
export type ClientDa = typeof clientDas.$inferSelect;
export type InsertClientDa = typeof clientDas.$inferInsert;

// ─── NSW DA Applications (Planning Portal) ──────────────────────────────────
export const nswDaApplications = mysqlTable("nsw_da_applications", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenantId").references(() => tenants.id),
  portalAppNumber: varchar("portal_app_number", { length: 64 }).notNull(),
  councilName: varchar("council_name", { length: 200 }).notNull(),
  applicationStatus: varchar("application_status", { length: 100 }),
  applicationType: varchar("application_type", { length: 100 }),
  developmentType: text("development_type"), // can be multi-value comma-separated
  fullAddress: varchar("full_address", { length: 500 }),
  suburb: varchar("suburb", { length: 128 }),
  postcode: varchar("postcode", { length: 10 }),
  lodgementDate: timestamp("lodgement_date"),
  determinationDate: timestamp("determination_date"),
  centroidLat: double("centroid_lat"),
  centroidLng: double("centroid_lng"),
  costOfDevelopment: decimal("cost_of_development", { precision: 14, scale: 2 }),
  isRelevant: boolean("is_relevant").default(false).notNull(), // matches outdoor-living keywords
  relevantCategory: varchar("relevant_category", { length: 100 }), // patio, carport, deck, dwelling, etc.
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  lastHash: varchar("last_hash", { length: 64 }),
  // T1Cloud scraper fields
  applicantName: varchar("applicant_name", { length: 500 }),
  applicantSource: varchar("applicant_source", { length: 50 }), // 'portal_api' | 't1cloud_qprc' | 't1cloud_wagga'
  description: text("description"), // DA description from T1Cloud
  isCompetitor: boolean("is_competitor").default(false).notNull(),
  isOurs: boolean("is_ours").default(false).notNull(),
  matchedCompetitorId: int("matched_competitor_id"),
}, (table) => [
  index("idx_nsw_da_tenant").on(table.tenantId),
  index("idx_nsw_da_portal_app").on(table.portalAppNumber),
  index("idx_nsw_da_council").on(table.councilName),
  index("idx_nsw_da_suburb").on(table.suburb),
  index("idx_nsw_da_lodgement").on(table.lodgementDate),
  index("idx_nsw_da_relevant").on(table.isRelevant),
  index("idx_nsw_da_category").on(table.relevantCategory),
  index("idx_nsw_da_centroid").on(table.centroidLat, table.centroidLng),
  index("idx_nsw_da_applicant").on(table.applicantName),
  index("idx_nsw_da_competitor").on(table.isCompetitor),
  index("idx_nsw_da_is_ours").on(table.isOurs),
]);
export type NswDaApplication = typeof nswDaApplications.$inferSelect;
export type InsertNswDaApplication = typeof nswDaApplications.$inferInsert;

export const nswDaPollLog = mysqlTable("nsw_da_poll_log", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenantId").references(() => tenants.id),
  councilName: varchar("council_name", { length: 200 }),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  totalFetched: int("total_fetched"),
  newApplications: int("new_applications").default(0),
  updatedApplications: int("updated_applications").default(0),
  relevantCount: int("relevant_count").default(0),
  errorMessage: text("error_message"),
  durationMs: int("duration_ms"),
}, (table) => [
  index("idx_nsw_da_poll_log_tenant").on(table.tenantId),
]);
export type NswDaPollLog = typeof nswDaPollLog.$inferSelect;


// ─── AI Learning & Improvement ──────────────────────────────────────────────

/** Editable AI system prompts — admin can fine-tune each prompt key */
export const aiPrompts = mysqlTable("ai_prompts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 128 }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  description: text("description"),
  systemPrompt: mediumtext("system_prompt").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_ai_prompts_tenant").on(table.tenantId),
  uniqueIndex("uq_ai_prompts_tenant_key").on(table.tenantId, table.key),
]);
export type AiPrompt = typeof aiPrompts.$inferSelect;
export type InsertAiPrompt = typeof aiPrompts.$inferInsert;

/** Knowledge chunks that get injected into AI context */
export const aiKnowledgeChunks = mysqlTable("ai_knowledge_chunks", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  content: mediumtext("content").notNull(),
  category: varchar("category", { length: 128 }),
  tags: text("tags"), // JSON array of tags
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_ai_knowledge_tenant").on(table.tenantId),
  index("idx_ai_knowledge_tenant_active").on(table.tenantId, table.isActive),
]);
export type AiKnowledgeChunk = typeof aiKnowledgeChunks.$inferSelect;
export type InsertAiKnowledgeChunk = typeof aiKnowledgeChunks.$inferInsert;

/** User feedback on AI responses (thumbs up/down + comments) */
export const aiFeedback = mysqlTable("ai_feedback", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  userId: int("user_id").notNull(),
  sessionId: varchar("session_id", { length: 128 }),
  messageContent: text("message_content"), // The AI response that was rated
  userQuery: text("user_query"), // The user's original question
  rating: mysqlEnum("rating", ["positive", "negative"]).notNull(),
  comment: text("comment"),
  promptKey: varchar("prompt_key", { length: 128 }),
  status: mysqlEnum("status", ["pending", "reviewed", "actioned", "dismissed"]).default("pending").notNull(),
  topic: mysqlEnum("topic", ["pricing", "specs", "general", "other"]),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_ai_feedback_tenant").on(table.tenantId),
  index("idx_ai_feedback_user").on(table.userId),
  index("idx_ai_feedback_rating").on(table.rating),
  index("idx_ai_feedback_status").on(table.status),
  index("idx_ai_feedback_prompt").on(table.promptKey),
  index("idx_ai_feedback_topic").on(table.topic),
]);
export type AiFeedback = typeof aiFeedback.$inferSelect;
export type InsertAiFeedback = typeof aiFeedback.$inferInsert;

/** Few-shot example pairs — gold-standard Q&A injected into prompts */
export const aiFewShotExamples = mysqlTable("ai_few_shot_examples", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  promptKey: varchar("prompt_key", { length: 128 }).notNull(),
  userInput: text("user_input").notNull(),
  expectedOutput: mediumtext("expected_output").notNull(),
  description: varchar("description", { length: 255 }),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: int("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_ai_fewshot_tenant").on(table.tenantId),
  index("idx_ai_fewshot_prompt").on(table.promptKey),
  index("idx_ai_fewshot_active").on(table.isActive),
]);
export type AiFewShotExample = typeof aiFewShotExamples.$inferSelect;
export type InsertAiFewShotExample = typeof aiFewShotExamples.$inferInsert;

/** Correction memory — stores user corrections for similar future queries */
export const aiCorrections = mysqlTable("ai_corrections", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").references(() => tenants.id, { onDelete: "cascade" }),
  userId: int("user_id"),
  originalQuery: text("original_query").notNull(),
  originalResponse: mediumtext("original_response"),
  correction: mediumtext("correction").notNull(),
  context: text("context"), // Additional context about when this correction applies
  promptKey: varchar("prompt_key", { length: 128 }),
  isActive: boolean("is_active").default(true).notNull(),
  usageCount: int("usage_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_ai_correction_tenant").on(table.tenantId),
  index("idx_ai_correction_prompt").on(table.promptKey),
  index("idx_ai_correction_active").on(table.isActive),
]);
export type AiCorrection = typeof aiCorrections.$inferSelect;
export type InsertAiCorrection = typeof aiCorrections.$inferInsert;
