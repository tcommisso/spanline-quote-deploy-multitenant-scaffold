import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { eq, desc, and, like, or, sql } from "drizzle-orm";
import {
  proposals, proposalActivity,
  type InsertProposal, type Proposal,
  type InsertProposalActivity,
  quotes, quoteComponents, deckQuotes, eclipseQuotes, crmLeads,
} from "../drizzle/schema";

const pool = mysql.createPool(process.env.DATABASE_URL!);
const db = drizzle(pool);

// ─── Proposal Number Generation ─────────────────────────────────────────────
export async function getNextProposalNumber(): Promise<string> {
  const [rows] = await pool.execute(
    "SELECT proposalNumber FROM proposals ORDER BY id DESC LIMIT 1"
  );
  const last = (rows as any[])[0]?.proposalNumber;
  if (!last) return "PR-0001";
  const num = parseInt(last.replace("PR-", ""), 10) + 1;
  return `PR-${String(num).padStart(4, "0")}`;
}

// ─── Create ─────────────────────────────────────────────────────────────────
export async function createProposal(data: Omit<InsertProposal, "id" | "createdAt" | "updatedAt">) {
  const [result] = await db.insert(proposals).values(data as any);
  return { id: (result as any).insertId, proposalNumber: data.proposalNumber };
}

// ─── Update ─────────────────────────────────────────────────────────────────
export async function updateProposal(id: number, data: Partial<InsertProposal>) {
  await db.update(proposals).set(data as any).where(eq(proposals.id, id));
  return getProposalById(id);
}

// ─── Get by ID ──────────────────────────────────────────────────────────────
export async function getProposalById(id: number) {
  const rows = await db.select().from(proposals).where(eq(proposals.id, id)).limit(1);
  return rows[0] || null;
}

