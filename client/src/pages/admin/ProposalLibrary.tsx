import { useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileText, ImageIcon, Pencil, Plus, Trash2, Upload } from "lucide-react";
import {
  PROPOSAL_IMAGE_MIN_LONG_EDGE,
  PROPOSAL_IMAGE_MIN_SHORT_EDGE,
  PROPOSAL_LIBRARY_CONTENT_LABELS,
  PROPOSAL_LIBRARY_CONTENT_TYPES,
  PROPOSAL_LIBRARY_SECTION_LABELS,
  PROPOSAL_LIBRARY_SECTION_TYPES,
  type ProposalLibraryContentType,
  type ProposalLibrarySectionType,
} from "@shared/proposal-library";

type ProposalLibraryItem = {
  id: number;
  sectionType: ProposalLibrarySectionType;
  contentType: ProposalLibraryContentType;
  title: string;
  body?: string | null;
  imageUrl?: string | null;
  originalFileName?: string | null;
  originalImageWidth?: number | null;
  originalImageHeight?: number | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageSizeBytes?: number | null;
  imageMimeType?: string | null;
  imageWarning?: string | null;
  defaultIncluded: boolean;
  isActive: boolean;
  sortOrder: number;
};

type UploadDraft = {
  fileName: string;
  mimeType: string;
  base64: string;
  previewUrl: string;
  width?: number;
  height?: number;
  warning?: string;
};

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function formatBytes(bytes?: number | null) {
  if (!bytes) return "Unknown size";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolutionWarning(width?: number, height?: number) {
  if (!width || !height) {
    return "Resolution could not be checked before upload.";
  }
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  if (longEdge < PROPOSAL_IMAGE_MIN_LONG_EDGE || shortEdge < PROPOSAL_IMAGE_MIN_SHORT_EDGE) {
    return `Image is ${width} x ${height}px. Recommended minimum is ${PROPOSAL_IMAGE_MIN_LONG_EDGE}px on the long edge and ${PROPOSAL_IMAGE_MIN_SHORT_EDGE}px on the short edge.`;
  }
  return undefined;
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(dataUrl: string) {
  return new Promise<{ width?: number; height?: number }>((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({});
    image.src = dataUrl;
  });
}

export default function ProposalLibrary() {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sectionFilter, setSectionFilter] = useState<ProposalLibrarySectionType | "all_sections">("all_sections");
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProposalLibraryItem | null>(null);
  const [title, setTitle] = useState("");
  const [sectionType, setSectionType] = useState<ProposalLibrarySectionType>("all");
  const [contentType, setContentType] = useState<ProposalLibraryContentType>("overview");
  const [body, setBody] = useState("");
  const [defaultIncluded, setDefaultIncluded] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");
  const [uploadDraft, setUploadDraft] = useState<UploadDraft | null>(null);
  const [clearExistingImage, setClearExistingImage] = useState(false);

  const listInput = useMemo(() => ({
    ...(sectionFilter !== "all_sections" ? { sectionType: sectionFilter } : {}),
    activeOnly: !showInactive,
  }), [sectionFilter, showInactive]);

  const { data: items = [], isLoading } = trpc.proposalLibrary.list.useQuery(listInput);

  const createMutation = trpc.proposalLibrary.create.useMutation({
    onSuccess: (item) => {
      utils.proposalLibrary.list.invalidate();
      setDialogOpen(false);
      toast.success(item?.imageWarning ? "Saved with image quality warning" : "Proposal library item saved");
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateMutation = trpc.proposalLibrary.update.useMutation({
    onSuccess: () => {
      utils.proposalLibrary.list.invalidate();
      setDialogOpen(false);
      toast.success("Proposal library item updated");
      resetForm();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteMutation = trpc.proposalLibrary.delete.useMutation({
    onSuccess: () => {
      utils.proposalLibrary.list.invalidate();
      toast.success("Proposal library item archived");
    },
    onError: (error) => toast.error(error.message),
  });

  function resetForm() {
    setEditingItem(null);
    setTitle("");
    setSectionType("all");
    setContentType("overview");
    setBody("");
    setDefaultIncluded(true);
    setIsActive(true);
    setSortOrder("0");
    setUploadDraft(null);
    setClearExistingImage(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openCreate() {
    resetForm();
    if (sectionFilter !== "all_sections") setSectionType(sectionFilter);
    setDialogOpen(true);
  }

  function openEdit(item: ProposalLibraryItem) {
    setEditingItem(item);
    setTitle(item.title);
    setSectionType(item.sectionType);
    setContentType(item.contentType);
    setBody(item.body || "");
    setDefaultIncluded(Boolean(item.defaultIncluded));
    setIsActive(Boolean(item.isActive));
    setSortOrder(String(item.sortOrder ?? 0));
    setUploadDraft(null);
    setClearExistingImage(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setDialogOpen(true);
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Image must be under 15MB before upload");
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      const dimensions = await readImageDimensions(dataUrl);
      const warning = resolutionWarning(dimensions.width, dimensions.height);
      const base64 = dataUrl.split(",")[1] || "";
      setUploadDraft({
        fileName: file.name,
        mimeType: file.type,
        base64,
        previewUrl: dataUrl,
        width: dimensions.width,
        height: dimensions.height,
        warning,
      });
      setClearExistingImage(false);
      if (warning) toast.warning(warning);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load image");
    }
  }

  function handleSave() {
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle) {
      toast.error("Title is required");
      return;
    }
    if (!trimmedBody && !uploadDraft && !editingItem?.imageUrl) {
      toast.error("Add text, an image, or both");
      return;
    }

    const upload = uploadDraft ? {
      imageBase64: uploadDraft.base64,
      fileName: uploadDraft.fileName,
      mimeType: uploadDraft.mimeType,
    } : undefined;

    if (editingItem) {
      updateMutation.mutate({
        id: editingItem.id,
        sectionType,
        contentType,
        title: trimmedTitle,
        body: trimmedBody || null,
        defaultIncluded,
        isActive,
        sortOrder: Number.parseInt(sortOrder || "0", 10) || 0,
        clearImage: clearExistingImage,
        upload,
      });
    } else {
      createMutation.mutate({
        sectionType,
        contentType,
        title: trimmedTitle,
        body: trimmedBody || null,
        defaultIncluded,
        sortOrder: Number.parseInt(sortOrder || "0", 10) || 0,
        upload: upload || null,
      });
    }
  }

  const typedItems = items as ProposalLibraryItem[];
  const activeCount = typedItems.filter((item) => item.isActive).length;
  const warningCount = typedItems.filter((item) => item.imageWarning).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proposal Library</h1>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Manage reusable sales content for proposal PDFs by product type. Images are normalised on upload and flagged when the source resolution is too small for polished proposal output.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Library Item
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
        <div>
          <Label>Product / Section</Label>
          <Select value={sectionFilter} onValueChange={(value) => setSectionFilter(value as ProposalLibrarySectionType | "all_sections")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_sections">All Sections</SelectItem>
              {PROPOSAL_LIBRARY_SECTION_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {PROPOSAL_LIBRARY_SECTION_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm">
          <Checkbox checked={showInactive} onCheckedChange={(value) => setShowInactive(Boolean(value))} />
          Show archived
        </label>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{activeCount} active</Badge>
          <Badge variant={warningCount ? "destructive" : "secondary"}>{warningCount} image warning{warningCount === 1 ? "" : "s"}</Badge>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-lg border py-12 text-center text-muted-foreground">Loading proposal library...</div>
      ) : typedItems.length === 0 ? (
        <div className="rounded-lg border py-12 text-center text-muted-foreground">
          <FileText className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <p>No proposal content has been added yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {typedItems.map((item) => (
            <Card key={item.id} className={!item.isActive ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="h-36 w-full shrink-0 overflow-hidden rounded-md border bg-muted sm:w-44">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} className="h-full w-full object-contain p-2" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <ImageIcon className="h-8 w-8 opacity-40" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h2 className="font-semibold leading-tight">{item.title}</h2>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="secondary">{PROPOSAL_LIBRARY_SECTION_LABELS[item.sectionType]}</Badge>
                          <Badge variant="outline">{PROPOSAL_LIBRARY_CONTENT_LABELS[item.contentType]}</Badge>
                          {item.defaultIncluded && (
                            <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Default
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(item)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => {
                            if (confirm("Archive this proposal library item?")) deleteMutation.mutate({ id: item.id });
                          }}
                          title="Archive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {item.body && (
                      <p className="line-clamp-3 text-sm text-muted-foreground whitespace-pre-line">{item.body}</p>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>Order {item.sortOrder}</span>
                      {item.imageWidth && item.imageHeight && (
                        <span>{item.imageWidth} x {item.imageHeight}px</span>
                      )}
                      {item.imageSizeBytes && <span>{formatBytes(item.imageSizeBytes)}</span>}
                    </div>
                    {item.imageWarning && (
                      <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{item.imageWarning}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Proposal Library Item" : "Add Proposal Library Item"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Product / Section</Label>
                <Select value={sectionType} onValueChange={(value) => setSectionType(value as ProposalLibrarySectionType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROPOSAL_LIBRARY_SECTION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {PROPOSAL_LIBRARY_SECTION_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Content Type</Label>
                <Select value={contentType} onValueChange={(value) => setContentType(value as ProposalLibraryContentType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROPOSAL_LIBRARY_CONTENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {PROPOSAL_LIBRARY_CONTENT_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Why Eclipse Opening Roofs suit this home" />
            </div>

            <div>
              <Label>Text Block</Label>
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={7}
                placeholder="Add sales copy, product procedure notes, inclusions, or customer-facing explanation..."
              />
            </div>

            <div>
              <Label>Image</Label>
              <button
                type="button"
                className="mt-1 flex min-h-40 w-full flex-col items-center justify-center rounded-lg border border-dashed p-4 text-center transition-colors hover:border-primary/60"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadDraft ? (
                  <>
                    <img src={uploadDraft.previewUrl} alt="Upload preview" className="max-h-48 rounded object-contain" />
                    <span className="mt-2 text-sm font-medium">{uploadDraft.fileName}</span>
                    <span className="text-xs text-muted-foreground">
                      {uploadDraft.width && uploadDraft.height ? `${uploadDraft.width} x ${uploadDraft.height}px` : "Resolution unknown"}
                    </span>
                  </>
                ) : editingItem?.imageUrl && !clearExistingImage ? (
                  <>
                    <img src={editingItem.imageUrl} alt={editingItem.title} className="max-h-48 rounded object-contain" />
                    <span className="mt-2 text-xs text-muted-foreground">Click to replace image</span>
                  </>
                ) : (
                  <div className="text-muted-foreground">
                    <Upload className="mx-auto mb-2 h-8 w-8 opacity-50" />
                    <p className="text-sm">Upload JPG, PNG, WebP, or SVG</p>
                    <p className="text-xs">Large raster images are resized on save. Recommended minimum: {PROPOSAL_IMAGE_MIN_LONG_EDGE}px x {PROPOSAL_IMAGE_MIN_SHORT_EDGE}px.</p>
                  </div>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              {uploadDraft?.warning && (
                <div className="mt-2 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{uploadDraft.warning}</span>
                </div>
              )}
              {editingItem?.imageUrl && !uploadDraft && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-destructive"
                  onClick={() => setClearExistingImage(!clearExistingImage)}
                >
                  {clearExistingImage ? "Keep existing image" : "Remove existing image"}
                </Button>
              )}
            </div>

            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={defaultIncluded} onCheckedChange={(value) => setDefaultIncluded(Boolean(value))} />
                Default included
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={isActive} onCheckedChange={(value) => setIsActive(Boolean(value))} />
                Active
              </label>
              <div>
                <Label>Sort Order</Label>
                <Input value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} inputMode="numeric" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
