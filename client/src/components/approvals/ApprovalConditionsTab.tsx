import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, AlertTriangle, CheckCircle2, Upload, FileText, X, Loader2, ShieldCheck, CalendarClock, FileUp, Brain, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  projectId: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  pre_commencement: "Pre-Commencement",
  during_works: "During Works",
  prior_to_occupation: "Prior to Occupation",
  ongoing: "Ongoing",
  other: "Other",
};

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-800",
  in_progress: "bg-amber-100 text-amber-800",
  evidence_submitted: "bg-blue-100 text-blue-800",
  satisfied: "bg-green-100 text-green-800",
  waived: "bg-purple-100 text-purple-800",
  not_applicable: "bg-gray-50 text-gray-500",
};

interface EvidenceFile {
  file: File;
  preview: string;
}

export function ApprovalConditionsTab({ projectId }: Props) {
  const [showNew, setShowNew] = useState(false);
  const [satisfyingId, setSatisfyingId] = useState<number | null>(null);
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>([]);
  const [newForm, setNewForm] = useState({ title: "", description: "", category: "other", conditionNumber: "", isBlocking: false, blockingGate: "", dueAt: "" });
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [parsedConditions, setParsedConditions] = useState<any[] | null>(null);
  const [importDocTitle, setImportDocTitle] = useState("");
  const [selectedForImport, setSelectedForImport] = useState<Set<number>>(new Set());
  const [removingId, setRemovingId] = useState<number | null>(null);

  const { data: conditions, isLoading } = trpc.approvals.conditions.list.useQuery({ projectId });
  const utils = trpc.useUtils();

  const importFromPdf = trpc.approvals.conditions.importFromPdf.useMutation({
    onSuccess: (result) => {
      setParsedConditions(result.conditions);
      setImportDocTitle(result.documentTitle);
      setSelectedForImport(new Set(result.conditions.map((_: any, i: number) => i)));
      toast.success(`Parsed ${result.totalConditions} conditions from "${result.documentTitle}"`);
    },
    onError: (err) => toast.error(`Import failed: ${err.message}`),
  });

  const bulkCreate = trpc.approvals.conditions.bulkCreate.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.createdCount} conditions imported successfully`);
      setShowImport(false);
      setParsedConditions(null);
      setImportFile(null);
      setSelectedForImport(new Set());
      utils.approvals.conditions.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const createCondition = trpc.approvals.conditions.create.useMutation({
    onSuccess: () => {
      toast.success("Condition created");
      setShowNew(false);
      setNewForm({ title: "", description: "", category: "other", conditionNumber: "", isBlocking: false, blockingGate: "", dueAt: "" });
      utils.approvals.conditions.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const satisfyCondition = trpc.approvals.conditions.satisfy.useMutation({
    onSuccess: (result) => {
      if (result.allBlockingCleared) {
        toast.success("Condition satisfied — all blocking conditions cleared!", { duration: 5000 });
      } else if (result.remainingBlocking > 0) {
        toast.success(`Condition satisfied. ${result.remainingBlocking} blocking condition(s) remain.`);
      } else {
        toast.success("Condition satisfied");
      }
      setSatisfyingId(null);
      setEvidenceNotes("");
      setEvidenceFiles([]);
      utils.approvals.conditions.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const removeCondition = trpc.approvals.conditions.delete.useMutation({
    onSuccess: () => {
      toast.success("Condition removed");
      setRemovingId(null);
      utils.approvals.conditions.list.invalidate({ projectId });
    },
    onError: (err) => {
      toast.error(err.message);
      setRemovingId(null);
    },
  });

  const handleCreate = () => {
    if (!newForm.title) {
      toast.error("Title is required");
      return;
    }
    createCondition.mutate({
      projectId,
      title: newForm.title,
      description: newForm.description || undefined,
      category: newForm.category as any,
      conditionNumber: newForm.conditionNumber || undefined,
      isBlocking: newForm.isBlocking,
      blockingGate: newForm.blockingGate ? Number(newForm.blockingGate) : undefined,
      dueAt: newForm.dueAt || undefined,
    });
  };

  const handleSatisfy = async () => {
    if (!satisfyingId) return;

    // Convert files to base64
    const filePayloads: { fileName: string; fileMimeType: string; fileBase64: string }[] = [];
    for (const ef of evidenceFiles) {
      const base64 = await fileToBase64(ef.file);
      filePayloads.push({
        fileName: ef.file.name,
        fileMimeType: ef.file.type || "application/octet-stream",
        fileBase64: base64,
      });
    }

    satisfyCondition.mutate({
      id: satisfyingId,
      projectId,
      evidenceNotes: evidenceNotes || undefined,
      evidenceFiles: filePayloads.length > 0 ? filePayloads : undefined,
    });
  };

  const handleRemoveCondition = (condition: any) => {
    if (!window.confirm(`Remove "${condition.title}" from this approval? This cannot be undone.`)) return;
    setRemovingId(condition.id);
    removeCondition.mutate({ id: condition.id, projectId });
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles: EvidenceFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name} exceeds 20MB limit`);
        continue;
      }
      newFiles.push({ file, preview: file.name });
    }
    setEvidenceFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  }, []);

  const removeFile = (index: number) => {
    setEvidenceFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Group conditions by category
  const grouped = (conditions || []).reduce((acc: Record<string, any[]>, c: any) => {
    const cat = c.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(c);
    return acc;
  }, {});

  // Summary stats
  const total = conditions?.length || 0;
  const satisfied = conditions?.filter((c: any) => c.status === "satisfied" || c.status === "waived" || c.status === "not_applicable").length || 0;
  const blocking = conditions?.filter((c: any) => c.isBlocking && c.status !== "satisfied" && c.status !== "waived" && c.status !== "not_applicable").length || 0;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Conditions of Consent</h3>
          {total > 0 && (
            <p className="text-sm text-muted-foreground">
              {satisfied}/{total} satisfied
              {blocking > 0 && <span className="text-red-600 font-medium ml-2">({blocking} blocking)</span>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
        <Dialog open={showImport} onOpenChange={(open) => { setShowImport(open); if (!open) { setParsedConditions(null); setImportFile(null); } }}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Brain className="h-4 w-4 mr-1" /> Import from PDF
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-600" />
                Import Conditions from Consent PDF
              </DialogTitle>
            </DialogHeader>
            {!parsedConditions ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload a DA/CDC/CC consent document and AI will extract all conditions with categories and blocking flags.
                </p>
                <div className="border-2 border-dashed rounded-lg p-6 text-center">
                  <FileUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  {importFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-4 w-4" />
                      <span className="text-sm font-medium">{importFile.name}</span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setImportFile(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <label className="cursor-pointer">
                      <Button variant="outline" asChild><span>Choose Consent PDF</span></Button>
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf"
                        onChange={(e) => { if (e.target.files?.[0]) setImportFile(e.target.files[0]); e.target.value = ""; }}
                      />
                    </label>
                  )}
                </div>
                <Button
                  className="w-full"
                  disabled={!importFile || importFromPdf.isPending}
                  onClick={async () => {
                    if (!importFile) return;
                    const base64 = await fileToBase64(importFile);
                    importFromPdf.mutate({
                      projectId,
                      fileBase64: base64,
                      fileName: importFile.name,
                      fileMimeType: importFile.type || "application/pdf",
                    });
                  }}
                >
                  {importFromPdf.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Parsing with AI...</>
                  ) : (
                    <><Brain className="h-4 w-4 mr-1" /> Parse Conditions</>
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    {importDocTitle} — {parsedConditions.length} conditions found
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedForImport(new Set(parsedConditions.map((_: any, i: number) => i)))}>
                      Select All
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setSelectedForImport(new Set())}>
                      Deselect All
                    </Button>
                  </div>
                </div>
                <div className="border rounded-lg divide-y max-h-[50vh] overflow-y-auto">
                  {parsedConditions.map((c: any, idx: number) => (
                    <div key={idx} className={`p-3 flex gap-3 ${selectedForImport.has(idx) ? "bg-green-50/50" : "bg-muted/20 opacity-60"}`}>
                      <input
                        type="checkbox"
                        checked={selectedForImport.has(idx)}
                        onChange={(e) => {
                          const next = new Set(selectedForImport);
                          if (e.target.checked) next.add(idx); else next.delete(idx);
                          setSelectedForImport(next);
                        }}
                        className="mt-1 rounded"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono bg-muted px-1 rounded">{c.conditionNumber}</span>
                          <span className="text-sm font-medium truncate">{c.title}</span>
                          {c.isBlocking && <Badge variant="destructive" className="text-[10px] px-1 py-0">Blocking</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.description}</p>
                        <Badge variant="outline" className="text-[10px] mt-1">{CATEGORY_LABELS[c.category] || c.category}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setParsedConditions(null); setImportFile(null); }}>Back</Button>
                  <Button
                    disabled={selectedForImport.size === 0 || bulkCreate.isPending}
                    onClick={() => {
                      const selected = parsedConditions.filter((_: any, i: number) => selectedForImport.has(i));
                      bulkCreate.mutate({ projectId, conditions: selected });
                    }}
                  >
                    {bulkCreate.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importing...</>
                    ) : (
                      <><Check className="h-4 w-4 mr-1" /> Import {selectedForImport.size} Conditions</>
                    )}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Condition
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Condition</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Condition Number</Label>
                <Input
                  placeholder="e.g. 1, 2a"
                  value={newForm.conditionNumber}
                  onChange={(e) => setNewForm({ ...newForm, conditionNumber: e.target.value })}
                />
              </div>
              <div>
                <Label>Title *</Label>
                <Input
                  placeholder="Condition title"
                  value={newForm.title}
                  onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}
                />
              </div>
              <div>
                <Label>Category</Label>
                <Select value={newForm.category} onValueChange={(v) => setNewForm({ ...newForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea
                  placeholder="Full condition text..."
                  value={newForm.description}
                  onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div>
                <Label>Due Date (optional)</Label>
                <Input
                  type="date"
                  value={newForm.dueAt}
                  onChange={(e) => setNewForm({ ...newForm, dueAt: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newForm.isBlocking}
                    onChange={(e) => setNewForm({ ...newForm, isBlocking: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Blocking Condition
                </label>
                {newForm.isBlocking && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Blocks Gate:</Label>
                    <Input
                      type="number"
                      min={1}
                      max={6}
                      className="w-16 h-8"
                      value={newForm.blockingGate}
                      onChange={(e) => setNewForm({ ...newForm, blockingGate: e.target.value })}
                    />
                  </div>
                )}
              </div>
              <Button onClick={handleCreate} disabled={createCondition.isPending} className="w-full">
                {createCondition.isPending ? "Creating..." : "Add Condition"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : !conditions || conditions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No conditions recorded. Add conditions once consent is granted.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <h4 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                {CATEGORY_LABELS[category] || category}
              </h4>
              <div className="space-y-2">
                {(items as any[]).map((condition) => (
                  <Card key={condition.id} className={`${condition.isBlocking && condition.status !== "satisfied" && condition.status !== "waived" ? "border-red-200" : ""} ${getDueDateClass(condition)}`}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          {condition.status === "satisfied" ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                          ) : condition.isBlocking ? (
                            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
                          ) : (
                            <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {condition.conditionNumber && `${condition.conditionNumber}. `}
                              {condition.title}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                              {condition.assignedToName && <span>Assigned: {condition.assignedToName}</span>}
                              {condition.dueAt && condition.status !== "satisfied" && condition.status !== "waived" && condition.status !== "not_applicable" && (
                                <DueDateBadge dueAt={condition.dueAt} />
                              )}
                              {condition.satisfiedAt && (
                                <span className="text-green-600">
                                  Satisfied {new Date(condition.satisfiedAt).toLocaleDateString()} by {condition.satisfiedByName}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className={STATUS_COLORS[condition.status] || ""}>
                            {condition.status.replace(/_/g, " ")}
                          </Badge>
                          {condition.status !== "satisfied" && condition.status !== "waived" && condition.status !== "not_applicable" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-700 border-green-300 hover:bg-green-50"
                              onClick={() => {
                                setSatisfyingId(condition.id);
                                setEvidenceNotes("");
                                setEvidenceFiles([]);
                              }}
                            >
                              <ShieldCheck className="h-4 w-4 mr-1" />
                              Satisfy
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-muted-foreground hover:text-destructive"
                            disabled={removingId === condition.id}
                            onClick={() => handleRemoveCondition(condition)}
                          >
                            {removingId === condition.id ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 mr-1" />
                            )}
                            Remove
                          </Button>
                        </div>
                      </div>
                      {condition.description && (
                        <p className="text-xs text-muted-foreground mt-2 ml-8 line-clamp-2">{condition.description}</p>
                      )}
                      {condition.evidenceNotes && condition.status === "satisfied" && (
                        <p className="text-xs text-green-700 mt-1 ml-8">Evidence: {condition.evidenceNotes}</p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Satisfy Condition Dialog */}
      <Dialog open={satisfyingId !== null} onOpenChange={(open) => { if (!open) setSatisfyingId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-600" />
              Mark Condition as Satisfied
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Evidence Notes</Label>
              <Textarea
                placeholder="Describe how this condition has been satisfied..."
                value={evidenceNotes}
                onChange={(e) => setEvidenceNotes(e.target.value)}
                rows={3}
              />
            </div>
            <div>
              <Label>Evidence Files (optional)</Label>
              <div className="mt-2 border-2 border-dashed rounded-lg p-4 text-center">
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-2">Upload evidence documents, photos, or certificates</p>
                <label className="cursor-pointer">
                  <Button variant="outline" size="sm" asChild>
                    <span>Choose Files</span>
                  </Button>
                  <input
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  />
                </label>
              </div>
              {evidenceFiles.length > 0 && (
                <div className="mt-3 space-y-2">
                  {evidenceFiles.map((ef, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm bg-muted/50 rounded p-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1">{ef.preview}</span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {(ef.file.size / 1024).toFixed(0)} KB
                      </span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeFile(idx)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSatisfyingId(null)}>Cancel</Button>
            <Button
              onClick={handleSatisfy}
              disabled={satisfyCondition.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {satisfyCondition.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</>
              ) : (
                <><ShieldCheck className="h-4 w-4 mr-1" /> Confirm Satisfied</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper: compute due-date urgency class for card border
function getDueDateClass(condition: any): string {
  if (!condition.dueAt) return "";
  if (condition.status === "satisfied" || condition.status === "waived" || condition.status === "not_applicable") return "";
  const now = new Date();
  const due = new Date(condition.dueAt);
  const daysUntil = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0) return "border-red-400 bg-red-50/50";
  if (daysUntil <= 1) return "border-orange-400 bg-orange-50/30";
  if (daysUntil <= 7) return "border-amber-300 bg-amber-50/20";
  return "";
}

// Helper: DueDateBadge component
function DueDateBadge({ dueAt }: { dueAt: string | Date }) {
  const due = new Date(dueAt);
  const now = new Date();
  const daysUntil = Math.floor((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  let className = "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ";
  let label = "";

  if (daysUntil < 0) {
    className += "bg-red-100 text-red-800";
    label = `${Math.abs(daysUntil)}d overdue`;
  } else if (daysUntil === 0) {
    className += "bg-orange-100 text-orange-800";
    label = "Due today";
  } else if (daysUntil === 1) {
    className += "bg-orange-100 text-orange-800";
    label = "Due tomorrow";
  } else if (daysUntil <= 7) {
    className += "bg-amber-100 text-amber-800";
    label = `${daysUntil}d remaining`;
  } else {
    className += "bg-gray-100 text-gray-700";
    label = `Due ${due.toLocaleDateString()}`;
  }

  return (
    <span className={className}>
      <CalendarClock className="h-3 w-3" />
      {label}
    </span>
  );
}

// Helper: convert File to base64 string
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix (e.g. "data:application/pdf;base64,")
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
