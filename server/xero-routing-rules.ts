import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { xeroConnections, xeroRoutingRules } from "../drizzle/schema";
import { resolveXeroConnectionForModule, type XeroEntityModule } from "./xero-entity-routing";

export const XERO_ROUTING_FIELDS = [
  "branch",
  "postcode",
  "state",
  "jobStatus",
  "productType",
  "quoteTotal",
  "supplierName",
  "clientName",
  "projectName",
] as const;

export const XERO_ROUTING_OPERATORS = [
  "equals",
  "contains",
  "starts_with",
  "in",
  "gte",
  "lte",
] as const;

export type XeroRoutingField = (typeof XERO_ROUTING_FIELDS)[number];
export type XeroRoutingOperator = (typeof XERO_ROUTING_OPERATORS)[number];

export type XeroRoutingCondition = {
  field: XeroRoutingField | string;
  operator: XeroRoutingOperator | string;
  value: string;
};

export type XeroRoutingContext = Partial<Record<XeroRoutingField, string | number | null | undefined>>;

function normalise(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function evaluateRoutingCondition(condition: XeroRoutingCondition, context: XeroRoutingContext) {
  const actualRaw = context[condition.field as XeroRoutingField];
  const expectedRaw = condition.value;
  const actual = normalise(actualRaw);
  const expected = normalise(expectedRaw);

  switch (condition.operator) {
    case "equals":
      return actual === expected;
    case "contains":
      return actual.includes(expected);
    case "starts_with":
      return actual.startsWith(expected);
    case "in":
      return expected.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean).includes(actual);
    case "gte": {
      const actualNumber = asNumber(actualRaw);
      const expectedNumber = asNumber(expectedRaw);
      return actualNumber !== null && expectedNumber !== null && actualNumber >= expectedNumber;
    }
    case "lte": {
      const actualNumber = asNumber(actualRaw);
      const expectedNumber = asNumber(expectedRaw);
      return actualNumber !== null && expectedNumber !== null && actualNumber <= expectedNumber;
    }
    default:
      return false;
  }
}

export function evaluateRoutingRule(rule: { conditions: XeroRoutingCondition[] | null }, context: XeroRoutingContext) {
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
  if (conditions.length === 0) return true;
  return conditions.every((condition) => evaluateRoutingCondition(condition, context));
}

export async function resolveXeroConnectionWithRules(
  db: any,
  options: {
    appTenantId: number;
    moduleKey: XeroEntityModule;
    context?: XeroRoutingContext;
  },
) {
  const rules = await db
    .select({ rule: xeroRoutingRules, connection: xeroConnections })
    .from(xeroRoutingRules)
    .innerJoin(xeroConnections, eq(xeroRoutingRules.targetXeroConnectionId, xeroConnections.id))
    .where(and(
      eq(xeroRoutingRules.appTenantId, options.appTenantId),
      eq(xeroRoutingRules.isActive, true),
      inArray(xeroRoutingRules.moduleKey, [options.moduleKey, "global"]),
      eq(xeroConnections.isActive, true),
      or(eq(xeroConnections.appTenantId, options.appTenantId), isNull(xeroConnections.appTenantId)),
    ))
    .orderBy(asc(xeroRoutingRules.priority), asc(xeroRoutingRules.id));

  for (const row of rules) {
    if (evaluateRoutingRule(row.rule, options.context || {})) {
      return {
        connection: row.connection,
        matchedRule: row.rule,
        source: "rule" as const,
      };
    }
  }

  const fallbackConnection = await resolveXeroConnectionForModule(db, {
    appTenantId: options.appTenantId,
    moduleKey: options.moduleKey,
  });

  return {
    connection: fallbackConnection,
    matchedRule: null,
    source: "default" as const,
  };
}
