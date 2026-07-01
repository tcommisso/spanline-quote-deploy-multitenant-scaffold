import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  constructionJobs,
  flashingOrderLines,
  flashingOrders,
  flashingOrderStatusHistory,
  flashingProfileTemplates,
} from "../drizzle/schema.js";
import { router, tenantProcedure } from "./_core/trpc.js";
import { tenantIdFromContext } from "./_core/tenant-scope";
import { getDb } from "./db.js";
import { createOperationalInboxTicket, flashingOrderNotificationText } from "./order-notification-tickets.js";
import { storagePut } from "./storage.js";

const orderStatuses = [
  "draft",
  "submitted",
  "supplier_received",
  "in_production",
  "purchase_ordered",
  "ready",
  "completed",
  "cancelled",
  "archived",
] as const;

const lineStatuses = [
  "draft",
  "ready",
  "needs_clarification",
  "approved",
  "in_production",
  "completed",
  "cancelled",
] as const;

const colourSides = ["inside", "outside", "both", "unspecified"] as const;
const subjectAreaPhotoType = "subject_area_photo";

const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const profileGeometrySchema = z.object({
  points: z.array(pointSchema).min(2),
  gridSize: z.number().positive().default(20),
  snapToGrid: z.boolean().default(true),
  foldLabels: z.record(z.string(), z.string()).optional(),
  foldDetails: z.record(z.string(), z.any()).optional(),
  notes: z.string().optional(),
});

type ProfileGeometry = z.infer<typeof profileGeometrySchema>;
type StandardFlashingTemplate = {
  name: string;
  category: string;
  tags: string;
  defaultColourSide?: typeof colourSides[number];
  notes: string;
  geometry: ProfileGeometry;
};

function profile(
  points: Array<{ x: number; y: number }>,
  foldDetails: Record<string, any> = {},
  notes?: string,
): ProfileGeometry {
  return {
    points,
    gridSize: 20,
    snapToGrid: true,
    ...(notes ? { notes } : {}),
    foldDetails,
  };
}

const orderGuideNotes = [
  "Seeded from the Spanline Flashing Design and Order Form.",
  "Confirm colour side, dimensions in mm, non-90 degree internal angles, crush folds, quantity, and length before ordering.",
].join(" ");

