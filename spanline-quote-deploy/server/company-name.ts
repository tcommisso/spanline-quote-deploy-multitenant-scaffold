/**
 * company-name.ts — Server-side helper to retrieve the company name
 * from the user_settings table (companyDetails JSON field).
 * 
 * Falls back to "Altaspan" if no company name is configured.
 */
import { getDb } from "./db";
import { userSettings } from "../drizzle/schema";

const DEFAULT_COMPANY_NAME = "Altaspan";
const DEFAULT_TRADING_AS = "";

interface CompanyNameResult {
  companyName: string;
  tradingAs: string;
  displayName: string; // tradingAs if set, otherwise companyName
}

/**
 * Fetches the company name from the first user_settings row that has companyDetails.
 * This is a global setting (same for all users in the org).
 */
export async function getCompanyName(): Promise<CompanyNameResult> {
  try {
    const db = await getDb();
    if (!db) {
      return { companyName: DEFAULT_COMPANY_NAME, tradingAs: DEFAULT_TRADING_AS, displayName: DEFAULT_COMPANY_NAME };
    }

    // Get the first user settings row that has companyDetails set
    const rows = await db.select({ companyDetails: userSettings.companyDetails }).from(userSettings).limit(5);
    
    for (const row of rows) {
      if (row.companyDetails && typeof row.companyDetails === "object") {
        const details = row.companyDetails as Record<string, unknown>;
        const companyName = (details.companyName as string) || DEFAULT_COMPANY_NAME;
        const tradingAs = (details.tradingAs as string) || "";
        const displayName = tradingAs || companyName;
        return { companyName, tradingAs, displayName };
      }
    }

    return { companyName: DEFAULT_COMPANY_NAME, tradingAs: DEFAULT_TRADING_AS, displayName: DEFAULT_COMPANY_NAME };
  } catch {
    return { companyName: DEFAULT_COMPANY_NAME, tradingAs: DEFAULT_TRADING_AS, displayName: DEFAULT_COMPANY_NAME };
  }
}

/**
 * Simple helper that just returns the display name string.
 */
export async function getCompanyDisplayName(): Promise<string> {
  const result = await getCompanyName();
  return result.displayName;
}
