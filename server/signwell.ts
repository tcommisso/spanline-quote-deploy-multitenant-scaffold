/**
 * SignWell Digital Signature Integration
 * Handles creating documents, checking status, downloading signed PDFs
 */
import { getTenantSignwellConfig } from "./tenant-integrations";

const SIGNWELL_BASE = "https://www.signwell.com/api/v1";

async function headers(tenantId?: number | null) {
  const config = await getTenantSignwellConfig(tenantId);
  if (!config.apiKey) {
    throw new Error("SignWell API key not configured for this tenant");
  }
  return {
    "X-Api-Key": config.apiKey,
    "Content-Type": "application/json",
  };
}

export interface SignWellRecipient {
  id?: string;
  name: string;
  email: string;
  role?: string;
  signing_order?: number;
}

export interface SignWellField {
  type: "signature" | "date" | "text" | "initials" | "checkbox";
  required?: boolean;
  x: number;
  y: number;
  page: number;
  width: number;
  height: number;
  recipient_id: string;
  label?: string;
}

export interface CreateDocumentOptions {
  tenantId?: number | null;
  name: string;
  fileBase64: string;
  fileName: string;
  recipients: SignWellRecipient[];
  subject?: string;
  message?: string;
  redirectUrl?: string;
  metadata?: Record<string, string>;
  embeddedSigning?: boolean;
  testMode?: boolean;
  /** If provided, places fields on the PDF instead of appending a signature page */
  fields?: SignWellField[];
  /** Contacts who receive a copy of the signed document (not signers) */
  copiedContacts?: Array<{ name: string; email: string }>;
}

export interface SignWellDocument {
  id: string;
  name: string;
  status: string;
  recipients: Array<{
    id: string;
    name: string;
    email: string;
    status: string;
    signed_at?: string;
    embedded_signing_url?: string;
  }>;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  files: Array<{ name: string; id: string }>;
  embedded_edit_url?: string;
  embedded_signing_url?: string;
}

/**
 * Create a document and send for signing
 */
export async function createDocument(opts: CreateDocumentOptions): Promise<SignWellDocument> {
  const body: any = {
    test_mode: opts.testMode ?? false,
    name: opts.name,
    files: [
      {
        name: opts.fileName,
        file_base64: opts.fileBase64,
      },
    ],
    recipients: opts.recipients.map((r, idx) => ({
      id: String(idx + 1),
      name: r.name,
      email: r.email,
      ...(r.role && { role: r.role }),
      ...(r.signing_order !== undefined && { signing_order: r.signing_order }),
    })),
    draft: false,
    with_signature_page: opts.fields ? false : true,
    reminders: true,
    allow_decline: true,
    allow_reassign: true,
    embedded_signing: opts.embeddedSigning ?? false,
  };

  // If fields are provided, place them on the document instead of using signature page
  if (opts.fields && opts.fields.length > 0) {
    body.fields = [opts.fields]; // 2D array: one array per file
  }

  if (opts.subject) body.subject = opts.subject;
  if (opts.message) body.message = opts.message;
  if (opts.redirectUrl) body.redirect_url = opts.redirectUrl;
  if (opts.metadata) body.metadata = opts.metadata;
  if (opts.copiedContacts && opts.copiedContacts.length > 0) {
    body.copied_contacts = opts.copiedContacts.map(c => ({ name: c.name, email: c.email }));
  }

  const resp = await fetch(`${SIGNWELL_BASE}/documents`, {
    method: "POST",
    headers: await headers(opts.tenantId),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`SignWell createDocument failed (${resp.status}): ${errText}`);
  }

  return resp.json();
}

/**
 * Get document status and details
 */
export async function getDocument(documentId: string, tenantId?: number | null): Promise<SignWellDocument> {
  const resp = await fetch(`${SIGNWELL_BASE}/documents/${documentId}`, {
    method: "GET",
    headers: await headers(tenantId),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`SignWell getDocument failed (${resp.status}): ${errText}`);
  }

  return resp.json();
}

/**
 * Download the completed signed PDF as a buffer
 */
