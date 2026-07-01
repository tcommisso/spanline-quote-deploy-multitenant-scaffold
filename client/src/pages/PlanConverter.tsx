import { useState, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminRole } from "@shared/const";
import { logClientDownload } from "@/lib/userActivity";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Plus, Upload, FileText, Download, Trash2, ArrowLeft, Loader2,
  CheckCircle, AlertCircle, Eye, Pencil, Wand2, Info, Printer, Link2, Search, Image, Lightbulb
} from "lucide-react";

type DiagramType = "floor_plan" | "elevation_front" | "elevation_side" | "elevation_rear";

const DIAGRAM_LABELS: Record<DiagramType, string> = {
  floor_plan: "Floor Plan",
  elevation_front: "Front Elevation",
  elevation_side: "Side Elevation",
  elevation_rear: "Rear Elevation",
};

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  uploaded: { label: "Uploaded", variant: "secondary" },
  extracting: { label: "Extracting...", variant: "outline" },
  review: { label: "Review", variant: "default" },
  confirmed: { label: "Confirmed", variant: "default" },
  generated: { label: "Generated", variant: "default" },
};

export default function PlanConverter() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (selectedId) {
    return <PlanConverterDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return <PlanConverterList onSelect={setSelectedId} />;
}

// ─── List View ──────────────────────────────────────────────────────────────
function PlanConverterList({ onSelect }: { onSelect: (id: number) => void }) {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role || "");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<DiagramType>("floor_plan");
  const [newClient, setNewClient] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newDrawnBy, setNewDrawnBy] = useState("");
  const [newJobId, setNewJobId] = useState<number | undefined>(undefined);
  const [templateLoading, setTemplateLoading] = useState(false);

  const { data: jobs } = trpc.construction.jobs.list.useQuery();

  const { data: projects, isLoading, refetch } = trpc.planConverter.list.useQuery();
  const createMutation = trpc.planConverter.create.useMutation({
    onSuccess: (data) => {
      toast.success("Project created");
      setCreateOpen(false);
      setNewTitle("");
      setNewClient("");
      setNewAddress("");
      onSelect(data.id);
      refetch();
    },
  });
  const deleteMutation = trpc.planConverter.delete.useMutation({
    onSuccess: () => { toast.success("Deleted"); refetch(); },
  });
  const templateMutation = trpc.planConverter.downloadTemplate.useMutation({
    onSuccess: (data, variables) => {
      const byteChars = atob(data.base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = `drawing-template-${variables?.pageSize || "A4"}.pdf`;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      logClientDownload({
        filename,
        source: "plan_converter_template_pdf",
        entityType: "plan_converter",
        mimeType: "application/pdf",
        metadata: { pageSize: variables?.pageSize || "A4" },
      });
      toast.success(`${variables?.pageSize || "A4"} template downloaded — print it and draw your plan!`);
    },
    onError: (e) => toast.error(e.message),
  });
  const indexMutation = trpc.planConverter.downloadConnectionsIndex.useMutation({
    onSuccess: (data) => {
      const byteChars = atob(data.base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = "connections-brackets-index.pdf";
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      logClientDownload({
        filename,
        source: "plan_converter_connections_index_pdf",
        entityType: "plan_converter",
        mimeType: "application/pdf",
      });
      toast.success("Connections & Brackets Index downloaded");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Plan Converter</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Convert hand-drawn plans to professional architectural drawings
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => templateMutation.mutate({ pageSize: "A4" })}
            disabled={templateMutation.isPending}
          >
            {templateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
            A4 Template
          </Button>
          <Button
            variant="outline"
            onClick={() => templateMutation.mutate({ pageSize: "A3" })}
            disabled={templateMutation.isPending}
          >
            {templateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
            A3 Template
          </Button>
          <Button
            variant="outline"
            onClick={() => indexMutation.mutate({})}
            disabled={indexMutation.isPending}
          >
            {indexMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Connections Index
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button variant="brand"><Plus className="h-4 w-4 mr-2" />New Conversion</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Plan Conversion</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <div>
                  <Label>Project Title *</Label>
                  <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Smith Residence - Patio Floor Plan" />
                </div>
                <div>
                  <Label>Diagram Type</Label>
                  <Select value={newType} onValueChange={v => setNewType(v as DiagramType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(DIAGRAM_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Client Name</Label>
                  <Input value={newClient} onChange={e => setNewClient(e.target.value)} placeholder="Client name" />
                </div>
                <div>
                  <Label>Site Address</Label>
                  <Input value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="Site address" />
                </div>
                <div>
                  <Label>Drawn By</Label>
                  <Input value={newDrawnBy} onChange={e => setNewDrawnBy(e.target.value)} placeholder="Your name or initials" />
                </div>
                <div>
                  <Label>Link to Job (optional)</Label>
                  <Select value={newJobId ? String(newJobId) : "none"} onValueChange={v => setNewJobId(v === "none" ? undefined : Number(v))}>
                    <SelectTrigger><SelectValue placeholder="Select a job..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No job linked</SelectItem>
                      {jobs?.map(j => (
                        <SelectItem key={j.id} value={String(j.id)}>
                          {j.quoteNumber ? `${j.quoteNumber} — ` : ""}{j.clientName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  disabled={!newTitle.trim() || createMutation.isPending}
                  onClick={() => createMutation.mutate({
                    projectTitle: newTitle.trim(),
                    diagramType: newType,
                    clientName: newClient || undefined,
                    siteAddress: newAddress || undefined,
                    drawnBy: newDrawnBy || undefined,
                    jobId: newJobId,
                  })}
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Drawing Instructions Card */}
      <Card className="mb-6 border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-semibold text-sm mb-1">Drawing Instructions</h3>
              <p className="text-xs text-muted-foreground mb-2">Follow these rules when hand-drawing your plans for best AI extraction results:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <div className="flex items-center gap-2"><span className="w-3 h-0.5 bg-red-500 inline-block"></span> <span><strong>Red</strong> = Existing walls/structure</span></div>
                <div className="flex items-center gap-2"><span className="w-3 h-0.5 bg-black inline-block"></span> <span><strong>Black</strong> = New structure</span></div>
                <div className="flex items-center gap-2"><span className="w-3 h-0.5 bg-blue-500 inline-block"></span> <span><strong>Blue</strong> = Dimensions (mm)</span></div>
                <div className="flex items-center gap-2"><span className="w-3 h-0.5 bg-green-500 inline-block"></span> <span><strong>Green</strong> = Connections & brackets</span></div>
                <div>Number posts: <strong>P1, P2, P3...</strong></div>
                <div>Number beams: <strong>B1, B2, B3...</strong></div>
                <div>Write scale clearly (e.g. <strong>1:100</strong>)</div>
                <div>Bracket codes: <strong>EXT-STD, PC-ALU, BP-STD...</strong></div>
                <div>Connection types: <strong>FLY, BCH, WFX, POP...</strong></div>
                <div>One diagram per page</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !projects?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-medium text-lg">No conversions yet</h3>
            <p className="text-sm text-muted-foreground mt-1 text-center max-w-sm">
              Upload a hand-drawn plan and convert it to a professional architectural drawing with title block, schedules, and branding.
            </p>
            <Button variant="brand" className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />Create First Conversion
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <Card key={p.id} className="cursor-pointer hover:shadow-md transition-shadow group" onClick={() => onSelect(p.id)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">{p.projectTitle}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.clientName || "No client"}</p>
                  </div>
                  <Badge variant={STATUS_BADGES[p.status]?.variant || "secondary"} className="ml-2 text-[10px]">
                    {STATUS_BADGES[p.status]?.label || p.status}
                  </Badge>
                </div>
                {(p as any).jobId && (
                  <div className="flex items-center gap-1 mt-2">
                    <Link2 className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      Job #{(p as any).jobId}{jobs?.find(j => j.id === (p as any).jobId)?.clientName ? ` — ${jobs.find(j => j.id === (p as any).jobId)!.clientName}` : ""}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-[10px] text-muted-foreground">{DIAGRAM_LABELS[p.diagramType as DiagramType] || p.diagramType}</span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); deleteMutation.mutate({ id: p.id }); }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Detail View ────────────────────────────────────────────────────────────
function PlanConverterDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const { data: project, isLoading, refetch } = trpc.planConverter.get.useQuery({ id });
  const [activeTab, setActiveTab] = useState("upload");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        <p className="mt-4 text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  // Auto-select tab based on status
  const effectiveTab = activeTab || (
    project.status === "uploaded" ? "upload" :
    project.status === "extracting" ? "upload" :
    project.status === "review" ? "review" :
    project.status === "confirmed" ? "review" :
    "output"
  );

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /></Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{project.projectTitle}</h1>
          <p className="text-xs text-muted-foreground">{project.clientName} — {DIAGRAM_LABELS[project.diagramType as DiagramType]}</p>
        </div>
        <Badge variant={STATUS_BADGES[project.status]?.variant || "secondary"}>
          {STATUS_BADGES[project.status]?.label || project.status}
        </Badge>
      </div>

      <Tabs value={effectiveTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="upload">1. Upload</TabsTrigger>
          <TabsTrigger value="review" disabled={!project.uploadedImageUrl}>2. Review & Edit</TabsTrigger>
          <TabsTrigger value="output" disabled={project.status !== "confirmed" && project.status !== "generated"}>3. Generate</TabsTrigger>
          <TabsTrigger value="documentation">Documentation A3</TabsTrigger>
          <TabsTrigger value="reference">Reference</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <UploadStep project={project} onRefresh={refetch} onNext={() => setActiveTab("review")} />
        </TabsContent>

        <TabsContent value="review">
          <ReviewStep project={project} onRefresh={refetch} onNext={() => setActiveTab("output")} />
        </TabsContent>

        <TabsContent value="output">
          <OutputStep project={project} onRefresh={refetch} />
        </TabsContent>

        <TabsContent value="documentation">
          <DocumentationA3Step project={project} />
        </TabsContent>

        <TabsContent value="reference">
          <BracketReferenceGallery />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Upload Step ────────────────────────────────────────────────────────────
function UploadStep({ project, onRefresh, onNext }: { project: any; onRefresh: () => void; onNext: () => void }) {
  const [uploading, setUploading] = useState(false);
  const uploadMutation = trpc.planConverter.uploadImage.useMutation({
    onSuccess: () => { toast.success("Image uploaded"); onRefresh(); },
    onError: (e) => toast.error(e.message),
  });
  const extractMutation = trpc.planConverter.extractFromImage.useMutation({
    onSuccess: () => { toast.success("Extraction complete! Review the results."); onRefresh(); onNext(); },
    onError: (e) => toast.error(`Extraction failed: ${e.message}`),
  });

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10MB)");
      return;
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadMutation.mutate({
          id: project.id,
          imageBase64: base64,
          fileName: file.name,
          mimeType: file.type,
        });
      };
      reader.readAsDataURL(file);
    } finally {
      setUploading(false);
    }
  }, [project.id]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Hand-Drawn Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {project.uploadedImageUrl ? (
              <div className="space-y-3">
                <div className="border rounded-lg overflow-hidden bg-muted">
                  <img src={project.uploadedImageUrl} alt="Uploaded drawing" className="max-h-[400px] w-full object-contain" />
                </div>
                <div className="flex gap-2">
                  <label className="cursor-pointer">
                    <Input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                    <Button variant="outline" size="sm" asChild>
                      <span><Upload className="h-3.5 w-3.5 mr-1.5" />Replace Image</span>
                    </Button>
                  </label>
                  <Button
                    onClick={() => extractMutation.mutate({ id: project.id })}
                    disabled={extractMutation.isPending}
                  >
                    {extractMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Extracting...</>
                    ) : (
                      <><Wand2 className="h-4 w-4 mr-2" />Extract Elements</>
                    )}
                  </Button>
                </div>
                {extractMutation.isPending && (
                  <p className="text-xs text-muted-foreground">AI is analyzing your drawing. This may take 15-30 seconds...</p>
                )}
              </div>
            ) : (
              <label className="cursor-pointer block">
                <Input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm font-medium">Click to upload your hand-drawn plan</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports JPG, PNG, HEIC up to 10MB</p>
                </div>
              </label>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Review Step ────────────────────────────────────────────────────────────
function ReviewStep({ project, onRefresh, onNext }: { project: any; onRefresh: () => void; onNext: () => void }) {
  const extractedData = project.extractedData as any;
  const [elements, setElements] = useState<any[]>(project.elements || extractedData?.elements || []);
  const [overallDims, setOverallDims] = useState(extractedData?.overallDimensions || { widthMm: 6000, depthMm: 4000, heightMm: 3000 });
  const [notes, setNotes] = useState(project.notes || "");

  const confirmMutation = trpc.planConverter.confirmData.useMutation({
    onSuccess: () => { toast.success("Data confirmed! Ready to generate."); onRefresh(); onNext(); },
    onError: (e) => toast.error(e.message),
  });
  const extractMutation = trpc.planConverter.extractFromImage.useMutation({
    onSuccess: (data) => {
      toast.success("Re-extraction complete");
      setElements(data.elements || []);
      setOverallDims(data.overallDimensions || overallDims);
      onRefresh();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateElement = (idx: number, field: string, value: string) => {
    setElements(prev => prev.map((el, i) => i === idx ? { ...el, [field]: value } : el));
  };

  const removeElement = (idx: number) => {
    setElements(prev => prev.filter((_, i) => i !== idx));
  };

  const addElement = () => {
    setElements(prev => [...prev, {
      elementType: "post",
      elementNumber: `P${prev.filter(e => e.elementType === "post").length + 1}`,
      label: "",
      size: "100x100",
      material: "Steel",
      colour: "",
      connectionType: "",
      bracketCode: "",
      bracketName: "",
      x1: 50,
      y1: 50,
      x2: 50,
      y2: 50,
      width: 0,
      height: 0,
    }]);
  };

  return (
    <div className="space-y-4">
      {/* Confidence indicator */}
      {extractedData?.confidence && (
        <Card className={`border-l-4 ${
          extractedData.confidence === "high" ? "border-l-green-500" :
          extractedData.confidence === "medium" ? "border-l-yellow-500" : "border-l-red-500"
        }`}>
          <CardContent className="p-3 flex items-center gap-2">
            {extractedData.confidence === "high" ? <CheckCircle className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-yellow-500" />}
            <span className="text-sm">
              AI confidence: <strong className="capitalize">{extractedData.confidence}</strong>
              {extractedData.notes && ` — ${extractedData.notes}`}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Side-by-side: image + elements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Original image */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Original Drawing</CardTitle>
          </CardHeader>
          <CardContent>
            {project.uploadedImageUrl && (
              <img src={project.uploadedImageUrl} alt="Drawing" className="w-full rounded border" />
            )}
            <Button variant="outline" size="sm" className="mt-2" onClick={() => extractMutation.mutate({ id: project.id })} disabled={extractMutation.isPending}>
              {extractMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
              Re-extract
            </Button>
          </CardContent>
        </Card>

        {/* Overall dimensions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Overall Dimensions (mm)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Width</Label>
                <Input type="number" value={overallDims.widthMm} onChange={e => setOverallDims({ ...overallDims, widthMm: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Depth</Label>
                <Input type="number" value={overallDims.depthMm} onChange={e => setOverallDims({ ...overallDims, depthMm: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-xs">Height</Label>
                <Input type="number" value={overallDims.heightMm || 0} onChange={e => setOverallDims({ ...overallDims, heightMm: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes & Specifications</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Add construction notes, colour specifications, material requirements..." />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Elements table */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Extracted Elements ({elements.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={addElement}><Plus className="h-3 w-3 mr-1" />Add</Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-1.5 font-medium">Type</th>
                  <th className="text-left p-1.5 font-medium">No.</th>
                  <th className="text-left p-1.5 font-medium">Label</th>
                  <th className="text-left p-1.5 font-medium">Size</th>
                  <th className="text-left p-1.5 font-medium">Material</th>
                  <th className="text-left p-1.5 font-medium">Colour</th>
                  <th className="text-left p-1.5 font-medium">Connection</th>
                  <th className="text-left p-1.5 font-medium">Bracket</th>
                  <th className="p-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {elements.map((el, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="p-1">
                      <Select value={el.elementType} onValueChange={v => updateElement(idx, "elementType", v)}>
                        <SelectTrigger className="h-7 text-xs w-[100px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="post">Post</SelectItem>
                          <SelectItem value="beam">Beam</SelectItem>
                          <SelectItem value="wall_existing">Existing Wall</SelectItem>
                          <SelectItem value="wall_new">New Wall</SelectItem>
                          <SelectItem value="opening">Opening</SelectItem>
                          <SelectItem value="dimension">Dimension</SelectItem>
                          <SelectItem value="annotation">Annotation</SelectItem>
                          <SelectItem value="roof_line">Roof Line</SelectItem>
                          <SelectItem value="gutter">Gutter</SelectItem>
                          <SelectItem value="fascia">Fascia</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-1"><Input className="h-7 text-xs w-14" value={el.elementNumber || ""} onChange={e => updateElement(idx, "elementNumber", e.target.value)} /></td>
                    <td className="p-1"><Input className="h-7 text-xs w-28" value={el.label || ""} onChange={e => updateElement(idx, "label", e.target.value)} /></td>
                    <td className="p-1"><Input className="h-7 text-xs w-20" value={el.size || ""} onChange={e => updateElement(idx, "size", e.target.value)} /></td>
                    <td className="p-1"><Input className="h-7 text-xs w-20" value={el.material || ""} onChange={e => updateElement(idx, "material", e.target.value)} /></td>
                    <td className="p-1"><Input className="h-7 text-xs w-24" value={el.colour || ""} onChange={e => updateElement(idx, "colour", e.target.value)} /></td>
                    <td className="p-1">
                      <Select value={el.connectionType || ""} onValueChange={v => updateElement(idx, "connectionType", v)}>
                        <SelectTrigger className="h-7 text-xs w-[80px]"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="FLY">FLY</SelectItem>
                          <SelectItem value="BCH">BCH</SelectItem>
                          <SelectItem value="CRK">CRK</SelectItem>
                          <SelectItem value="FSS">FSS</SelectItem>
                          <SelectItem value="GBL">GBL</SelectItem>
                          <SelectItem value="POP">POP</SelectItem>
                          <SelectItem value="WFX">WFX</SelectItem>
                          <SelectItem value="SPL">SPL</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-1">
                      <BracketPickerCell
                        value={el.bracketCode || ""}
                        onChange={(code, name) => {
                          updateElement(idx, "bracketCode", code);
                          if (name) updateElement(idx, "bracketName", name);
                        }}
                      />
                    </td>
                    <td className="p-1">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeElement(idx)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {elements.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">No elements extracted. Upload an image and run extraction, or add elements manually.</p>
          )}
        </CardContent>
      </Card>

      {/* Auto-Suggest Brackets Panel */}
      <BracketSuggestionsPanel elements={elements} onApply={(idx, code, name, conn) => {
        updateElement(idx, "bracketCode", code);
        updateElement(idx, "bracketName", name);
        if (conn) updateElement(idx, "connectionType", conn);
      }} />

      {/* Confirm button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={() => confirmMutation.mutate({
            id: project.id,
            elements,
            overallDimensions: overallDims,
            notes: notes || undefined,
          })}
          disabled={confirmMutation.isPending || elements.length === 0}
        >
          {confirmMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
          Confirm & Lock Data
        </Button>
      </div>
    </div>
  );
}

// ─── Output Step ────────────────────────────────────────────────────────────
function OutputStep({ project, onRefresh }: { project: any; onRefresh: () => void }) {
  const generateMutation = trpc.planConverter.generatePdf.useMutation({
    onSuccess: (data) => {
      toast.success("PDF generated!");
      onRefresh();
    },
    onError: (e) => toast.error(`Generation failed: ${e.message}`),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Generate Architectural Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Generate a professional A3 landscape PDF with architectural line weights, title block, element schedule, scale bar, and branding.
          </p>

          <div className="flex gap-2">
            <Button
              onClick={() => generateMutation.mutate({ id: project.id })}
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating PDF...</>
              ) : (
                <><FileText className="h-4 w-4 mr-2" />Generate PDF</>
              )}
            </Button>
          </div>

          {project.generatedPdfUrl && (
            <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/20">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium">PDF Generated Successfully</p>
                  <p className="text-xs text-muted-foreground">A3 landscape architectural plan ready for download</p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href={project.generatedPdfUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="h-3.5 w-3.5 mr-1.5" />Download PDF
                  </a>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


// ─── Bracket Suggestions Panel ────────────────────────────────────────────
function BracketSuggestionsPanel({ elements, onApply }: {
  elements: any[];
  onApply: (idx: number, code: string, name: string, conn?: string) => void;
}) {
  // Only show for posts and beams that don't already have brackets assigned
  const eligibleElements = elements
    .map((el, idx) => ({ ...el, idx }))
    .filter(el => (el.elementType === "post" || el.elementType === "beam" || el.elementType === "wall_existing") && !el.bracketCode);

  // Get suggestions for the first eligible element (to avoid too many queries)
  const firstEl = eligibleElements[0];
  const { data: suggestions } = trpc.planConverter.suggestBrackets.useQuery(
    {
      elementType: firstEl?.elementType || "post",
      connectionType: firstEl?.connectionType || undefined,
      attachedToHouse: elements.some(e => e.elementType === "wall_existing"),
      isFreeStanding: !elements.some(e => e.elementType === "wall_existing"),
    },
    { enabled: !!firstEl }
  );

  if (!firstEl || !suggestions || suggestions.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-600" />
          Suggested Brackets
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground mb-3">
          Based on element types detected, these brackets are recommended. Click "Apply" to assign to unassigned elements.
        </p>
        <div className="space-y-2">
          {suggestions.slice(0, 5).map((s, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded bg-background border text-xs">
              <div className="flex-1">
                <span className="font-mono font-medium text-amber-700 dark:text-amber-400">{s.bracketCode}</span>
                <span className="ml-2 text-muted-foreground">{s.bracketName}</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">{s.reason}</p>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <Badge variant="outline" className="text-[9px]">
                  {s.confidence === "high" ? "Recommended" : s.confidence === "medium" ? "Consider" : "Optional"}
                </Badge>
                {eligibleElements.filter(el => el.elementType === firstEl.elementType).map(el => (
                  <Button key={el.idx} variant="outline" size="sm" className="h-6 text-[10px] px-2"
                    onClick={() => onApply(el.idx, s.bracketCode, s.bracketName, s.connectionType || undefined)}
                  >
                    Apply to {el.elementNumber || el.elementType}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Bracket Picker Cell ───────────────────────────────────────────────────
function BracketPickerCell({ value, onChange }: { value: string; onChange: (code: string, name?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("bracket");

  const { data: images } = trpc.planConverter.listProductImages.useQuery(
    category === "all" ? {} : { category },
    { enabled: open }
  );
  const { data: searchResults } = trpc.planConverter.searchProductImages.useQuery(
    { query: search },
    { enabled: open && search.length >= 2 }
  );

  const displayImages = search.length >= 2 ? searchResults : images;

  // Find the current bracket image for thumbnail display
  const { data: currentImage } = trpc.planConverter.searchProductImages.useQuery(
    { query: value },
    { enabled: !!value && value.length >= 2 }
  );
  const matchedImage = currentImage?.find((img: any) => img.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-7 text-xs w-[120px] justify-start gap-1 px-1.5">
          {matchedImage ? (
            <>
              <img src={matchedImage.imageUrl} alt="" className="h-5 w-5 object-contain rounded flex-shrink-0" />
              <span className="truncate font-mono text-[10px]">{value}</span>
            </>
          ) : value ? (
            <span className="truncate font-mono text-[10px]">{value}</span>
          ) : (
            <span className="text-muted-foreground flex items-center gap-1"><Image className="h-3 w-3" />Pick</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start" side="bottom">
        <div className="p-2 border-b space-y-2">
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Search brackets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 text-xs pl-7"
                autoFocus
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-7 text-xs w-[90px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="bracket">Brackets</SelectItem>
                <SelectItem value="connection">Connections</SelectItem>
                <SelectItem value="component">Components</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="max-h-[280px] overflow-y-auto p-2">
          {!displayImages?.length ? (
            <div className="text-center py-4 text-xs text-muted-foreground">
              {search ? "No results" : "Loading..."}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {displayImages.map((img: any) => (
                <button
                  key={img.id}
                  className={`border rounded p-1 text-left hover:border-primary hover:bg-accent/50 transition-all ${
                    img.code === value ? "border-primary bg-accent" : ""
                  }`}
                  onClick={() => {
                    onChange(img.code, img.name);
                    setOpen(false);
                  }}
                >
                  <div className="aspect-square bg-muted rounded overflow-hidden mb-0.5">
                    <img src={img.imageUrl} alt={img.name} className="w-full h-full object-contain" loading="lazy" />
                  </div>
                  <p className="text-[9px] font-mono font-bold truncate">{img.code}</p>
                  <p className="text-[8px] text-muted-foreground truncate">{img.name}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        {value && (
          <div className="border-t p-1.5 flex justify-end">
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { onChange("", ""); setOpen(false); }}>
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── Bracket Reference Gallery ──────────────────────────────────────────────
function BracketReferenceGallery() {
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedImage, setSelectedImage] = useState<any>(null);

  const { data: images, isLoading } = trpc.planConverter.listProductImages.useQuery(
    category === "all" ? {} : { category }
  );

  const { data: searchResults } = trpc.planConverter.searchProductImages.useQuery(
    { query: search },
    { enabled: search.length >= 2 }
  );

  const displayImages = search.length >= 2 ? searchResults : images;

  const categories = [
    { value: "all", label: "All" },
    { value: "bracket", label: "Brackets" },
    { value: "connection", label: "Connections" },
    { value: "component", label: "Components" },
    { value: "structural", label: "Structural" },
    { value: "roofing", label: "Roofing" },
    { value: "rainwater", label: "Rainwater" },
    { value: "fixing", label: "Fixings" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Bracket & Connection Reference</CardTitle>
          <p className="text-xs text-muted-foreground">
            Visual reference for brackets, connections, and components. Use these codes when annotating your hand-drawn plans.
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Input
              placeholder="Search by code, name, or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
            />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !displayImages?.length ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {search ? "No results found" : "No images in this category"}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {displayImages.map((img: any) => (
                <div
                  key={img.id}
                  className="border rounded-lg p-2 cursor-pointer hover:shadow-md hover:border-primary/50 transition-all group"
                  onClick={() => setSelectedImage(img)}
                >
                  <div className="aspect-square bg-muted rounded overflow-hidden mb-2">
                    <img
                      src={img.imageUrl}
                      alt={img.name}
                      className="w-full h-full object-contain p-1"
                      loading="lazy"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-mono font-bold text-primary truncate">{img.code}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{img.name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image Detail Dialog */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono">{selectedImage?.code}</Badge>
              {selectedImage?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedImage && (
            <div className="space-y-3">
              <div className="bg-muted rounded-lg overflow-hidden">
                <img
                  src={selectedImage.imageUrl}
                  alt={selectedImage.name}
                  className="w-full h-auto max-h-[400px] object-contain p-2"
                />
              </div>
              {selectedImage.description && (
                <p className="text-sm text-muted-foreground">{selectedImage.description}</p>
              )}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Category:</span> <span className="font-medium capitalize">{selectedImage.category}</span></div>
                <div><span className="text-muted-foreground">Source:</span> <span className="font-medium">{selectedImage.sourceDocument || "Catalogue"}</span></div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/20 rounded p-2 text-xs">
                <p className="font-medium text-blue-700 dark:text-blue-300">Drawing Code: <span className="font-mono">{selectedImage.code}</span></p>
                <p className="text-blue-600 dark:text-blue-400 mt-0.5">Write this code in GREEN on your hand-drawn plan near the relevant element.</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


// ─── Documentation A3 Step ─────────────────────────────────────────────────
function DocumentationA3Step({ project }: { project: any }) {
  const [selectedBlocks, setSelectedBlocks] = useState<number[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [previewMode, setPreviewMode] = useState(false);

  const { data: engineeringBlocks = [] } = trpc.textBlocks.list.useQuery({ category: "Engineering" });
  const { data: specBlocks = [] } = trpc.textBlocks.list.useQuery({ category: "Specifications" });
  const { data: libraryImages = [] } = trpc.emailImages.list.useQuery();

  const allBlocks = [...engineeringBlocks, ...specBlocks];

  function toggleBlock(id: number) {
    setSelectedBlocks(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  }

  function toggleImage(url: string) {
    setSelectedImages(prev =>
      prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
    );
  }

  const selectedBlockData = allBlocks.filter(b => selectedBlocks.includes(b.id));

  if (previewMode) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Documentation A3 Preview</h3>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPreviewMode(false)}>
              <ArrowLeft className="h-4 w-4 mr-1" />Back to Selection
            </Button>
            <Button onClick={() => {
              // Trigger print of the preview
              window.print();
            }}>
              <Printer className="h-4 w-4 mr-1" />Print A3
            </Button>
          </div>
        </div>

        {/* A3 Preview - landscape ratio (420mm x 297mm = 1.414:1) */}
        <div className="border-2 border-gray-800 bg-white text-black print:border-black" style={{ aspectRatio: "1.414/1", maxHeight: "70vh", overflow: "auto" }}>
          <div className="h-full flex flex-col p-4">
            {/* Top border with title */}
            <div className="border-b-2 border-gray-800 pb-2 mb-3 flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold uppercase tracking-wide">Documentation & Specifications</h1>
                <p className="text-xs text-gray-600">{project.title} — {project.clientName}</p>
              </div>
              <div className="text-right text-xs text-gray-600">
                <p>{project.siteAddress || "Address TBC"}</p>
                <p>Date: {new Date().toLocaleDateString("en-AU")}</p>
              </div>
            </div>

            {/* Content area - grid layout like site plan */}
            <div className="flex-1 grid grid-cols-2 gap-3 overflow-auto">
              {/* Left column - Text blocks */}
              <div className="space-y-2">
                {selectedBlockData.map((block) => (
                  <div key={block.id} className="border border-gray-400 rounded p-2">
                    <div className="flex items-start gap-2">
                      {block.imageUrl && (
                        <img src={block.imageUrl} alt="" className="w-12 h-12 object-contain flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold uppercase">{block.title}</h4>
                        <p className="text-[10px] leading-tight mt-0.5 whitespace-pre-wrap">{block.content}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="mt-1 text-[8px]">{block.category}</Badge>
                  </div>
                ))}
              </div>

              {/* Right column - Images */}
              <div className="space-y-2">
                {selectedImages.map((url, idx) => (
                  <div key={idx} className="border border-gray-400 rounded p-1">
                    <img src={url} alt={`Doc image ${idx + 1}`} className="w-full h-32 object-contain" />
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom detail box */}
            <div className="border-t-2 border-gray-800 mt-3 pt-2 grid grid-cols-4 gap-2 text-[9px]">
              <div className="border border-gray-400 p-1">
                <p className="font-bold">PROJECT</p>
                <p>{project.title}</p>
              </div>
              <div className="border border-gray-400 p-1">
                <p className="font-bold">CLIENT</p>
                <p>{project.clientName}</p>
              </div>
              <div className="border border-gray-400 p-1">
                <p className="font-bold">DRAWN BY</p>
                <p>{project.drawnBy || "—"}</p>
              </div>
              <div className="border border-gray-400 p-1">
                <p className="font-bold">DATE</p>
                <p>{new Date().toLocaleDateString("en-AU")}</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground italic">
          * This document is for illustrative purposes only and not a render of the finished structure.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Documentation A3 Page
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select text blocks and images to include on the Documentation A3 page. The page will be laid out with borders and detail boxes matching the site plan format.
          </p>

          {/* Text Blocks Selection */}
          <div>
            <h4 className="text-sm font-medium mb-2">Engineering Notes</h4>
            <div className="space-y-1 max-h-48 overflow-y-auto border rounded p-2">
              {engineeringBlocks.length === 0 && (
                <p className="text-xs text-muted-foreground">No engineering text blocks configured. Add them via Templates & Documents → Text Blocks.</p>
              )}
              {engineeringBlocks.map((block) => (
                <label key={block.id} className="flex items-start gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedBlocks.includes(block.id)}
                    onChange={() => toggleBlock(block.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{block.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{block.content}</p>
                  </div>
                  {block.imageUrl && (
                    <img src={block.imageUrl} alt="" className="w-8 h-8 object-contain rounded border" />
                  )}
                </label>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-2">Specifications</h4>
            <div className="space-y-1 max-h-48 overflow-y-auto border rounded p-2">
              {specBlocks.length === 0 && (
                <p className="text-xs text-muted-foreground">No specification text blocks configured. Add them via Templates & Documents → Text Blocks.</p>
              )}
              {specBlocks.map((block) => (
                <label key={block.id} className="flex items-start gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedBlocks.includes(block.id)}
                    onChange={() => toggleBlock(block.id)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{block.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{block.content}</p>
                  </div>
                  {block.imageUrl && (
                    <img src={block.imageUrl} alt="" className="w-8 h-8 object-contain rounded border" />
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Image Selection from Library */}
          <div>
            <h4 className="text-sm font-medium mb-2">Images from Library</h4>
            <div className="grid grid-cols-6 gap-2 max-h-48 overflow-y-auto border rounded p-2">
              {libraryImages.length === 0 && (
                <p className="col-span-6 text-xs text-muted-foreground">No images in library. Upload via Templates & Documents → Image Library.</p>
              )}
              {libraryImages.map((img: any) => (
                <button
                  key={img.id}
                  onClick={() => toggleImage(img.url)}
                  className={`border rounded p-1 transition-colors ${
                    selectedImages.includes(img.url)
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 ring-2 ring-blue-300"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <img src={img.url} alt={img.name || ""} className="w-full h-12 object-contain" />
                </button>
              ))}
            </div>
          </div>

          {/* Summary & Preview */}
          <div className="flex items-center justify-between pt-2 border-t">
            <p className="text-sm text-muted-foreground">
              {selectedBlocks.length} text block{selectedBlocks.length !== 1 ? "s" : ""} and {selectedImages.length} image{selectedImages.length !== 1 ? "s" : ""} selected
            </p>
            <Button
              onClick={() => setPreviewMode(true)}
              disabled={selectedBlocks.length === 0 && selectedImages.length === 0}
            >
              <Eye className="h-4 w-4 mr-1" />Preview A3 Page
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