const standardFlashingTemplates: StandardFlashingTemplate[] = [
  {
    name: "Barge Capping (Double-U Roof) - 280",
    category: "barge_capping",
    tags: "standard,double-u,barge,capping,crush-fold",
    notes: `${orderGuideNotes} Drawing notes: girth 280mm; 150mm face, 100mm drop, 15mm returns; crush folds shown at 126 degrees.`,
    geometry: profile(
      [{ x: 80, y: 120 }, { x: 95, y: 120 }, { x: 95, y: 220 }, { x: 245, y: 220 }, { x: 260, y: 220 }],
      {
        segmentLengths: { "segment-1": 15, "segment-2": 100, "segment-3": 150, "segment-4": 15 },
        segmentAngles: { "segment-1": 0, "segment-2": 90, "segment-3": 0, "segment-4": 0 },
        foldAngles: { "fold-1": 126, "fold-2": 92, "fold-3": 126 },
        foldTypes: { "fold-1": "crush", "fold-2": "standard", "fold-3": "crush" },
        foldNotes: { "fold-1": "126 degrees", "fold-2": "92 degrees", "fold-3": "126 degrees" },
      },
    ),
  },
  {
    name: "Ridge (Double-U or Corrolink) - 420",
    category: "ridge",
    tags: "standard,double-u,corrolink,ridge,roof",
    defaultColourSide: "both",
    notes: `${orderGuideNotes} Drawing notes: girth 420mm; 10mm returns, 200mm each side; roof pitch reference 22 degrees.`,
    geometry: profile(
      [{ x: 70, y: 180 }, { x: 80, y: 180 }, { x: 265, y: 105 }, { x: 450, y: 180 }, { x: 460, y: 180 }],
      {
        segmentLengths: { "segment-1": 10, "segment-2": 200, "segment-3": 200, "segment-4": 10 },
        foldAngles: { "fold-1": 20, "fold-2": 44, "fold-3": 20 },
        foldTypes: { "fold-1": "standard", "fold-2": "standard", "fold-3": "standard" },
        foldNotes: { "fold-1": "20 degrees", "fold-2": "44 degrees", "fold-3": "20 degrees" },
      },
    ),
  },
  {
    name: "Polygal / Twinwall / Makrolon - 100",
    category: "polycarbonate",
    tags: "standard,polygal,twinwall,makrolon,polycarbonate",
    notes: `${orderGuideNotes} Drawing notes: small stepped profile; 10/40/20/20/10mm sequence shown on guide.`,
    geometry: profile(
      [{ x: 120, y: 180 }, { x: 130, y: 180 }, { x: 170, y: 180 }, { x: 170, y: 160 }, { x: 190, y: 160 }, { x: 190, y: 140 }, { x: 200, y: 140 }],
      { segmentLengths: { "segment-1": 10, "segment-2": 40, "segment-3": 20, "segment-4": 20, "segment-5": 20, "segment-6": 10 } },
    ),
  },
  {
    name: "Roof to Roof Flashing - 450",
    category: "roof_to_roof",
    tags: "standard,roof,to,flashing,450",
    notes: `${orderGuideNotes} Drawing notes: girth 450mm; 60/150/20/200/20mm sequence with 45, 80/67, and 126 degree angle references.`,
    geometry: profile(
      [{ x: 90, y: 180 }, { x: 150, y: 120 }, { x: 300, y: 120 }, { x: 320, y: 140 }, { x: 520, y: 140 }, { x: 540, y: 160 }],
      {
        segmentLengths: { "segment-1": 60, "segment-2": 150, "segment-3": 20, "segment-4": 200, "segment-5": 20 },
        foldAngles: { "fold-1": 45, "fold-2": 80, "fold-3": 67, "fold-4": 126 },
        foldNotes: { "fold-1": "45 degrees", "fold-2": "80 degrees", "fold-3": "67 degrees", "fold-4": "126 degrees" },
      },
    ),
  },
  {
    name: "Capping - 465",
    category: "capping",
    tags: "standard,capping,465,crush-fold",
    notes: `${orderGuideNotes} Drawing notes: girth 465mm; 50/250/150/15mm sequence; crush fold 126 degrees, 92 degree main bend, 30 degree return.`,
    geometry: profile(
      [{ x: 80, y: 160 }, { x: 130, y: 135 }, { x: 380, y: 135 }, { x: 380, y: 285 }, { x: 395, y: 285 }],
      {
        segmentLengths: { "segment-1": 50, "segment-2": 250, "segment-3": 150, "segment-4": 15 },
        foldAngles: { "fold-1": 126, "fold-2": 92, "fold-3": 30 },
        foldTypes: { "fold-1": "crush", "fold-2": "standard", "fold-3": "standard" },
        foldNotes: { "fold-1": "126 degrees", "fold-2": "92 degrees", "fold-3": "30 degrees" },
      },
    ),
  },
  {
    name: "Top Flashing - 280",
    category: "top_flashing",
    tags: "standard,top,flashing,280",
    notes: `${orderGuideNotes} Drawing notes: girth 280mm; 60/200/20mm sequence; 45 degree and 126 degree angle references.`,
    geometry: profile(
      [{ x: 80, y: 170 }, { x: 140, y: 120 }, { x: 340, y: 120 }, { x: 360, y: 140 }],
      {
        segmentLengths: { "segment-1": 60, "segment-2": 200, "segment-3": 20 },
        foldAngles: { "fold-1": 45, "fold-2": 126 },
        foldNotes: { "fold-1": "45 degrees", "fold-2": "126 degrees" },
      },
    ),
  },
  {
    name: "Type 36",
    category: "standard_types",
    tags: "standard,type-36,step,cap",
    notes: `${orderGuideNotes} Generic order-guide type 36. Update A/B/C/D/E dimensions to suit the job.`,
    geometry: profile([{ x: 80, y: 160 }, { x: 120, y: 160 }, { x: 120, y: 120 }, { x: 300, y: 120 }, { x: 300, y: 160 }, { x: 330, y: 160 }]),
  },
  {
    name: "Type 37",
    category: "standard_types",
    tags: "standard,type-37,apron,downturn",
    notes: `${orderGuideNotes} Generic order-guide type 37. Update A/B/C dimensions to suit the job.`,
    geometry: profile([{ x: 100, y: 120 }, { x: 260, y: 120 }, { x: 260, y: 260 }, { x: 300, y: 300 }]),
  },
  {
    name: "Type 38",
    category: "standard_types",
    tags: "standard,type-38,return,apron,downturn",
    notes: `${orderGuideNotes} Generic order-guide type 38. Update A/B/C/D dimensions to suit the job.`,
    geometry: profile([{ x: 90, y: 150 }, { x: 120, y: 120 }, { x: 260, y: 120 }, { x: 260, y: 260 }, { x: 300, y: 300 }]),
  },
  {
    name: "Type 39",
    category: "standard_types",
    tags: "standard,type-39,angle,apron",
    notes: `${orderGuideNotes} Generic order-guide type 39. Confirm the marked angle before ordering.`,
    geometry: profile([{ x: 100, y: 110 }, { x: 100, y: 150 }, { x: 125, y: 150 }, { x: 310, y: 150 }, { x: 340, y: 180 }]),
  },
  {
    name: "Type 40",
    category: "standard_types",
    tags: "standard,type-40,z,step",
    notes: `${orderGuideNotes} Generic order-guide type 40. Update A/B/C/D dimensions to suit the job.`,
    geometry: profile([{ x: 220, y: 90 }, { x: 160, y: 90 }, { x: 160, y: 240 }, { x: 340, y: 240 }, { x: 340, y: 300 }]),
  },
  {
    name: "Type 41",
    category: "standard_types",
    tags: "standard,type-41,angle,downturn",
    notes: `${orderGuideNotes} Generic order-guide type 41. Confirm the marked angle before ordering.`,
    geometry: profile([{ x: 90, y: 120 }, { x: 130, y: 140 }, { x: 300, y: 175 }, { x: 300, y: 280 }, { x: 340, y: 320 }]),
  },
  {
    name: "Type 42",
    category: "standard_types",
    tags: "standard,type-42,z,step,return",
    notes: `${orderGuideNotes} Generic order-guide type 42. Update A/B/C/D dimensions to suit the job.`,
    geometry: profile([{ x: 100, y: 120 }, { x: 160, y: 120 }, { x: 160, y: 210 }, { x: 340, y: 210 }, { x: 370, y: 240 }]),
  },
  {
    name: "Type 43",
    category: "standard_types",
    tags: "standard,type-43,double-angle",
    notes: `${orderGuideNotes} Generic order-guide type 43. Confirm both marked angles before ordering.`,
    geometry: profile([{ x: 120, y: 90 }, { x: 120, y: 150 }, { x: 170, y: 210 }, { x: 170, y: 280 }, { x: 205, y: 330 }]),
  },
  {
    name: "Type 44",
    category: "standard_types",
    tags: "standard,type-44,angle,leg",
    notes: `${orderGuideNotes} Generic order-guide type 44. Update A/B dimensions to suit the job.`,
    geometry: profile([{ x: 220, y: 80 }, { x: 220, y: 260 }, { x: 260, y: 300 }]),
  },
  {
    name: "Type 45",
    category: "standard_types",
    tags: "standard,type-45,apron,return",
    notes: `${orderGuideNotes} Generic order-guide type 45. Update A/B/C/D dimensions to suit the job.`,
    geometry: profile([{ x: 120, y: 80 }, { x: 160, y: 120 }, { x: 160, y: 260 }, { x: 340, y: 260 }, { x: 370, y: 290 }]),
  },
  {
    name: "Type 46",
    category: "standard_types",
    tags: "standard,type-46,u,channel",
    notes: `${orderGuideNotes} Generic order-guide type 46. Update A/B/C/D dimensions to suit the job.`,
    geometry: profile([{ x: 120, y: 240 }, { x: 120, y: 120 }, { x: 320, y: 120 }, { x: 320, y: 240 }]),
  },
  {
    name: "Type 47",
    category: "standard_types",
    tags: "standard,type-47,angle,apron",
    notes: `${orderGuideNotes} Generic order-guide type 47. Confirm the marked angle before ordering.`,
    geometry: profile([{ x: 120, y: 90 }, { x: 120, y: 220 }, { x: 150, y: 260 }, { x: 330, y: 260 }, { x: 370, y: 230 }]),
  },
  {
    name: "Type 48",
    category: "standard_types",
    tags: "standard,type-48,hook,hem",
    notes: `${orderGuideNotes} Generic order-guide type 48. Hooked/hemmed ends are marked for review.`,
    geometry: profile(
      [{ x: 120, y: 80 }, { x: 120, y: 250 }, { x: 310, y: 250 }],
      { endTreatments: { start: "hook", end: "hook" }, endTreatmentLengths: { start: 10, end: 10 } },
    ),
  },
  {
    name: "Type 49",
    category: "standard_types",
    tags: "standard,type-49,hook,hem",
    notes: `${orderGuideNotes} Generic order-guide type 49. Hooked/hemmed ends are marked for review.`,
    geometry: profile(
      [{ x: 120, y: 80 }, { x: 120, y: 250 }, { x: 310, y: 250 }],
      { endTreatments: { start: "hook", end: "hook" }, endTreatmentLengths: { start: 10, end: 10 } },
    ),
  },
  {
    name: "Type 50",
    category: "standard_types",
    tags: "standard,type-50,double-return",
    notes: `${orderGuideNotes} Generic order-guide type 50. Update A/B/C dimensions to suit the job.`,
    geometry: profile([{ x: 180, y: 90 }, { x: 220, y: 130 }, { x: 220, y: 270 }, { x: 180, y: 310 }]),
  },
  {
    name: "Type 51",
    category: "standard_types",
    tags: "standard,type-51,hook,angle",
    notes: `${orderGuideNotes} Generic order-guide type 51. Confirm the marked angle before ordering.`,
    geometry: profile(
      [{ x: 100, y: 180 }, { x: 310, y: 230 }, { x: 310, y: 120 }],
      { endTreatments: { start: "hook" }, endTreatmentLengths: { start: 10 } },
    ),
  },
  {
    name: "Type 52",
    category: "standard_types",
    tags: "standard,type-52,hook,angle",
    notes: `${orderGuideNotes} Generic order-guide type 52. Drawing reference shows 250mm sloped leg, 150mm upstand, and 20/70 degree angles.`,
    geometry: profile(
      [{ x: 100, y: 170 }, { x: 335, y: 255 }, { x: 335, y: 105 }, { x: 380, y: 105 }],
      {
        segmentLengths: { "segment-1": 250, "segment-2": 150 },
        foldAngles: { "fold-1": 70 },
        foldNotes: { "fold-1": "70 degrees" },
        endTreatments: { start: "hook" },
        endTreatmentLengths: { start: 10 },
      },
    ),
  },
  {
    name: "Type 53",
    category: "standard_types",
    tags: "standard,type-53,hook,box,angle",
    notes: `${orderGuideNotes} Generic order-guide type 53. Confirm the marked angle before ordering.`,
    geometry: profile(
      [{ x: 95, y: 125 }, { x: 260, y: 170 }, { x: 260, y: 220 }, { x: 390, y: 220 }, { x: 390, y: 140 }],
      { endTreatments: { start: "hook" }, endTreatmentLengths: { start: 10 } },
    ),
  },
  {
    name: "Type 54",
    category: "standard_types",
    tags: "standard,type-54,hook,apron,angle",
    notes: `${orderGuideNotes} Generic order-guide type 54. Confirm the marked angle before ordering.`,
    geometry: profile(
      [{ x: 95, y: 130 }, { x: 260, y: 170 }, { x: 395, y: 170 }, { x: 430, y: 150 }],
      { endTreatments: { start: "hook" }, endTreatmentLengths: { start: 10 } },
    ),
  },
  {
    name: "Type 55",
    category: "standard_types",
    tags: "standard,type-55,hook,beak,turn-down",
    notes: `${orderGuideNotes} Generic order-guide type 55. Start hook and end beak/turn-down are marked for review.`,
    geometry: profile(
      [{ x: 95, y: 130 }, { x: 255, y: 170 }, { x: 390, y: 170 }, { x: 420, y: 190 }],
      {
        endTreatments: { start: "hook", end: "beak_turn_down" },
        endTreatmentLengths: { start: 10, end: 10 },
      },
    ),
  },
  {
    name: "Type 56",
    category: "standard_types",
    tags: "standard,type-56,box,channel",
    notes: `${orderGuideNotes} Generic order-guide type 56. Update A/B/C/D dimensions to suit the job.`,
    geometry: profile([{ x: 160, y: 80 }, { x: 160, y: 190 }, { x: 290, y: 190 }, { x: 290, y: 280 }, { x: 160, y: 280 }]),
  },
  {
    name: "Type 57",
    category: "standard_types",
    tags: "standard,type-57,valley,angle",
    notes: `${orderGuideNotes} Generic order-guide type 57. Confirm the marked valley angle before ordering.`,
    geometry: profile([{ x: 120, y: 110 }, { x: 250, y: 240 }, { x: 380, y: 110 }]),
  },
  {
    name: "Type 58",
    category: "standard_types",
    tags: "standard,type-58,ridge,angle",
    notes: `${orderGuideNotes} Generic order-guide type 58. Confirm the marked ridge angle before ordering.`,
    geometry: profile([{ x: 120, y: 210 }, { x: 250, y: 120 }, { x: 380, y: 210 }]),
  },
  {
    name: "Type 59",
    category: "standard_types",
    tags: "standard,type-59,ridge,angle",
    notes: `${orderGuideNotes} Generic order-guide type 59. Confirm the marked ridge angle before ordering.`,
    geometry: profile([{ x: 120, y: 220 }, { x: 250, y: 160 }, { x: 380, y: 220 }]),
  },
  {
    name: "Type 60",
    category: "standard_types",
    tags: "standard,type-60,stepped,flashing",
    notes: `${orderGuideNotes} Generic order-guide type 60. Update A/B/C/D/E/F dimensions to suit the job.`,
    geometry: profile([{ x: 80, y: 120 }, { x: 160, y: 120 }, { x: 160, y: 190 }, { x: 260, y: 190 }, { x: 260, y: 250 }, { x: 370, y: 250 }, { x: 410, y: 290 }]),
  },
];

