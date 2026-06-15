/**
 * Xero GL Integration Helpers
 * 
 * Utilities for deriving branch, postcode, and financial data from Xero.
 */

/**
 * Derive branch from the Xero project name prefix.
 * Mapping rules (from Tony):
 *   ACT, NSW, INS = Canberra
 *   RIV = Wagga
 *   DB = Dubbo (assumed)
 *   SC = South Coast (assumed)
 *   CBS = Canberra (assumed - CBS prefix)
 */
export function deriveBranchFromProjectName(projectName: string | null | undefined): string {
  if (!projectName) return "";
  const prefix = projectName.split("-")[0]?.trim().toUpperCase();
  switch (prefix) {
    case "ACT":
    case "NSW":
    case "INS":
    case "CBS":
      return "Canberra";
    case "RIV":
      return "Wagga";
    case "DB":
      return "Dubbo";
    case "SC":
      return "South Coast";
    default:
      return prefix || "";
  }
}

/**
 * Extract postcode from a Xero contact's address.
 * Looks for STREET or POBOX type addresses and returns the PostalCode.
 */
export function extractPostcodeFromContact(contact: {
  Addresses?: Array<{
    AddressType?: string;
    PostalCode?: string;
    City?: string;
    Region?: string;
  }>;
}): string {
  if (!contact?.Addresses?.length) return "";
  // Prefer STREET address, fall back to POBOX
  const streetAddr = contact.Addresses.find(a => a.AddressType === "STREET");
  const poboxAddr = contact.Addresses.find(a => a.AddressType === "POBOX");
  const addr = streetAddr || poboxAddr || contact.Addresses[0];
  return addr?.PostalCode || "";
}

/**
 * Parse invoice line items to categorise costs.
 * Uses account codes to distinguish:
 *   - Materials: account codes starting with 4 (cost of goods/materials)
 *   - Labour: account codes starting with 5 (direct costs/labour)
 *   - Other: everything else
 * 
 * If no account codes are available, all costs go to "other".
 */
export function categoriseBillLineItems(lineItems: Array<{
  LineAmount?: number;
  AccountCode?: string;
  Description?: string;
  Tracking?: Array<{ Name: string; Option: string }>;
}>): { materials: number; labour: number; other: number } {
  let materials = 0;
  let labour = 0;
  let other = 0;

  for (const item of lineItems) {
    const amount = item.LineAmount || 0;
    const code = item.AccountCode || "";
    const desc = (item.Description || "").toLowerCase();

    // Categorise by account code prefix
    if (code.startsWith("4")) {
      // 4xx = Cost of goods / materials
      materials += amount;
    } else if (code.startsWith("5")) {
      // 5xx = Direct costs / labour / subcontractors
      labour += amount;
    } else if (desc.includes("material") || desc.includes("supply") || desc.includes("deliver")) {
      materials += amount;
    } else if (desc.includes("labour") || desc.includes("install") || desc.includes("subcontract")) {
      labour += amount;
    } else {
      other += amount;
    }
  }

  return { materials, labour, other };
}

/**
 * Filter invoices that are related to a specific project by checking:
 * 1. Reference field contains the project name or job number
 * 2. Tracking categories contain the project name
 * 
 * If no reference/tracking match is found, we include all invoices for the contact
 * (since they're already filtered by ContactID).
 */
export function filterInvoicesByProject(
  invoices: Array<{
    Reference?: string;
    Total?: number;
    AmountPaid?: number;
    AmountDue?: number;
    Status?: string;
    LineItems?: Array<{
      LineAmount?: number;
      AccountCode?: string;
      Description?: string;
      Tracking?: Array<{ Name: string; Option: string }>;
    }>;
  }>,
  projectName: string | null | undefined
): typeof invoices {
  // If no project name to filter by, return all
  if (!projectName) return invoices;

  // Extract the job number from project name (e.g. "ACT-98564-IS-AB-oc" -> "98564")
  const parts = projectName.split("-");
  const jobNumber = parts.length >= 2 ? parts[1]?.trim() : "";

  // Try to filter by reference or tracking
  const filtered = invoices.filter(inv => {
    // Check reference field
    if (inv.Reference) {
      const ref = inv.Reference.toLowerCase();
      const pn = projectName.toLowerCase();
      if (ref.includes(pn) || ref.includes(jobNumber)) return true;
    }
    // Check tracking categories on line items
    if (inv.LineItems?.length) {
      for (const item of inv.LineItems) {
        if (item.Tracking?.length) {
          for (const track of item.Tracking) {
            const opt = track.Option?.toLowerCase() || "";
            if (opt.includes(projectName.toLowerCase()) || opt.includes(jobNumber)) return true;
          }
        }
      }
    }
    return false;
  });

  // If filtering found matches, use them; otherwise return all (contact-level)
  return filtered.length > 0 ? filtered : invoices;
}
