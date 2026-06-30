export type CanonicalClientLeadLike = {
  id?: number | null;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  contactPhone?: string | null;
  phone?: string | null;
  contactEmail?: string | null;
  email?: string | null;
  contactAddress?: string | null;
  address?: string | null;
  clientNumber?: string | null;
  status?: string | null;
  displayName?: string | null;
};

export function nullableName(value?: string | null) {
  const trimmed = String(value || "").trim();
  return trimmed || null;
}

export function crmLeadDisplayName(lead?: CanonicalClientLeadLike | null) {
  if (!lead) return null;
  const firstName = nullableName(lead.contactFirstName ?? lead.firstName);
  const lastName = nullableName(lead.contactLastName ?? lead.lastName);
  return [firstName, lastName].filter(Boolean).join(" ") || nullableName(lead.company);
}

export function canonicalClientFromLead(lead?: CanonicalClientLeadLike | null) {
  const name = crmLeadDisplayName(lead);
  if (!lead || !name) return null;
  return {
    id: lead.id ?? null,
    name,
    phone: nullableName(lead.contactPhone ?? lead.phone),
    email: nullableName(lead.contactEmail ?? lead.email),
    address: nullableName(lead.contactAddress ?? lead.address),
    clientNumber: nullableName(lead.clientNumber),
    status: lead.status ?? null,
  };
}

export function canonicalClientNameFromLead(lead?: CanonicalClientLeadLike | null, fallback?: string | null) {
  return canonicalClientFromLead(lead)?.name || nullableName(fallback) || "";
}
