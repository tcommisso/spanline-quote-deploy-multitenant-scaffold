import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import * as XLSX from "xlsx";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertCircle, FileSpreadsheet, Save, RotateCcw, Mail, Eye, Plus, Pencil, Trash2, Upload, Wrench, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { isAdminRole } from "@shared/const";
const RichTextEditor = lazy(() => import("@/components/RichTextEditor"));

type ImportedTemplateRow = {
  templateId: string;
  category: string;
  channel: string;
  status: string;
  subject: string;
  body: string;
  autoTrigger: string;
  rowNumber: number;
};

type SkippedImportRow = {
  rowNumber: number;
  templateId?: string;
  reason: string;
};

// ─── CRM Letter Types ────────────────────────────────────────────────────────
const LETTER_TYPES = [
  { key: "unassigned_intro", label: "Unassigned Intro", description: "Sent to new leads before a Design Advisor is assigned" },
  { key: "assigned_intro", label: "Assigned Intro", description: "Sent once a Design Advisor has been assigned to the lead" },
  { key: "welcome_letter", label: "Welcome Letter", description: "Sent after contract is signed to welcome the client" },
  { key: "council_intro", label: "Council Intro", description: "Introduction letter sent to council for building applications" },
  { key: "council_out_of", label: "Council Out Of", description: "Notification that project is exempt from council approval" },
  { key: "council_no_council", label: "No Council", description: "Notification that no council approval is required" },
  { key: "construction_commencement", label: "Construction Commencement", description: "Sent to client when construction is about to commence" },
] as const;

const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  unassigned_intro: {
    subject: "Your Enquiry - Altaspan Home Additions",
    body: `Thank you for your recent enquiry regarding a home addition.\n\nAltaspan Home Additions is a national company specialising in outdoor living products including patios, carports, decks, and opening roofs. We have been enhancing Australian homes for over 30 years.\n\nYour enquiry has been received and we will be in touch shortly to discuss your requirements and arrange a convenient time for a no-obligation design consultation at your home.\n\nIn the meantime, please feel free to browse our website for inspiration and product information.\n\nKind regards,\nAltaspan Home Additions`,
  },
  assigned_intro: {
    subject: "Your Design Consultation - Altaspan Home Additions",
    body: `Thank you for your interest in Altaspan Home Additions.\n\nWe are pleased to advise that a Design Advisor has been assigned to assist you with your outdoor living project. They will be in contact shortly to introduce themselves and arrange a convenient time to visit your home for a complimentary design consultation.\n\nDuring this consultation, your Design Advisor will discuss your requirements, take measurements, and provide you with a detailed proposal tailored to your home and lifestyle.\n\nWe look forward to working with you.\n\nKind regards,\nAltaspan Home Additions`,
  },
  welcome_letter: {
    subject: "Welcome to Altaspan Home Additions",
    body: `Thank you for choosing Altaspan Home Additions for your outdoor living project.\n\nWe are delighted to confirm your contract and welcome you as a valued client. Our team is committed to delivering a quality product that will enhance your home for years to come.\n\nYour project will now move into the planning and approvals phase. Your Design Advisor will keep you informed of progress at each stage.\n\nIf you have any questions at any time, please don't hesitate to contact us.\n\nKind regards,\nAltaspan Home Additions`,
  },
  council_intro: {
    subject: "Introduction - Building Application",
    body: `We are writing to introduce ourselves regarding a building application for a residential home addition at the above address.\n\nAltaspan Home Additions is a national company specialising in outdoor living products including patios, carports, and opening roofs. We have been operating for over 30 years and are committed to quality workmanship and compliance with all relevant building standards.\n\nWe will be submitting plans for approval shortly and would appreciate your guidance on any specific requirements for this application.\n\nPlease do not hesitate to contact us if you require any additional information.\n\nKind regards,\nAltaspan Home Additions`,
  },
  council_out_of: {
    subject: "Notification - Exempt Development",
    body: `We are writing to advise that the proposed outdoor living addition at the above address falls within the exempt development provisions of the relevant planning legislation.\n\nAs such, no formal development application or building approval is required for this structure. The project will be constructed in accordance with the Building Code of Australia and all relevant Australian Standards.\n\nWe are providing this notification as a courtesy and for your records. Should you have any queries, please do not hesitate to contact us.\n\nKind regards,\nAltaspan Home Additions`,
  },
  council_no_council: {
    subject: "Notification - No Council Approval Required",
    body: `We are writing to confirm that the proposed outdoor living addition at the above address does not require council approval based on the current planning provisions and the nature of the structure.\n\nThe project will be constructed in compliance with the Building Code of Australia and all relevant Australian Standards.\n\nThis notification is provided for your information and records.\n\nKind regards,\nAltaspan Home Additions`,
  },
  construction_commencement: {
    subject: "Construction Commencement - Altaspan Home Additions",
    body: `<p>We are pleased to advise that construction of your Altaspan outdoor living addition is scheduled to commence shortly.</p><p>Please find below important information regarding the construction process:</p><h3>Before Construction Begins</h3><ul><li>Please ensure the work area is clear of furniture, plants, and personal items</li><li>Vehicle access to the property should be available for delivery of materials</li><li>Please secure any pets during the construction period</li></ul><h3>During Construction</h3><ul><li>Our construction team will arrive between 7:00am and 7:30am on the scheduled day</li><li>Construction typically takes 1-3 days depending on the scope of works</li><li>Our team will maintain a clean and safe work environment at all times</li></ul><h3>After Construction</h3><ul><li>A final inspection will be conducted with you to ensure you are satisfied with the completed works</li><li>All waste materials will be removed from your property</li><li>You will receive warranty documentation for your new addition</li></ul><p>If you have any questions or need to reschedule, please contact us as soon as possible.</p><p>Kind regards,<br/>Altaspan Home Additions</p>`,
  },
};

