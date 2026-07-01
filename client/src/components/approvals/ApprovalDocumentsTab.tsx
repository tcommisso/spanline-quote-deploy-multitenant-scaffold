import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, Upload, FileText, Plus, Package, Loader2, CheckCircle2, X, FolderUp } from "lucide-react";
import { toast } from "sonner";
import { logClientDownload } from "@/lib/userActivity";

interface Props {
  projectId: number;
}

const DOC_TYPES = [
  "architectural_plans", "structural_plans", "survey", "basix_certificate",
  "stormwater_plans", "landscape_plans", "bushfire_report", "geotechnical_report",
  "heritage_report", "traffic_report", "acoustic_report", "statement_of_environmental_effects",
  "section_94_calculation", "owner_consent", "cost_summary", "energy_assessment",
  "access_report", "fire_safety", "site_plan", "floor_plan", "elevations", "sections",
  "shadow_diagram", "waste_management", "arborist_report", "specification",
  "photographs", "contract", "insurance", "condition_evidence", "other",
];

const STATUS_COLORS: Record<string, string> = {
  required: "bg-gray-100 text-gray-800",
  draft: "bg-yellow-100 text-yellow-800",
  pending_review: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  superseded: "bg-gray-100 text-gray-600",
  not_applicable: "bg-gray-50 text-gray-500",
};