export async function downloadSignedPdf(documentId: string, tenantId?: number | null): Promise<Buffer> {
  const config = await getTenantSignwellConfig(tenantId);
  if (!config.apiKey) {
    throw new Error("SignWell API key not configured for this tenant");
  }
  const resp = await fetch(`${SIGNWELL_BASE}/documents/${documentId}/completed_pdf`, {
    method: "GET",
    headers: {
      "X-Api-Key": config.apiKey,
    },
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`SignWell downloadSignedPdf failed (${resp.status}): ${errText}`);
  }

  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Send a signing reminder for a specific document
 */
export async function sendReminder(documentId: string, tenantId?: number | null): Promise<void> {
  const resp = await fetch(`${SIGNWELL_BASE}/documents/${documentId}/remind`, {
    method: "POST",
    headers: await headers(tenantId),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`SignWell sendReminder failed (${resp.status}): ${errText}`);
  }
}

/**
 * Create a document from a SignWell template
 * The template has pre-placed signature/date fields; the proposal PDF is appended as an additional file
 */
export interface CreateFromTemplateOptions {
  tenantId?: number | null;
  templateId: string;
  name: string;
  /** The proposal PDF to append to the template */
  fileBase64?: string;
  fileName?: string;
  recipients: Array<{ name: string; email: string; placeholder_name: string }>;
  subject?: string;
  message?: string;
  redirectUrl?: string;
  metadata?: Record<string, string>;
  testMode?: boolean;
  copiedContacts?: Array<{ name: string; email: string }>;
  /** Pre-fill template fields (e.g. client name, date) */
  templateFields?: Array<{ api_id: string; value: string }>;
}

export async function createDocumentFromTemplate(opts: CreateFromTemplateOptions): Promise<SignWellDocument> {
  const body: any = {
    test_mode: opts.testMode ?? false,
    template_id: opts.templateId,
    name: opts.name,
    recipients: opts.recipients.map(r => ({
      name: r.name,
      email: r.email,
      placeholder_name: r.placeholder_name,
    })),
    draft: false,
    reminders: true,
    allow_decline: true,
    allow_reassign: true,
  };

  // Append the proposal PDF as an additional file
  if (opts.fileBase64 && opts.fileName) {
    body.files = [{ name: opts.fileName, file_base64: opts.fileBase64 }];
  }

  if (opts.subject) body.subject = opts.subject;
  if (opts.message) body.message = opts.message;
  if (opts.redirectUrl) body.redirect_url = opts.redirectUrl;
  if (opts.metadata) body.metadata = opts.metadata;
  if (opts.copiedContacts && opts.copiedContacts.length > 0) {
    body.copied_contacts = opts.copiedContacts.map(c => ({ name: c.name, email: c.email }));
  }
  if (opts.templateFields && opts.templateFields.length > 0) {
    body.template_fields = opts.templateFields;
  }

  const resp = await fetch(`${SIGNWELL_BASE}/document_templates/documents`, {
    method: "POST",
    headers: await headers(opts.tenantId),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`SignWell createDocumentFromTemplate failed (${resp.status}): ${errText}`);
  }

  return resp.json();
}

/**
 * Create a SignWell template with a signature page
 * Used to set up the initial template with pre-placed fields
 */
export interface CreateTemplateOptions {
  tenantId?: number | null;
  name: string;
  fileBase64: string;
  fileName: string;
  placeholders: Array<{ name: string; }>;
  fields: SignWellField[];
  subject?: string;
  message?: string;
}

export async function createTemplate(opts: CreateTemplateOptions): Promise<{ id: string; name: string }> {
  const body: any = {
    name: opts.name,
    files: [{ name: opts.fileName, file_base64: opts.fileBase64 }],
    placeholders: opts.placeholders.map(p => ({ name: p.name })),
    fields: [opts.fields], // 2D array: one array per file
    draft: false,
    reminders: true,
    allow_decline: true,
    allow_reassign: true,
  };

  if (opts.subject) body.subject = opts.subject;
  if (opts.message) body.message = opts.message;

  const resp = await fetch(`${SIGNWELL_BASE}/document_templates`, {
    method: "POST",
    headers: await headers(opts.tenantId),
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`SignWell createTemplate failed (${resp.status}): ${errText}`);
  }

  return resp.json();
}

/**
 * Get a template by ID
 */
export async function getTemplate(templateId: string, tenantId?: number | null): Promise<any> {
  const resp = await fetch(`${SIGNWELL_BASE}/document_templates/${templateId}`, {
    method: "GET",
    headers: await headers(tenantId),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`SignWell getTemplate failed (${resp.status}): ${errText}`);
  }

  return resp.json();
}

/**
 * Cancel/void a pending document
 */
export async function cancelDocument(documentId: string, tenantId?: number | null): Promise<void> {
  const resp = await fetch(`${SIGNWELL_BASE}/documents/${documentId}`, {
    method: "DELETE",
    headers: await headers(tenantId),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`SignWell cancelDocument failed (${resp.status}): ${errText}`);
  }
}