const TEMPLATE_CATEGORIES = [
  { value: "Client", label: "Client" },
  { value: "Trade", label: "Trade" },
  { value: "Sales", label: "Sales" },
  { value: "Pre-Construction", label: "Pre-Construction" },
  { value: "Construction", label: "Construction" },
  { value: "Warranty", label: "Warranty" },
  { value: "Accounts", label: "Accounts" },
  { value: "Rain Day", label: "Rain Day" },
  { value: "General", label: "General" },
] as const;

function cellText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeMergeFields(value: string) {
  return value.replace(/(?<!\{)\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}(?!\})/g, "{{$1}}");
}

function formatTemplateLabel(letterType: string) {
  return letterType
    .replace(/^(sales_|construction_)/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function parseTemplateWorkbook(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const worksheet = workbook.Sheets.Templates || workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) throw new Error("No worksheet found");

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
  const rows: ImportedTemplateRow[] = [];
  const skipped: SkippedImportRow[] = [];
  const seen = new Set<string>();

  rawRows.forEach((raw, index) => {
    const rowNumber = index + 2;
    const templateId = cellText(raw["Template ID"]);
    const channel = cellText(raw.Channel) || "Email";
    const subject = normalizeMergeFields(cellText(raw.Subject));
    const body = normalizeMergeFields(String(raw.Body ?? "").replace(/\r\n/g, "\n").trim());
    const category = cellText(raw.Category) || "General";

    if (!templateId) {
      skipped.push({ rowNumber, reason: "Missing Template ID" });
      return;
    }
    if (seen.has(templateId)) {
      skipped.push({ rowNumber, templateId, reason: "Duplicate Template ID" });
      return;
    }
    seen.add(templateId);
    if (channel.toLowerCase() !== "email") {
      skipped.push({ rowNumber, templateId, reason: `Unsupported channel: ${channel}` });
      return;
    }
    if (!subject || !body) {
      skipped.push({ rowNumber, templateId, reason: "Missing subject or body" });
      return;
    }

    rows.push({
      templateId,
      category,
      channel,
      status: cellText(raw.Status),
      subject,
      body,
      autoTrigger: cellText(raw["Auto Trigger"]),
      rowNumber,
    });
  });

  return { rows, skipped, sheetName: worksheet === workbook.Sheets.Templates ? "Templates" : workbook.SheetNames[0] };
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function AdminEmailTemplates() {
  const { user } = useAuth();
  const [mainTab, setMainTab] = useState<"crm" | "construction" | "sales">("crm");

  if (!isAdminRole(user?.role || "")) {
    return <div className="p-8 text-center text-muted-foreground">Admin access required.</div>;
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Email Templates</h1>
        <p className="text-muted-foreground mt-1">
          Manage email templates for CRM correspondence, construction communications, and sales outreach.
        </p>
      </div>

      <TemplateSpreadsheetImport />

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as any)}>
        <TabsList>
          <TabsTrigger value="crm" className="gap-1.5">
            <Mail className="h-4 w-4" /> CRM Letters
          </TabsTrigger>
          <TabsTrigger value="construction" className="gap-1.5">
            <Wrench className="h-4 w-4" /> Lifecycle Templates
          </TabsTrigger>
          <TabsTrigger value="sales" className="gap-1.5">
            <ShoppingBag className="h-4 w-4" /> Sales Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="crm" className="mt-4">
          <CrmLettersTab />
        </TabsContent>

        <TabsContent value="construction" className="mt-4">
          <ConstructionTemplatesTab />
        </TabsContent>

        <TabsContent value="sales" className="mt-4">
          <SalesTemplatesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TemplateSpreadsheetImport() {
  const utils = trpc.useUtils();
  const { data: allTemplates } = trpc.crm.emailTemplates.list.useQuery();
  const importMut = trpc.crm.emailTemplates.importRows.useMutation({
    onSuccess: (result) => {
      toast.success(`Imported ${result.created + result.updated} template${result.created + result.updated === 1 ? "" : "s"}`);
      utils.crm.emailTemplates.list.invalidate();
      setImportResult(result);
    },
    onError: (err) => toast.error(err.message),
  });

  const [fileName, setFileName] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [rows, setRows] = useState<ImportedTemplateRow[]>([]);
  const [skippedRows, setSkippedRows] = useState<SkippedImportRow[]>([]);
  const [importResult, setImportResult] = useState<any>(null);

  const existingLetterTypes = useMemo(
    () => new Set((allTemplates || []).map((template: any) => template.letterType)),
    [allTemplates],
  );

  const previewRows = useMemo(() => rows.map((row) => ({
    ...row,
    action: existingLetterTypes.has(row.templateId) ? "Update" : "Create",
  })), [existingLetterTypes, rows]);

  const previewCounts = useMemo(() => previewRows.reduce((counts, row) => {
    if (row.action === "Update") counts.update++;
    else counts.create++;
    return counts;
  }, { create: 0, update: 0 }), [previewRows]);

  async function handleFileChange(file?: File) {
    setImportResult(null);
    if (!file) return;
    try {
      const parsed = await parseTemplateWorkbook(file);
      setFileName(file.name);
      setSheetName(parsed.sheetName);
      setRows(parsed.rows);
      setSkippedRows(parsed.skipped);
      if (!parsed.rows.length) {
        toast.error("No importable email templates found");
      } else {
        toast.success(`Parsed ${parsed.rows.length} email template${parsed.rows.length === 1 ? "" : "s"}`);
      }
    } catch (err: any) {
      setRows([]);
      setSkippedRows([]);
      setFileName(file.name);
      setSheetName("");
      toast.error(err?.message || "Unable to read spreadsheet");
    }
  }

  function handleImport() {
    if (!rows.length) {
      toast.error("Select a spreadsheet first");
      return;
    }
    importMut.mutate({ rows });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileSpreadsheet className="h-5 w-5" />
              Import Communication Templates
            </CardTitle>
            <CardDescription>
              Upload the Templates sheet to create or update tenant-owned email templates.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <Input
              type="file"
              accept=".xlsx,.xls"
              className="max-w-full sm:w-[280px]"
              onChange={(event) => handleFileChange(event.target.files?.[0])}
            />
            <Button onClick={handleImport} disabled={!rows.length || importMut.isPending} className="w-full sm:w-auto">
              <Upload className="h-4 w-4 mr-1" />
              {importMut.isPending ? "Importing..." : "Import Templates"}
            </Button>
          </div>
        </div>
      </CardHeader>
      {(fileName || rows.length > 0 || skippedRows.length > 0 || importResult) && (
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {fileName && <Badge variant="outline">{fileName}</Badge>}
            {sheetName && <Badge variant="outline">Sheet: {sheetName}</Badge>}
            <Badge variant="secondary">{rows.length} ready</Badge>
            <Badge variant="secondary">{previewCounts.create} create</Badge>
            <Badge variant="secondary">{previewCounts.update} update</Badge>
            {skippedRows.length > 0 && <Badge variant="destructive">{skippedRows.length} skipped</Badge>}
            {importResult && (
              <Badge variant="outline">
                Applied: {importResult.created} created, {importResult.updated} updated
              </Badge>
            )}
          </div>

          {skippedRows.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="flex items-center gap-2 font-medium">
                <AlertCircle className="h-4 w-4" />
                Skipped rows
              </div>
              <div className="mt-2 grid gap-1">
                {skippedRows.slice(0, 5).map((row) => (
                  <div key={`${row.rowNumber}-${row.templateId || row.reason}`}>
                    Row {row.rowNumber}{row.templateId ? ` (${row.templateId})` : ""}: {row.reason}
                  </div>
                ))}
                {skippedRows.length > 5 && <div>{skippedRows.length - 5} more skipped rows</div>}
              </div>
            </div>
          )}

          {previewRows.length > 0 && (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Row</th>
                    <th className="px-3 py-2 text-left font-medium">Template ID</th>
                    <th className="px-3 py-2 text-left font-medium">Category</th>
                    <th className="px-3 py-2 text-left font-medium">Trigger</th>
                    <th className="px-3 py-2 text-left font-medium">Action</th>
                    <th className="px-3 py-2 text-left font-medium">Subject</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 12).map((row) => (
                    <tr key={`${row.rowNumber}-${row.templateId}`} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">{row.rowNumber}</td>
                      <td className="px-3 py-2 font-medium">{row.templateId}</td>
                      <td className="px-3 py-2">{row.category}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.autoTrigger || row.status || "-"}</td>
                      <td className="px-3 py-2">
                        <Badge variant={row.action === "Create" ? "default" : "secondary"}>{row.action}</Badge>
                      </td>
                      <td className="px-3 py-2">{row.subject}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewRows.length > 12 && (
                <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                  Showing 12 of {previewRows.length} templates.
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── CRM Letters Tab ─────────────────────────────────────────────────────────
function CrmLettersTab() {
  const utils = trpc.useUtils();
  const { data: savedTemplates, isLoading } = trpc.crm.emailTemplates.list.useQuery();
  const upsertMut = trpc.crm.emailTemplates.upsert.useMutation({
    onSuccess: () => {
      toast.success("Template saved");
      utils.crm.emailTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const resetMut = trpc.crm.emailTemplates.reset.useMutation({
    onSuccess: () => {
      toast.success("Template reset to default");
      utils.crm.emailTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [activeTab, setActiveTab] = useState<string>(LETTER_TYPES[0].key);
  const [forms, setForms] = useState<Record<string, { subject: string; body: string; attachmentUrl?: string | null; attachmentName?: string | null }>>({});
  const [previewType, setPreviewType] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const newForms: Record<string, { subject: string; body: string; attachmentUrl?: string | null; attachmentName?: string | null }> = {};
    LETTER_TYPES.forEach(({ key }) => {
      const saved = savedTemplates?.find(t => t.letterType === key);
      if (saved) {
        newForms[key] = { subject: saved.subject, body: saved.body, attachmentUrl: saved.attachmentUrl, attachmentName: saved.attachmentName };
      } else {
        newForms[key] = { ...DEFAULT_TEMPLATES[key], attachmentUrl: null, attachmentName: null };
      }
    });
    setForms(newForms);
  }, [savedTemplates]);

  const isCustomised = (key: string) => savedTemplates?.some(t => t.letterType === key) || false;

  const hasChanges = (key: string) => {
    const saved = savedTemplates?.find(t => t.letterType === key);
    const current = forms[key];
    if (!current) return false;
    if (saved) return saved.subject !== current.subject || saved.body !== current.body;
    return current.subject !== DEFAULT_TEMPLATES[key].subject || current.body !== DEFAULT_TEMPLATES[key].body;
  };

  const handleSave = (key: string) => {
    const form = forms[key];
    if (!form) return;
    upsertMut.mutate({ letterType: key, subject: form.subject, body: form.body, attachmentUrl: form.attachmentUrl, attachmentName: form.attachmentName });
  };

  const uploadAttachmentMut = trpc.crm.emailTemplates.uploadAttachment.useMutation({
    onSuccess: (data, variables) => {
      setForms(prev => ({
        ...prev,
        [variables.letterType]: { ...prev[variables.letterType], attachmentUrl: data.url, attachmentName: data.fileName }
      }));
      setUploading(false);
      toast.success(`Attachment "${data.fileName}" uploaded`);
    },
    onError: (err) => {
      setUploading(false);
      toast.error(err.message || "Failed to upload attachment");
    },
  });

  const handleAttachmentUpload = async (key: string, file: File) => {
    setUploading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadAttachmentMut.mutate({ letterType: key, fileName: file.name, fileBase64: base64 });
    };
    reader.readAsDataURL(file);
  };

  const handleReset = (key: string) => {
    resetMut.mutate({ letterType: key });
    setForms(prev => ({ ...prev, [key]: { ...DEFAULT_TEMPLATES[key] } }));
  };

  if (isLoading) return <div className="text-muted-foreground">Loading templates...</div>;

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="flex-wrap h-auto gap-1 mb-4">
        {LETTER_TYPES.map(({ key, label }) => (
          <TabsTrigger key={key} value={key} className="relative">
            {label}
            {isCustomised(key) && <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full" />}
          </TabsTrigger>
        ))}
      </TabsList>

      {LETTER_TYPES.map(({ key, label, description }) => (
        <TabsContent key={key} value={key}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    {label}
                    {isCustomised(key) && <Badge variant="secondary" className="text-xs">Customised</Badge>}
                  </CardTitle>
                  <CardDescription className="mt-1">{description}</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setPreviewType(previewType === key ? null : key)}>
                  <Eye className="h-4 w-4 mr-1" /> Preview
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Subject Line</label>
                <Input
                  value={forms[key]?.subject || ""}
                  onChange={(e) => setForms(prev => ({ ...prev, [key]: { ...prev[key], subject: e.target.value } }))}
                  placeholder="Email subject..."
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Email Body</label>
                <Suspense fallback={<div className="h-[200px] border rounded-md flex items-center justify-center text-muted-foreground text-sm">Loading editor...</div>}>
                  <RichTextEditor
                    content={forms[key]?.body || ""}
                    onChange={(html) => setForms(prev => ({ ...prev, [key]: { ...prev[key], body: html } }))}
                    placeholder="Compose your email body..."
                  />
                </Suspense>
                <p className="text-xs text-muted-foreground mt-1">
                  The greeting "Dear [Client Name]," is added automatically before the body.
                </p>
                <div className="mt-2 p-3 bg-muted/50 rounded-md border">
                  <p className="text-xs font-medium mb-1">Available Placeholder Variables</p>
                  <p className="text-xs text-muted-foreground">
                    Use <code className="bg-muted px-1 rounded">{'{{clientName}}'}</code>, <code className="bg-muted px-1 rounded">{'{{designAdvisor}}'}</code>, <code className="bg-muted px-1 rounded">{'{{siteAddress}}'}</code>, <code className="bg-muted px-1 rounded">{'{{productType}}'}</code>, <code className="bg-muted px-1 rounded">{'{{email}}'}</code> in subject or body.
                  </p>
                </div>
              </div>

              {/* PDF Attachment */}
              <div className="border rounded-lg p-4">
                <label className="text-sm font-medium mb-2 block">PDF Attachment (optional)</label>
                {forms[key]?.attachmentUrl ? (
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">{forms[key]?.attachmentName}</Badge>
                    <Button variant="outline" size="sm" onClick={() => setForms(prev => ({ ...prev, [key]: { ...prev[key], attachmentUrl: null, attachmentName: null } }))}>
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => { const file = e.target.files?.[0]; if (file) handleAttachmentUpload(key, file); }}
                      className="text-sm"
                      disabled={uploading}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Upload a PDF to attach to this letter type when sent.</p>
                  </div>
                )}
              </div>

              {/* Preview */}
              {previewType === key && (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <label className="text-xs font-medium text-muted-foreground mb-2 block">Email Preview</label>
                  <div className="bg-white rounded border p-4 space-y-3">
                    <div className="text-sm">
                      <span className="font-medium text-muted-foreground">Subject: </span>
                      <span>{forms[key]?.subject || "(empty)"}</span>
                    </div>
                    <hr />
                    <div>
                      <p className="font-semibold text-slate-800">Dear [Client Name],</p>
                      <div className="mt-2 text-slate-600 text-sm leading-relaxed prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: forms[key]?.body || "(empty)" }} />
                    </div>
                    <hr />
                    <p className="text-xs text-slate-400">This email was sent from Altaspan Home Additions.</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2 border-t">
                <Button onClick={() => handleSave(key)} disabled={upsertMut.isPending || !hasChanges(key)}>
                  <Save className="h-4 w-4 mr-1" /> Save Template
                </Button>
                <Button variant="outline" onClick={() => handleReset(key)} disabled={resetMut.isPending || !isCustomised(key)}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Reset to Default
                </Button>
                {hasChanges(key) && <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}

// ─── Lifecycle Templates Tab ─────────────────────────────────────────────────
function ConstructionTemplatesTab() {
  const utils = trpc.useUtils();
  const { data: allTemplates, isLoading } = trpc.crm.emailTemplates.list.useQuery();
  const upsertMut = trpc.crm.emailTemplates.upsert.useMutation({
    onSuccess: () => {
      toast.success("Template saved");
      utils.crm.emailTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMut = trpc.crm.emailTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template deleted");
      utils.crm.emailTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [showDialog, setShowDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [form, setForm] = useState({ name: "", subject: "", body: "", category: "Client" });
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const crmKeys: string[] = LETTER_TYPES.map(l => l.key);
  const constructionTemplates = (allTemplates || []).filter(t => !crmKeys.includes(t.letterType) && t.category !== "Sales");
  const categoryOptions = Array.from(new Set([
    ...TEMPLATE_CATEGORIES.map(c => c.value),
    ...constructionTemplates.map(t => t.category || "General"),
  ])).filter((category) => category !== "Sales");

  const filteredTemplates = filterCategory === "all"
    ? constructionTemplates
    : constructionTemplates.filter(t => t.category === filterCategory);

  function openCreate() {
    setEditingTemplate(null);
    setForm({ name: "", subject: "", body: "", category: "Client" });
    setShowDialog(true);
  }

  function openEdit(template: any) {
    setEditingTemplate(template);
    setForm({
      name: template.letterType,
      subject: template.subject,
      body: template.body,
      category: template.category || "General",
    });
    setShowDialog(true);
  }

  function handleSave() {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    // Use a slug-style letterType for construction templates
    const letterType = editingTemplate
      ? editingTemplate.letterType
      : `construction_${form.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;

    upsertMut.mutate({
      letterType,
      subject: form.subject,
      body: form.body,
      category: form.category,
    });
    setShowDialog(false);
  }

  function handleDelete(template: any) {
    if (!confirm(`Delete template "${template.letterType}"?`)) return;
    deleteMut.mutate({ id: template.id });
  }

  if (isLoading) return <div className="text-muted-foreground">Loading templates...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categoryOptions.map(category => (
                <SelectItem key={category} value={category}>
                  {TEMPLATE_CATEGORIES.find(c => c.value === category)?.label || category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{filteredTemplates.length} template{filteredTemplates.length !== 1 ? "s" : ""}</span>
        </div>
        <Button variant="brand" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> New Template
        </Button>
      </div>

      {filteredTemplates.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No lifecycle templates yet. Create one to get started.</p>
        </Card>
      )}

      <div className="grid gap-3">
        {filteredTemplates.map(template => (
          <Card key={template.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium truncate">{formatTemplateLabel(template.letterType)}</span>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {template.category || "General"}
                  </Badge>
                  {template.triggerKey && (
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {template.triggerKey}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">Subject: {template.subject}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{template.body.replace(/<[^>]*>/g, "").slice(0, 120)}...</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(template)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(template)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "New Lifecycle Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Schedule Confirmation"
                disabled={!!editingTemplate}
              />
              {editingTemplate && <p className="text-xs text-muted-foreground">Name cannot be changed after creation.</p>}
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => setForm(prev => ({ ...prev, category: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(category => (
                    <SelectItem key={category} value={category}>
                      {TEMPLATE_CATEGORIES.find(c => c.value === category)?.label || category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                "Client" templates appear when emailing clients. "Trade" templates appear when emailing trades.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={form.subject}
                onChange={e => setForm(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Email subject line..."
              />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Suspense fallback={<div className="h-[200px] border rounded-md flex items-center justify-center text-muted-foreground text-sm">Loading editor...</div>}>
                <RichTextEditor
                  content={form.body}
                  onChange={(html) => setForm(prev => ({ ...prev, body: html }))}
                  placeholder="Compose your email body..."
                />
              </Suspense>
              <div className="p-2 bg-muted/50 rounded border">
                <p className="text-xs text-muted-foreground">
                  Available placeholders: <code className="bg-muted px-1 rounded">{'{{clientName}}'}</code>, <code className="bg-muted px-1 rounded">{'{{siteAddress}}'}</code>, <code className="bg-muted px-1 rounded">{'{{quoteNumber}}'}</code>, <code className="bg-muted px-1 rounded">{'{{tradeName}}'}</code>
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={upsertMut.isPending}>
              <Save className="h-4 w-4 mr-1" /> {editingTemplate ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sales Templates Tab ─────────────────────────────────────────────────────
function SalesTemplatesTab() {
  const utils = trpc.useUtils();
  const { data: allTemplates, isLoading } = trpc.crm.emailTemplates.list.useQuery();
  const upsertMut = trpc.crm.emailTemplates.upsert.useMutation({
    onSuccess: () => {
      toast.success("Template saved");
      utils.crm.emailTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMut = trpc.crm.emailTemplates.delete.useMutation({
    onSuccess: () => {
      toast.success("Template deleted");
      utils.crm.emailTemplates.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [showDialog, setShowDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [form, setForm] = useState({ name: "", subject: "", body: "", category: "Sales" });

  // Sales templates are those with category "Sales"
  const crmKeys: string[] = LETTER_TYPES.map(l => l.key);
  const salesTemplates = (allTemplates || []).filter(t => !crmKeys.includes(t.letterType) && t.category === "Sales");

  function openCreate() {
    setEditingTemplate(null);
    setForm({ name: "", subject: "", body: "", category: "Sales" });
    setShowDialog(true);
  }

  function openEdit(template: any) {
    setEditingTemplate(template);
    setForm({
      name: template.letterType,
      subject: template.subject,
      body: template.body,
      category: "Sales",
    });
    setShowDialog(true);
  }

  function handleSave() {
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    const letterType = editingTemplate
      ? editingTemplate.letterType
      : `sales_${form.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;

    upsertMut.mutate({
      letterType,
      subject: form.subject,
      body: form.body,
      category: "Sales",
    });
    setShowDialog(false);
  }

  function handleDelete(template: any) {
    if (!confirm(`Delete template "${formatTemplateLabel(template.letterType)}"?`)) return;
    deleteMut.mutate({ id: template.id });
  }

  if (isLoading) return <div className="text-muted-foreground">Loading templates...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm text-muted-foreground">{salesTemplates.length} template{salesTemplates.length !== 1 ? "s" : ""}</span>
        <Button variant="brand" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> New Sales Template
        </Button>
      </div>

      {salesTemplates.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No sales templates yet. Create one to get started.</p>
          <p className="text-xs text-muted-foreground mt-2">
            Sales templates are used for outreach to leads, follow-ups, and promotional emails.
          </p>
        </Card>
      )}

      <div className="grid gap-3">
        {salesTemplates.map(template => (
          <Card key={template.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium truncate">{formatTemplateLabel(template.letterType)}</span>
                  <Badge variant="outline" className="text-xs shrink-0">Sales</Badge>
                  {template.triggerKey && (
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {template.triggerKey}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground truncate">Subject: {template.subject}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{template.body.replace(/<[^>]*>/g, "").slice(0, 120)}...</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(template)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(template)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Sales Template" : "New Sales Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Follow-up After Quote"
                disabled={!!editingTemplate}
              />
              {editingTemplate && <p className="text-xs text-muted-foreground">Name cannot be changed after creation.</p>}
            </div>
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input
                value={form.subject}
                onChange={e => setForm(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Email subject line..."
              />
            </div>
            <div className="space-y-2">
              <Label>Body</Label>
              <Suspense fallback={<div className="h-[200px] border rounded-md flex items-center justify-center text-muted-foreground text-sm">Loading editor...</div>}>
                <RichTextEditor
                  content={form.body}
                  onChange={(html) => setForm(prev => ({ ...prev, body: html }))}
                  placeholder="Compose your sales email body..."
                />
              </Suspense>
              <div className="p-2 bg-muted/50 rounded border">
                <p className="text-xs text-muted-foreground">
                  Available placeholders: <code className="bg-muted px-1 rounded">{'{{clientName}}'}</code>, <code className="bg-muted px-1 rounded">{'{{designAdvisor}}'}</code>, <code className="bg-muted px-1 rounded">{'{{siteAddress}}'}</code>, <code className="bg-muted px-1 rounded">{'{{productType}}'}</code>, <code className="bg-muted px-1 rounded">{'{{quoteNumber}}'}</code>
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={upsertMut.isPending}>
              <Save className="h-4 w-4 mr-1" /> {editingTemplate ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