const lineInputSchema = z.object({
  id: z.number().optional(),
  orderId: z.number(),
  templateId: z.number().nullish(),
  profileName: z.string().trim().min(1).max(255),
  category: z.string().trim().max(128).default("custom"),
  materialType: z.string().trim().max(128).default("Colorbond"),
  gauge: z.string().trim().max(64).nullish(),
  colour: z.string().trim().max(128).nullish(),
  colourSide: z.enum(colourSides).default("unspecified"),
  finish: z.string().trim().max(128).nullish(),
  quantity: z.number().int().min(1).max(999).default(1),
  lengthMm: z.number().min(1, "Length (mm) is required.").max(999999),
  unitPrice: z.number().min(0).max(999999).default(0),
  geometry: profileGeometrySchema,
  foldDetails: z.record(z.string(), z.any()).optional().default({}),
  manufacturingNotes: z.string().nullish(),
  status: z.enum(lineStatuses).default("draft"),
});

function tenantIdOrThrow(ctx: any) {
  const tenantId = tenantIdFromContext(ctx);
  if (!tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "A valid tenant context is required." });
  }
  return tenantId;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database is not available." });
  return db;
}

function distance(a: z.infer<typeof pointSchema>, b: z.infer<typeof pointSchema>) {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function profileGirthMm(geometry: z.infer<typeof profileGeometrySchema>) {
  return geometry.points.slice(1).reduce((total, point, index) => total + distance(geometry.points[index], point), 0);
}

function round2(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normaliseAttachments(value: unknown): Array<Record<string, any>> {
  return Array.isArray(value)
    ? value.filter((attachment): attachment is Record<string, any> => !!attachment && typeof attachment === "object")
    : [];
}

function uploadExtension(filename: string, mimeType: string) {
  const cleanMime = mimeType.toLowerCase();
  if (cleanMime === "image/png") return "png";
  if (cleanMime === "image/webp") return "webp";
  const fromName = filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName && ["jpg", "jpeg", "png", "webp"].includes(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  return "jpg";
}

function lineMetrics(input: z.infer<typeof lineInputSchema>) {
  const girthMm = round2(profileGirthMm(input.geometry));
  const totalLinealMetres = round2((input.lengthMm * input.quantity) / 1000);
  const bendCount = Math.max(0, input.geometry.points.length - 2);
  const lineTotal = round2(totalLinealMetres * input.unitPrice);
  return { girthMm, totalLinealMetres, bendCount, lineTotal };
}

async function nextOrderNumber(db: any, tenantId: number) {
  const [row] = await db
    .select({
      maxNumber: sql<number>`COALESCE(MAX(CAST(SUBSTRING(${flashingOrders.orderNumber}, 4) AS UNSIGNED)), 0)`,
    })
    .from(flashingOrders)
    .where(eq(flashingOrders.tenantId, tenantId));
  const next = Number(row?.maxNumber || 0) + 1;
  return `FL-${String(next).padStart(4, "0")}`;
}

async function requireOrder(db: any, tenantId: number, orderId: number) {
  const [order] = await db
    .select()
    .from(flashingOrders)
    .where(and(eq(flashingOrders.id, orderId), eq(flashingOrders.tenantId, tenantId)))
    .limit(1);
  if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Flashing order not found." });
  return order;
}

async function recalculateOrderTotals(db: any, tenantId: number, orderId: number) {
  const lines = await db
    .select({
      id: flashingOrderLines.id,
      quantity: flashingOrderLines.quantity,
      girthMm: flashingOrderLines.girthMm,
      totalLinealMetres: flashingOrderLines.totalLinealMetres,
      lineTotal: flashingOrderLines.lineTotal,
    })
    .from(flashingOrderLines)
    .where(and(eq(flashingOrderLines.orderId, orderId), eq(flashingOrderLines.tenantId, tenantId)));

  const totals = lines.reduce((acc: { totalGirthMm: number; totalLinealMetres: number; totalExGst: number }, line: any) => {
    acc.totalGirthMm += Number(line.girthMm || 0) * Number(line.quantity || 1);
    acc.totalLinealMetres += Number(line.totalLinealMetres || 0);
    acc.totalExGst += Number(line.lineTotal || 0);
    return acc;
  }, { totalGirthMm: 0, totalLinealMetres: 0, totalExGst: 0 });

  await db
    .update(flashingOrders)
    .set({
      lineCount: lines.length,
      totalGirthMm: round2(totals.totalGirthMm).toFixed(2),
      totalLinealMetres: round2(totals.totalLinealMetres).toFixed(2),
      totalExGst: round2(totals.totalExGst).toFixed(2),
    })
    .where(and(eq(flashingOrders.id, orderId), eq(flashingOrders.tenantId, tenantId)));
}

export const flashingRouter = router({
  listOrders: tenantProcedure
    .input(z.object({
      search: z.string().optional().default(""),
      status: z.enum(orderStatuses).optional(),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      const parsed = input || { search: "", limit: 25, offset: 0 };
      const conditions: any[] = [eq(flashingOrders.tenantId, tenantId)];
      const search = parsed.search?.trim();
      if (parsed.status) conditions.push(eq(flashingOrders.status, parsed.status));
      if (search) {
        const pattern = `%${search.toLowerCase()}%`;
        conditions.push(or(
          like(sql`LOWER(${flashingOrders.orderNumber})`, pattern),
          like(sql`LOWER(${flashingOrders.jobNumber})`, pattern),
          like(sql`LOWER(${flashingOrders.clientName})`, pattern),
          like(sql`LOWER(${flashingOrders.siteAddress})`, pattern),
        )!);
      }

      const whereClause = and(...conditions);
      const [totalRow] = await db.select({ total: count() }).from(flashingOrders).where(whereClause);
      const orders = await db
        .select()
        .from(flashingOrders)
        .where(whereClause)
        .orderBy(desc(flashingOrders.updatedAt))
        .limit(parsed.limit)
        .offset(parsed.offset);

      return { orders, total: totalRow?.total || 0 };
    }),

  jobsForSelect: tenantProcedure
    .input(z.object({ search: z.string().optional().default("") }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      const conditions: any[] = [eq(constructionJobs.tenantId, tenantId)];
      const search = input?.search?.trim();
      if (search) {
        const pattern = `%${search.toLowerCase()}%`;
        conditions.push(or(
          like(sql`LOWER(${constructionJobs.clientName})`, pattern),
          like(sql`LOWER(${constructionJobs.quoteNumber})`, pattern),
          like(sql`LOWER(${constructionJobs.siteAddress})`, pattern),
        )!);
      }
      return db
        .select({
          id: constructionJobs.id,
          jobNumber: constructionJobs.quoteNumber,
          clientName: constructionJobs.clientName,
          siteAddress: constructionJobs.siteAddress,
          status: constructionJobs.status,
        })
        .from(constructionJobs)
        .where(and(...conditions))
        .orderBy(desc(constructionJobs.updatedAt))
        .limit(50);
    }),

  createOrder: tenantProcedure
    .input(z.object({
      jobId: z.number().optional(),
      clientName: z.string().trim().max(255).optional(),
      siteAddress: z.string().trim().optional(),
      requestedDeliveryAt: z.string().optional(),
      deliveryMethod: z.string().trim().max(64).optional(),
      siteNotes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      let job: any = null;
      if (input.jobId) {
        [job] = await db.select().from(constructionJobs)
          .where(and(eq(constructionJobs.id, input.jobId), eq(constructionJobs.tenantId, tenantId)))
          .limit(1);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Construction job not found." });
      }

      const orderNumber = await nextOrderNumber(db, tenantId);
      const [result] = await db.insert(flashingOrders).values({
        tenantId,
        orderNumber,
        jobId: job?.id ?? null,
        jobNumber: job?.quoteNumber ?? null,
        clientName: job?.clientName ?? input.clientName ?? null,
        siteAddress: job?.siteAddress ?? input.siteAddress ?? null,
        requestedByUserId: ctx.user.id,
        requestedByName: ctx.user.name || null,
        requestedByEmail: ctx.user.email || null,
        deliveryMethod: input.deliveryMethod || "pickup",
        requestedDeliveryAt: input.requestedDeliveryAt ? new Date(input.requestedDeliveryAt) : null,
        siteNotes: input.siteNotes || null,
        createdBy: ctx.user.id,
      });

      const orderId = Number(result.insertId);
      await db.insert(flashingOrderStatusHistory).values({
        tenantId,
        orderId,
        fromStatus: null,
        toStatus: "draft",
        changedByUserId: ctx.user.id,
        changedByName: ctx.user.name || ctx.user.email || "Unknown",
        notes: "Order created",
      });
      return { id: orderId, orderNumber };
    }),

  getOrder: tenantProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      const order = await requireOrder(db, tenantId, input.id);
      const [lines, statusHistory, templates] = await Promise.all([
        db.select().from(flashingOrderLines)
          .where(and(eq(flashingOrderLines.orderId, input.id), eq(flashingOrderLines.tenantId, tenantId)))
          .orderBy(flashingOrderLines.lineNumber, flashingOrderLines.id),
        db.select().from(flashingOrderStatusHistory)
          .where(and(eq(flashingOrderStatusHistory.orderId, input.id), eq(flashingOrderStatusHistory.tenantId, tenantId)))
          .orderBy(desc(flashingOrderStatusHistory.createdAt)),
        db.select().from(flashingProfileTemplates)
          .where(and(eq(flashingProfileTemplates.tenantId, tenantId), eq(flashingProfileTemplates.isActive, true)))
          .orderBy(flashingProfileTemplates.category, flashingProfileTemplates.name)
          .limit(200),
      ]);
      return { order, lines, statusHistory, templates };
    }),

  updateOrder: tenantProcedure
    .input(z.object({
      id: z.number(),
      supplierName: z.string().trim().max(255).nullish(),
      requestedDeliveryAt: z.string().nullish(),
      deliveryMethod: z.string().trim().max(64).nullish(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      siteNotes: z.string().nullish(),
      internalNotes: z.string().nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      await requireOrder(db, tenantId, input.id);
      await db.update(flashingOrders)
        .set({
          supplierName: input.supplierName ?? null,
          requestedDeliveryAt: input.requestedDeliveryAt ? new Date(input.requestedDeliveryAt) : null,
          deliveryMethod: input.deliveryMethod ?? "pickup",
          priority: input.priority,
          siteNotes: input.siteNotes ?? null,
          internalNotes: input.internalNotes ?? null,
        })
        .where(and(eq(flashingOrders.id, input.id), eq(flashingOrders.tenantId, tenantId)));
      return { success: true };
    }),

  uploadSubjectPhoto: tenantProcedure
    .input(z.object({
      id: z.number(),
      base64: z.string().min(1),
      filename: z.string().trim().min(1).max(255),
      mimeType: z.string().trim().min(1).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      const order = await requireOrder(db, tenantId, input.id);
      if (!input.mimeType.startsWith("image/")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Subject area photo must be an image." });
      }

      const buffer = Buffer.from(input.base64, "base64");
      if (buffer.byteLength > 8 * 1024 * 1024) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Subject area photo must be under 8MB." });
      }

      const ext = uploadExtension(input.filename, input.mimeType);
      const key = `tenants/${tenantId}/flashing-orders/${input.id}/subject-area-${randomUUID()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      const attachment = {
        type: subjectAreaPhotoType,
        url,
        key,
        fileName: input.filename,
        mimeType: input.mimeType,
        uploadedAt: new Date().toISOString(),
        uploadedByUserId: ctx.user.id,
        uploadedByName: ctx.user.name || ctx.user.email || "Unknown",
      };
      const attachments = [
        ...normaliseAttachments(order.attachments).filter((item) => item.type !== subjectAreaPhotoType),
        attachment,
      ];

      await db.update(flashingOrders)
        .set({ attachments })
        .where(and(eq(flashingOrders.id, input.id), eq(flashingOrders.tenantId, tenantId)));
      return attachment;
    }),

  removeSubjectPhoto: tenantProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      const order = await requireOrder(db, tenantId, input.id);
      const attachments = normaliseAttachments(order.attachments).filter((item) => item.type !== subjectAreaPhotoType);
      await db.update(flashingOrders)
        .set({ attachments })
        .where(and(eq(flashingOrders.id, input.id), eq(flashingOrders.tenantId, tenantId)));
      return { success: true };
    }),

  saveLine: tenantProcedure
    .input(lineInputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      await requireOrder(db, tenantId, input.orderId);
      const metrics = lineMetrics(input);
      const values = {
        tenantId,
        orderId: input.orderId,
        templateId: input.templateId ?? null,
        profileName: input.profileName,
        category: input.category,
        materialType: input.materialType,
        gauge: input.gauge ?? null,
        colour: input.colour ?? null,
        colourSide: input.colourSide,
        finish: input.finish ?? null,
        quantity: input.quantity,
        lengthMm: input.lengthMm.toFixed(2),
        totalLinealMetres: metrics.totalLinealMetres.toFixed(2),
        girthMm: metrics.girthMm.toFixed(2),
        bendCount: metrics.bendCount,
        unitPrice: input.unitPrice.toFixed(2),
        lineTotal: metrics.lineTotal.toFixed(2),
        geometry: input.geometry,
        foldDetails: input.foldDetails,
        manufacturingNotes: input.manufacturingNotes ?? null,
        status: input.status,
      };

      let lineId = input.id;
      if (lineId) {
        const [line] = await db.select({ id: flashingOrderLines.id }).from(flashingOrderLines)
          .where(and(eq(flashingOrderLines.id, lineId), eq(flashingOrderLines.orderId, input.orderId), eq(flashingOrderLines.tenantId, tenantId)))
          .limit(1);
        if (!line) throw new TRPCError({ code: "NOT_FOUND", message: "Flashing line not found." });
        await db.update(flashingOrderLines)
          .set(values)
          .where(and(eq(flashingOrderLines.id, lineId), eq(flashingOrderLines.tenantId, tenantId)));
      } else {
        const [maxLine] = await db.select({ maxLine: sql<number>`COALESCE(MAX(${flashingOrderLines.lineNumber}), 0)` })
          .from(flashingOrderLines)
          .where(and(eq(flashingOrderLines.orderId, input.orderId), eq(flashingOrderLines.tenantId, tenantId)));
        const [result] = await db.insert(flashingOrderLines).values({
          ...values,
          lineNumber: Number(maxLine?.maxLine || 0) + 1,
        });
        lineId = Number(result.insertId);
      }

      await recalculateOrderTotals(db, tenantId, input.orderId);
      return { id: lineId, ...metrics };
    }),

  deleteLine: tenantProcedure
    .input(z.object({ id: z.number(), orderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      await requireOrder(db, tenantId, input.orderId);
      await db.delete(flashingOrderLines)
        .where(and(eq(flashingOrderLines.id, input.id), eq(flashingOrderLines.orderId, input.orderId), eq(flashingOrderLines.tenantId, tenantId)));
      await recalculateOrderTotals(db, tenantId, input.orderId);
      return { success: true };
    }),

  updateStatus: tenantProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(orderStatuses),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      const order = await requireOrder(db, tenantId, input.id);
      await db.update(flashingOrders)
        .set({
          status: input.status,
          submittedAt: input.status === "submitted" && !order.submittedAt ? new Date() : order.submittedAt,
        })
        .where(and(eq(flashingOrders.id, input.id), eq(flashingOrders.tenantId, tenantId)));
      await db.insert(flashingOrderStatusHistory).values({
        tenantId,
        orderId: input.id,
        fromStatus: order.status,
        toStatus: input.status,
        notes: input.notes || null,
        changedByUserId: ctx.user.id,
        changedByName: ctx.user.name || ctx.user.email || "Unknown",
      });

      if (input.status === "submitted" && order.status !== "submitted") {
        await createOperationalInboxTicket({
          tenantId,
          queue: "manufacturing",
          sourceType: "flashing-order-manufacturing",
          sourceId: input.id,
          subject: `New flashing order submitted: ${order.orderNumber}`,
          content: flashingOrderNotificationText(
            order,
            "A construction flashing order has been submitted and needs manufacturing review.",
          ),
          fromName: ctx.user.name || ctx.user.email || "Construction",
          fromAddress: ctx.user.email || null,
          matchedJobId: order.jobId || null,
          createdBy: ctx.user.id,
          createdByName: ctx.user.name || ctx.user.email || "Construction",
          channel: "web",
          priority: order.priority || "normal",
        });
      }

      return { success: true };
    }),

  listTemplates: tenantProcedure
    .input(z.object({ search: z.string().optional().default(""), category: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      const conditions: any[] = [eq(flashingProfileTemplates.tenantId, tenantId), eq(flashingProfileTemplates.isActive, true)];
      if (input?.category) conditions.push(eq(flashingProfileTemplates.category, input.category));
      if (input?.search?.trim()) {
        const pattern = `%${input.search.trim().toLowerCase()}%`;
        conditions.push(or(
          like(sql`LOWER(${flashingProfileTemplates.name})`, pattern),
          like(sql`LOWER(${flashingProfileTemplates.category})`, pattern),
          like(sql`LOWER(${flashingProfileTemplates.tags})`, pattern),
        )!);
      }
      return db.select().from(flashingProfileTemplates)
        .where(and(...conditions))
        .orderBy(flashingProfileTemplates.category, flashingProfileTemplates.name)
        .limit(200);
    }),

  seedStandardTemplates: tenantProcedure
    .mutation(async ({ ctx }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      let created = 0;
      let updated = 0;

      for (const template of standardFlashingTemplates) {
        const values = {
          tenantId,
          name: template.name,
          category: template.category,
          geometry: template.geometry,
          defaultMaterialType: "Colorbond",
          defaultGauge: "0.55 BMT",
          defaultColour: null,
          defaultColourSide: template.defaultColourSide || "outside",
          defaultQuantity: 1,
          defaultLengthMm: "0.00",
          notes: template.notes,
          tags: template.tags,
          isActive: true,
        };

        const [existing] = await db
          .select({ id: flashingProfileTemplates.id })
          .from(flashingProfileTemplates)
          .where(and(
            eq(flashingProfileTemplates.tenantId, tenantId),
            eq(flashingProfileTemplates.name, template.name),
          ))
          .limit(1);

        if (existing?.id) {
          await db
            .update(flashingProfileTemplates)
            .set(values)
            .where(and(
              eq(flashingProfileTemplates.id, existing.id),
              eq(flashingProfileTemplates.tenantId, tenantId),
            ));
          updated += 1;
        } else {
          await db.insert(flashingProfileTemplates).values({
            ...values,
            createdBy: ctx.user.id,
          });
          created += 1;
        }
      }

      return { created, updated, total: standardFlashingTemplates.length };
    }),

  saveTemplate: tenantProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(255),
      category: z.string().trim().max(128).default("custom"),
      geometry: profileGeometrySchema,
      defaultMaterialType: z.string().trim().max(128).nullish(),
      defaultGauge: z.string().trim().max(64).nullish(),
      defaultColour: z.string().trim().max(128).nullish(),
      defaultColourSide: z.enum(colourSides).default("unspecified"),
      defaultQuantity: z.number().int().min(1).default(1),
      defaultLengthMm: z.number().min(0).default(0),
      notes: z.string().nullish(),
      tags: z.string().nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      const [result] = await db.insert(flashingProfileTemplates).values({
        tenantId,
        name: input.name,
        category: input.category,
        geometry: input.geometry,
        defaultMaterialType: input.defaultMaterialType ?? null,
        defaultGauge: input.defaultGauge ?? null,
        defaultColour: input.defaultColour ?? null,
        defaultColourSide: input.defaultColourSide,
        defaultQuantity: input.defaultQuantity,
        defaultLengthMm: input.defaultLengthMm.toFixed(2),
        notes: input.notes ?? null,
        tags: input.tags ?? null,
        createdBy: ctx.user.id,
      });
      return { id: Number(result.insertId) };
    }),

  updateTemplate: tenantProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().trim().min(1).max(255),
      category: z.string().trim().max(128).default("custom"),
      geometry: profileGeometrySchema,
      defaultMaterialType: z.string().trim().max(128).nullish(),
      defaultGauge: z.string().trim().max(64).nullish(),
      defaultColour: z.string().trim().max(128).nullish(),
      defaultColourSide: z.enum(colourSides).default("unspecified"),
      defaultQuantity: z.number().int().min(1).default(1),
      defaultLengthMm: z.number().min(0).default(0),
      notes: z.string().nullish(),
      tags: z.string().nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      const [existing] = await db.select({ id: flashingProfileTemplates.id })
        .from(flashingProfileTemplates)
        .where(and(eq(flashingProfileTemplates.id, input.id), eq(flashingProfileTemplates.tenantId, tenantId)))
        .limit(1);

      if (!existing?.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      }

      await db.update(flashingProfileTemplates)
        .set({
          name: input.name,
          category: input.category,
          geometry: input.geometry,
          defaultMaterialType: input.defaultMaterialType ?? null,
          defaultGauge: input.defaultGauge ?? null,
          defaultColour: input.defaultColour ?? null,
          defaultColourSide: input.defaultColourSide,
          defaultQuantity: input.defaultQuantity,
          defaultLengthMm: input.defaultLengthMm.toFixed(2),
          notes: input.notes ?? null,
          tags: input.tags ?? null,
        })
        .where(and(eq(flashingProfileTemplates.id, input.id), eq(flashingProfileTemplates.tenantId, tenantId)));

      return { success: true };
    }),

  archiveTemplate: tenantProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      const [existing] = await db.select({ id: flashingProfileTemplates.id })
        .from(flashingProfileTemplates)
        .where(and(eq(flashingProfileTemplates.id, input.id), eq(flashingProfileTemplates.tenantId, tenantId)))
        .limit(1);

      if (!existing?.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      }

      await db.update(flashingProfileTemplates)
        .set({ isActive: false })
        .where(and(eq(flashingProfileTemplates.id, input.id), eq(flashingProfileTemplates.tenantId, tenantId)));

      return { success: true };
    }),

  duplicateTemplate: tenantProcedure
    .input(z.object({ id: z.number(), name: z.string().trim().min(1).max(255).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const tenantId = tenantIdOrThrow(ctx);
      const [template] = await db.select()
        .from(flashingProfileTemplates)
        .where(and(eq(flashingProfileTemplates.id, input.id), eq(flashingProfileTemplates.tenantId, tenantId)))
        .limit(1);

      if (!template?.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      }

      const [result] = await db.insert(flashingProfileTemplates).values({
        tenantId,
        name: input.name || `${template.name} copy`,
        category: template.category || "custom",
        geometry: template.geometry,
        defaultMaterialType: template.defaultMaterialType,
        defaultGauge: template.defaultGauge,
        defaultColour: template.defaultColour,
        defaultColourSide: template.defaultColourSide,
        defaultQuantity: template.defaultQuantity,
        defaultLengthMm: String(template.defaultLengthMm || "0.00"),
        supplierCompatibility: template.supplierCompatibility,
        notes: template.notes,
        tags: template.tags,
        version: template.version,
        isActive: true,
        createdBy: ctx.user.id,
      });

      return { id: Number(result.insertId) };
    }),
});
