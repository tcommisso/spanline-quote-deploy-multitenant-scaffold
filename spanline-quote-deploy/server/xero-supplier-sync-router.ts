import { router, tenantAdminProcedure } from "./_core/trpc";
import { getDb } from "./db";
import { suppliers } from "../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { getValidAccessToken, xeroApiRequest, type XeroContact } from "./xero-client";
import { tenantScoped } from "./_core/tenant-scope";

/**
 * Fetch all Xero contacts where IsSupplier=true, paginating through all pages.
 */
async function fetchAllXeroSuppliers(connectionId: number): Promise<XeroContact[]> {
  const allSuppliers: XeroContact[] = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const result = await xeroApiRequest<{ Contacts: XeroContact[] }>(
      `/Contacts?where=IsSupplier==true&page=${page}&pageSize=${pageSize}`,
      { connectionId },
    );
    const contacts = result.Contacts || [];
    allSuppliers.push(...contacts);

    // Xero returns up to 100 per page; if fewer, we've reached the end
    if (contacts.length < pageSize) break;
    page++;
  }

  return allSuppliers;
}

/**
 * Parse a Xero contact into supplier fields.
 */
function parseXeroSupplier(contact: XeroContact): {
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  xeroContactId: string;
} {
  const name = contact.Name;
  const contactName = [contact.FirstName, contact.LastName].filter(Boolean).join(" ") || null;
  const email = contact.EmailAddress || null;

  let phone: string | null = null;
  if (contact.Phones?.length) {
    const defaultPhone = contact.Phones.find(p => p.PhoneType === "DEFAULT");
    const mobilePhone = contact.Phones.find(p => p.PhoneType === "MOBILE");
    const anyPhone = contact.Phones.find(p => p.PhoneNumber);
    const chosen = defaultPhone || mobilePhone || anyPhone;
    if (chosen?.PhoneNumber) {
      phone = [chosen.PhoneAreaCode, chosen.PhoneNumber].filter(Boolean).join(" ");
    }
  }

  let address: string | null = null;
  if (contact.Addresses?.length) {
    const street = contact.Addresses.find(a => a.AddressType === "STREET");
    const postal = contact.Addresses.find(a => a.AddressType === "POBOX");
    const addr = street || postal;
    if (addr) {
      const parts = [
        addr.AddressLine1,
        addr.AddressLine2,
        addr.City,
        addr.Region,
        addr.PostalCode,
        addr.Country,
      ].filter(Boolean);
      address = parts.join(", ") || null;
    }
  }

  return {
    name,
    contactName,
    phone,
    email,
    address,
    xeroContactId: contact.ContactID,
  };
}

export const xeroSupplierSyncRouter = router({
  /**
   * Sync suppliers from Xero. Fetches all contacts marked as IsSupplier=true,
   * upserts them into the suppliers table matching on xeroContactId.
   * Returns counts of created, updated, and skipped suppliers.
   */
  syncFromXero: tenantAdminProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const tenantId = ctx.tenant!.id;
    const userId = ctx.user!.id;

    const auth = await getValidAccessToken({ appTenantId: tenantId });
    if (!auth) throw new Error("No active Xero connection for this tenant");

    // Fetch all suppliers from Xero
    const xeroSuppliers = await fetchAllXeroSuppliers(auth.xeroConnectionId);

    // Get existing suppliers with xeroContactId for dedup
    const existingSuppliers = await db.select({
      id: suppliers.id,
      xeroContactId: suppliers.xeroContactId,
      name: suppliers.name,
    })
      .from(suppliers)
      .where(tenantScoped(suppliers.tenantId, tenantId));

    const existingByXeroId = new Map(
      existingSuppliers
        .filter(s => s.xeroContactId)
        .map(s => [s.xeroContactId!, s])
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const now = new Date();

    for (const xeroContact of xeroSuppliers) {
      // Skip archived contacts
      if (xeroContact.ContactStatus === "ARCHIVED") {
        skipped++;
        continue;
      }

      const parsed = parseXeroSupplier(xeroContact);
      const existing = existingByXeroId.get(xeroContact.ContactID);

      if (existing) {
        // Update existing supplier with latest Xero data
        await db.update(suppliers)
          .set({
            name: parsed.name,
            contactName: parsed.contactName,
            phone: parsed.phone,
            email: parsed.email,
            address: parsed.address,
            lastXeroSyncAt: now,
            isActive: true,
          })
          .where(and(
            eq(suppliers.id, existing.id),
            tenantScoped(suppliers.tenantId, tenantId),
          ));
        updated++;
      } else {
        // Check if there's a name match (manual entry without xeroContactId)
        const nameMatch = existingSuppliers.find(
          s => !s.xeroContactId && s.name.toLowerCase() === parsed.name.toLowerCase()
        );

        if (nameMatch) {
          // Link existing manual entry to Xero
          await db.update(suppliers)
            .set({
              xeroContactId: parsed.xeroContactId,
              contactName: parsed.contactName || undefined,
              phone: parsed.phone || undefined,
              email: parsed.email || undefined,
              address: parsed.address || undefined,
              lastXeroSyncAt: now,
            })
            .where(and(
              eq(suppliers.id, nameMatch.id),
              tenantScoped(suppliers.tenantId, tenantId),
            ));
          updated++;
        } else {
          // Create new supplier
          await db.insert(suppliers).values({
            tenantId,
            name: parsed.name,
            contactName: parsed.contactName,
            phone: parsed.phone,
            email: parsed.email,
            address: parsed.address,
            xeroContactId: parsed.xeroContactId,
            lastXeroSyncAt: now,
            isActive: true,
            createdBy: userId,
          });
          created++;
        }
      }
    }

    return {
      total: xeroSuppliers.length,
      created,
      updated,
      skipped,
      syncedAt: now.toISOString(),
    };
  }),

  /**
   * Get the last sync timestamp for display in the UI.
   */
  getLastSyncInfo: tenantAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const tenantId = ctx.tenant!.id;

    const [row] = await db.select({
      lastSync: suppliers.lastXeroSyncAt,
    })
      .from(suppliers)
      .where(and(
        eq(suppliers.isActive, true),
        tenantScoped(suppliers.tenantId, tenantId),
      ))
      .orderBy(suppliers.lastXeroSyncAt)
      .limit(1);

    return row?.lastSync ? { lastSyncedAt: row.lastSync.toISOString() } : null;
  }),
});