// ─── List ───────────────────────────────────────────────────────────────────
export async function listProposals(filters?: {
  status?: string;
  clientId?: number;
  search?: string;
}) {
  const conditions: any[] = [];
  if (filters?.status) conditions.push(eq(proposals.status, filters.status as any));
  if (filters?.clientId) conditions.push(eq(proposals.clientId, filters.clientId));
  if (filters?.search) {
    conditions.push(
      or(
        like(proposals.proposalNumber, `%${filters.search}%`),
        like(proposals.sentTo, `%${filters.search}%`)
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select().from(proposals).where(where).orderBy(desc(proposals.createdAt)).limit(200);

  // Enrich with client names
  const clientIds = Array.from(new Set(rows.map(r => r.clientId).filter((id): id is number => id !== null && id !== undefined)));
  const clientMap: Record<number, string> = {};
  if (clientIds.length > 0) {
    const leads = await db.select({
      id: crmLeads.id,
      firstName: crmLeads.contactFirstName,
      lastName: crmLeads.contactLastName,
      company: crmLeads.company,
    }).from(crmLeads).where(sql`${crmLeads.id} IN (${sql.join(clientIds.map(id => sql`${id}`), sql`, `)})`);
    for (const l of leads) {
      const name = [l.firstName, l.lastName].filter(Boolean).join(" ");
      clientMap[l.id] = name || l.company || "Unknown";
    }
  }

  return rows.map(r => ({
    ...r,
    clientName: r.clientId ? (clientMap[r.clientId] || "Unknown") : "—",
  }));
}

// ─── Delete ─────────────────────────────────────────────────────────────────
export async function deleteProposal(id: number) {
  await db.delete(proposalActivity).where(eq(proposalActivity.proposalId, id));
  await db.delete(proposals).where(eq(proposals.id, id));
}

// ─── Activity Log ───────────────────────────────────────────────────────────
export async function logActivity(data: Omit<InsertProposalActivity, "id" | "createdAt">) {
  await db.insert(proposalActivity).values(data as any);
}

export async function getProposalActivity(proposalId: number) {
  return db.select().from(proposalActivity)
    .where(eq(proposalActivity.proposalId, proposalId))
    .orderBy(desc(proposalActivity.createdAt))
    .limit(100);
}

// ─── Compute OPQ Total from Components ──────────────────────────────────────
async function computeOpqTotal(quoteId: number): Promise<number> {
  const comps = await db.select().from(quoteComponents).where(eq(quoteComponents.quoteId, quoteId));
  let total = 0;
  for (const comp of comps) {
    const items = (comp.lineItems as any[]) || [];
    for (const item of items) {
      total += (item.qty || 0) * (item.sellRate || 0);
    }
  }
  return total;
}

// ─── Shared Cost Item Type ──────────────────────────────────────────────────
export type SharedCostItem = { name: string; amount: number; source: string };

// ─── Get Active Quotes for a Client ─────────────────────────────────────────
// Returns worksPrice = materials + labour ONLY (no shared costs)
// Also returns sharedCosts[] from each section for auto-populating master proposal
export async function getActiveQuotesForClient(clientId: number) {
  const opqRows = await db.select({
    id: quotes.id,
    quoteNumber: quotes.quoteNumber,
    status: quotes.status,
    descriptionOfWork: quotes.descriptionOfWork,
    deliveryAmount: quotes.deliveryAmount,
    travelAllowance: quotes.travelAllowance,
    smallJobSurcharge: quotes.smallJobSurcharge,
    constructionMgmtAmount: quotes.constructionMgmtAmount,
    councilFees: quotes.councilFees,
    homeWarranty: quotes.homeWarranty,
  }).from(quotes).where(
    and(eq(quotes.clientId, clientId), eq(quotes.archived, false))
  );

  // Compute OPQ totals — worksPrice = components only (materials + labour)
  // Shared costs (delivery, travel, smallJob, constructionMgmt, council, warranty) are separate
  const opqWithTotals = await Promise.all(opqRows.map(async q => {
    const componentTotal = await computeOpqTotal(q.id);
    const delivery = parseFloat(q.deliveryAmount || "0");
    const travel = parseFloat(q.travelAllowance || "0");
    const smallJob = parseFloat(q.smallJobSurcharge || "0");
    const constructionMgmt = parseFloat(q.constructionMgmtAmount || "0");
    const councilFees = parseFloat(q.councilFees || "0");
    const homeWarranty = parseFloat(q.homeWarranty || "0");

    const sharedCosts: SharedCostItem[] = [];
    if (delivery > 0) sharedCosts.push({ name: "delivery", amount: delivery, source: `OPQ ${q.quoteNumber}` });
    if (travel > 0) sharedCosts.push({ name: "travel", amount: travel, source: `OPQ ${q.quoteNumber}` });
    if (smallJob > 0) sharedCosts.push({ name: "delivery", amount: smallJob, source: `OPQ ${q.quoteNumber} (small job)` });
    if (constructionMgmt > 0) sharedCosts.push({ name: "constructionMgmt", amount: constructionMgmt, source: `OPQ ${q.quoteNumber}` });
    if (councilFees > 0) sharedCosts.push({ name: "councilFees", amount: councilFees, source: `OPQ ${q.quoteNumber}` });
    if (homeWarranty > 0) sharedCosts.push({ name: "homeWarranty", amount: homeWarranty, source: `OPQ ${q.quoteNumber}` });

    return {
      id: q.id,
      quoteNumber: q.quoteNumber,
      status: q.status,
      type: "opq" as const,
      worksPrice: componentTotal, // materials + labour only
      sharedCosts,
      label: `Structure ${q.quoteNumber} — ${q.descriptionOfWork || "OPQ"}`,
    };
  }));

  // Deck: sellPriceExGst includes delivery baked into margin calc.
  // We keep it as-is for worksPrice since delivery is inseparable from the margin calc.
  // Deck delivery/engineering/permit are already separate columns.
  const deckRows = await db.select({
    id: deckQuotes.id,
    quoteNumber: deckQuotes.quoteNumber,
    status: deckQuotes.status,
    deckWidthM: deckQuotes.deckWidthM,
    deckProjectionM: deckQuotes.deckProjectionM,
    sellPriceExGst: deckQuotes.sellPriceExGst,
    sellPriceIncGst: deckQuotes.sellPriceIncGst,
    gstAmount: deckQuotes.gstAmount,
    baseDeliveryFee: deckQuotes.baseDeliveryFee,
    demolitionRequired: deckQuotes.demolitionRequired,
    engineeringRequired: deckQuotes.engineeringRequired,
    permitRequired: deckQuotes.permitRequired,
  }).from(deckQuotes).where(eq(deckQuotes.clientId, clientId));

  // Eclipse: totalSellPriceEx = unit sell prices only (additional costs are separate columns)
  const eclipseRows = await db.select({
    id: eclipseQuotes.id,
    quoteNumber: eclipseQuotes.quoteNumber,
    status: eclipseQuotes.status,
    totalSellPriceEx: eclipseQuotes.totalSellPriceEx,
    totalRRPInc: eclipseQuotes.totalRRPInc,
    totalGST: eclipseQuotes.totalGST,
    totalSqm: eclipseQuotes.totalSqm,
    // Additional costs (stored as separate columns)
    footings: eclipseQuotes.footings,
    approvals: eclipseQuotes.approvals,
    gableBrackets: eclipseQuotes.gableBrackets,
    attachmentToHouse: eclipseQuotes.attachmentToHouse,
    travel: eclipseQuotes.travel,
    siteClean: eclipseQuotes.siteClean,
    demolition: eclipseQuotes.demolition,
    plumbing: eclipseQuotes.plumbing,
    concrete: eclipseQuotes.concrete,
    electrical: eclipseQuotes.electrical,
    otherCost: eclipseQuotes.otherCost,
    otherCostDescription: eclipseQuotes.otherCostDescription,
  }).from(eclipseQuotes).where(eq(eclipseQuotes.clientId, clientId));

  return {
    opq: opqWithTotals,
    deck: deckRows.map(q => {
      // Deck shared costs extracted
      const sharedCosts: SharedCostItem[] = [];
      const baseDelivery = parseFloat(q.baseDeliveryFee || "0");
      if (baseDelivery > 0) sharedCosts.push({ name: "delivery", amount: baseDelivery, source: `Deck ${q.quoteNumber}` });
      return {
        id: q.id,
        quoteNumber: q.quoteNumber,
        status: q.status,
        type: "deck" as const,
        worksPrice: parseFloat(q.sellPriceExGst || "0"),
        sharedCosts,
        label: `Deck ${q.quoteNumber} — ${q.deckWidthM || "?"}m × ${q.deckProjectionM || "?"}m`,
      };
    }),
    eclipse: eclipseRows.map(q => {
      // Eclipse shared costs extracted from separate columns
      const sharedCosts: SharedCostItem[] = [];
      const add = (name: string, val: string | null) => {
        const n = parseFloat(val || "0");
        if (n > 0) sharedCosts.push({ name, amount: n, source: `Eclipse ${q.quoteNumber}` });
      };
      add("footings", q.footings);
      add("approvals", q.approvals);
      add("gableBrackets", q.gableBrackets);
      add("attachmentToHouse", q.attachmentToHouse);
      add("travel", q.travel);
      add("siteClean", q.siteClean);
      add("demolition", q.demolition);
      add("plumbing", q.plumbing);
      add("concrete", q.concrete);
      add("electrical", q.electrical);
      if (parseFloat(q.otherCost || "0") > 0) {
        sharedCosts.push({ name: "other", amount: parseFloat(q.otherCost!), source: `Eclipse ${q.quoteNumber}: ${q.otherCostDescription || "Other"}` });
      }
      return {
        id: q.id,
        quoteNumber: q.quoteNumber,
        status: q.status,
        type: "eclipse" as const,
        worksPrice: parseFloat(q.totalSellPriceEx || "0"),
        sharedCosts,
        label: `Eclipse ${q.quoteNumber} — ${q.totalSqm || "?"}m²`,
      };
    }),
  };
}

// ─── Update Section Quote Statuses ──────────────────────────────────────────
export async function syncSectionStatuses(
  sections: { type: string; quoteId: number }[],
  newStatus: "sent" | "accepted" | "lost"
) {
  for (const s of sections) {
    if (s.type === "opq") {
      await db.update(quotes).set({ status: newStatus }).where(eq(quotes.id, s.quoteId));
    } else if (s.type === "deck") {
      await db.update(deckQuotes).set({ status: newStatus } as any).where(eq(deckQuotes.id, s.quoteId));
    } else if (s.type === "eclipse") {
      await db.update(eclipseQuotes).set({ status: newStatus } as any).where(eq(eclipseQuotes.id, s.quoteId));
    }
  }
}

// ─── Get Client Info ────────────────────────────────────────────────────────
export async function getClientInfo(clientId: number) {
  const rows = await db.select().from(crmLeads).where(eq(crmLeads.id, clientId)).limit(1);
  return rows[0] || null;
}