const DOC_STATUSES = [
  { value: "required", label: "Required" },
  { value: "draft", label: "Draft" },
  { value: "pending_review", label: "Pending review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "superseded", label: "Superseded" },
  { value: "not_applicable", label: "Not applicable" },
];

interface BulkFile {
  file: File;
  suggestedType: string;
  suggestedTitle: string;
}

export function ApprovalDocumentsTab({ projectId }: Props) {
  const [showNew, setShowNew] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [newForm, setNewForm] = useState({ documentType: "", title: "" });
  const [bulkFiles, setBulkFiles] = useState<BulkFile[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: documents, isLoading } = trpc.approvals.documents.list.useQuery({ projectId });
  const utils = trpc.useUtils();

  const createDocument = trpc.approvals.documents.create.useMutation({
    onSuccess: () => {
      toast.success("Document created");
      setShowNew(false);
      setNewForm({ documentType: "", title: "" });
      utils.approvals.documents.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const uploadVersion = trpc.approvals.documents.uploadVersion.useMutation({
    onSuccess: () => {
      toast.success("Version uploaded");
      utils.approvals.documents.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const updateDocument = trpc.approvals.documents.update.useMutation({
    onSuccess: () => {
      toast.success("Document updated");
      utils.approvals.documents.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkUpload = trpc.approvals.bulkUpload.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.uploaded} document(s) uploaded successfully`);
      setBulkFiles([]);
      setShowBulk(false);
      utils.approvals.documents.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const generatePack = trpc.approvals.documents.generatePack.useMutation({
    onSuccess: async (data) => {
      if (data.items.length === 0) {
        toast.error("No documents with uploaded files to export");
        return;
      }
      toast.success(`Pack ready: ${data.documentCount} documents. Downloading...`);
      for (const item of data.items) {
        const link = document.createElement("a");
        link.href = item.fileUrl;
        link.download = item.fileName;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        logClientDownload({
          filename: item.fileName,
          source: "approval_document_pack_item",
          entityType: "approval_document",
          metadata: {
            projectId,
            packDownload: true,
            documentType: item.documentType,
            status: item.status,
            title: item.title,
          },
        });
        await new Promise((r) => setTimeout(r, 500));
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCreate = () => {
    if (!newForm.documentType || !newForm.title) {
      toast.error("Document type and title are required");
      return;
    }
    createDocument.mutate({
      projectId,
      documentType: newForm.documentType,
      title: newForm.title,
    });
  };

  const handleFileUpload = async (documentId: number, file: File) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadVersion.mutate({
          documentId,
          projectId,
          fileName: file.name,
          fileMimeType: file.type,
          fileBase64: base64,
        });
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const updateDocumentMeta = (doc: any, data: Record<string, unknown>) => {
    updateDocument.mutate({ id: doc.id, projectId, data });
  };

  const openDocument = (doc: any) => {
    if (!doc.latestFileUrl) {
      toast.error("No uploaded file is available for this document");
      return;
    }
    window.open(doc.latestFileUrl, "_blank", "noopener,noreferrer");
  };

  const formatOptionLabel = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  // Bulk upload handlers
  const categoriseFile = (fileName: string): { type: string; title: string } => {
    const lower = fileName.toLowerCase().replace(/[_-]/g, " ");
    const patterns: { regex: RegExp; type: string; title: string }[] = [
      { regex: /site\s*plan/, type: "site_plan", title: "Site Plan" },
      { regex: /floor\s*plan/, type: "floor_plan", title: "Floor Plan" },
      { regex: /elevation/, type: "elevations", title: "Elevations" },
      { regex: /section/, type: "sections", title: "Sections" },
      { regex: /survey/, type: "survey", title: "Survey" },
      { regex: /basix/, type: "basix_certificate", title: "BASIX Certificate" },
      { regex: /struct/, type: "structural_plans", title: "Structural Plans" },
      { regex: /geot/, type: "geotechnical_report", title: "Geotechnical Report" },
      { regex: /storm\s*water|drainage/, type: "stormwater_plans", title: "Stormwater Plans" },
      { regex: /landscap/, type: "landscape_plans", title: "Landscape Plans" },
      { regex: /shadow/, type: "shadow_diagram", title: "Shadow Diagram" },
      { regex: /waste/, type: "waste_management", title: "Waste Management Plan" },
      { regex: /bushfire|bap|bal/, type: "bushfire_report", title: "Bushfire Assessment" },
      { regex: /heritage/, type: "heritage_report", title: "Heritage Report" },
      { regex: /acoustic|noise/, type: "acoustic_report", title: "Acoustic Report" },
      { regex: /traffic/, type: "traffic_report", title: "Traffic Report" },
      { regex: /arborist|tree/, type: "arborist_report", title: "Arborist Report" },
      { regex: /statement.*environ|see|sei/, type: "statement_of_environmental_effects", title: "Statement of Environmental Effects" },
      { regex: /owner.*consent/, type: "owner_consent", title: "Owner's Consent" },
      { regex: /cost.*report|qsr|quantity/, type: "cost_summary", title: "Cost Report" },
      { regex: /spec|specification/, type: "specification", title: "Specification" },
      { regex: /photo|image/, type: "photographs", title: "Photographs" },
      { regex: /contract/, type: "contract", title: "Contract" },
      { regex: /insurance/, type: "insurance", title: "Insurance Certificate" },
      { regex: /archit/, type: "architectural_plans", title: "Architectural Plans" },
      { regex: /energy|nathers/, type: "energy_assessment", title: "Energy Assessment" },
      { regex: /fire\s*safety|fsr/, type: "fire_safety", title: "Fire Safety Report" },
      { regex: /access/, type: "access_report", title: "Access Report" },
    ];
    for (const p of patterns) {
      if (p.regex.test(lower)) return { type: p.type, title: p.title };
    }
    const nameWithoutExt = fileName.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ");
    return { type: "other", title: nameWithoutExt || "Untitled Document" };
  };

  const handleBulkFilesSelected = useCallback((files: FileList | File[]) => {
    const newBulkFiles: BulkFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i] instanceof File ? files[i] : files[i];
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 20MB limit`);
        continue;
      }
      const { type, title } = categoriseFile(file.name);
      newBulkFiles.push({ file, suggestedType: type, suggestedTitle: title });
    }
    setBulkFiles((prev) => [...prev, ...newBulkFiles]);
    if (!showBulk && newBulkFiles.length > 0) setShowBulk(true);
  }, [showBulk]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleBulkFilesSelected(e.dataTransfer.files);
    }
  }, [handleBulkFilesSelected]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const removeBulkFile = (index: number) => {
    setBulkFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const updateBulkFile = (index: number, field: "suggestedType" | "suggestedTitle", value: string) => {
    setBulkFiles((prev) => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
  };

  const handleBulkUpload = async () => {
    if (bulkFiles.length === 0) return;
    setBulkUploading(true);

    try {
      const filePayloads: { fileName: string; fileMimeType: string; fileBase64: string; documentType: string; title: string }[] = [];
      for (const bf of bulkFiles) {
        const base64 = await fileToBase64(bf.file);
        filePayloads.push({
          fileName: bf.file.name,
          fileMimeType: bf.file.type || "application/octet-stream",
          fileBase64: base64,
          documentType: bf.suggestedType,
          title: bf.suggestedTitle,
        });
      }
      bulkUpload.mutate({ projectId, files: filePayloads });
    } catch {
      toast.error("Bulk upload failed");
    } finally {
      setBulkUploading(false);
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Documents</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => generatePack.mutate({ projectId, format: "zip" })}>
            <Package className="h-4 w-4 mr-1" /> Export Pack
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setBulkFiles([]); setShowBulk(true); }}>
            <FolderUp className="h-4 w-4 mr-1" /> Bulk Upload
          </Button>
          <Dialog open={showNew} onOpenChange={setShowNew}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Add Document
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Document</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Document Type *</Label>
                  <Select value={newForm.documentType} onValueChange={(v) => setNewForm({ ...newForm, documentType: v })}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {DOC_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Title *</Label>
                  <Input
                    placeholder="e.g. Architectural Plans Rev A"
                    value={newForm.title}
                    onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                  />
                </div>
                <Button onClick={handleCreate} disabled={createDocument.isPending} className="w-full">
                  {createDocument.isPending ? "Creating..." : "Add Document"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Drag-and-drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/20"
        }`}
      >
        <FolderUp className={`h-8 w-8 mx-auto mb-2 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
        <p className="text-sm text-muted-foreground mb-2">
          Drag & drop files here for bulk upload with auto-categorisation
        </p>
        <label className="cursor-pointer">
          <Button variant="outline" size="sm" asChild>
            <span>Or choose files</span>
          </Button>
          <input
            type="file"
            multiple
            className="hidden"
            ref={bulkInputRef}
            onChange={(e) => {
              if (e.target.files) handleBulkFilesSelected(e.target.files);
              e.target.value = "";
            }}
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.dwg,.dxf"
          />
        </label>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : !documents || documents.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No documents yet. Add documents or use bulk upload to track the approval pack.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {documents.map((doc: any) => (
            <Card key={doc.id}>
              <CardContent className="p-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.latestFileName || doc.documentType.replace(/_/g, " ")} &middot; v{doc.versionCount}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:w-[32rem]">
                  <Select
                    value={doc.documentType}
                    onValueChange={(documentType) => updateDocumentMeta(doc, { documentType })}
                    disabled={updateDocument.isPending}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOC_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>{formatOptionLabel(type)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={doc.status || "draft"}
                    onValueChange={(status) => updateDocumentMeta(doc, { status })}
                    disabled={updateDocument.isPending}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOC_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <Badge variant="outline" className={STATUS_COLORS[doc.status] || ""}>
                    {(doc.status || "draft").replace(/_/g, " ")}
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openDocument(doc)}
                    disabled={!doc.latestFileUrl}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    View
                  </Button>
                  <label>
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      disabled={uploading}
                    >
                      <span>
                        <Upload className="h-3.5 w-3.5 mr-1" />
                        Upload
                      </span>
                    </Button>
                    <input
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(doc.id, file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateDocumentMeta(doc, { status: "approved" })}
                    disabled={updateDocument.isPending}
                  >
                    Approve
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bulk Upload Confirmation Dialog */}
      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderUp className="h-5 w-5" />
              Bulk Upload — Review & Confirm
            </DialogTitle>
          </DialogHeader>
          {bulkFiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No files selected. Drag files here or use the file picker.</p>
              <label className="cursor-pointer mt-4 inline-block">
                <Button variant="outline" asChild>
                  <span>Choose Files</span>
                </Button>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) handleBulkFilesSelected(e.target.files);
                    e.target.value = "";
                  }}
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx,.dwg,.dxf"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {bulkFiles.length} file(s) ready. Categories were auto-detected from filenames — adjust if needed.
              </p>
              {bulkFiles.map((bf, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="truncate text-sm font-medium" title={bf.file.name}>
                      {bf.file.name}
                      <span className="text-xs text-muted-foreground ml-1">({(bf.file.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <Select value={bf.suggestedType} onValueChange={(v) => updateBulkFile(idx, "suggestedType", v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOC_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-8 text-xs"
                      value={bf.suggestedTitle}
                      onChange={(e) => updateBulkFile(idx, "suggestedTitle", e.target.value)}
                    />
                  </div>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => removeBulkFile(idx)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulk(false)}>Cancel</Button>
            <Button
              onClick={handleBulkUpload}
              disabled={bulkUploading || bulkUpload.isPending || bulkFiles.length === 0}
            >
              {bulkUploading || bulkUpload.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Uploading...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4 mr-1" /> Upload {bulkFiles.length} File(s)</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper: convert File to base64 string
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
