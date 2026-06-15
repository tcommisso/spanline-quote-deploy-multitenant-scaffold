import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Plus, Trash2, FileText, Upload, Loader2, ShieldCheck,
  Eye, EyeOff, GripVertical, Pencil, X,
} from "lucide-react";
import { toast } from "sonner";

export default function WhsAdmin() {
  const { data: docs, isLoading } = trpc.whs.listAll.useQuery();
  const utils = trpc.useUtils();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showOnTrade, setShowOnTrade] = useState(false);
  const [showOnClient, setShowOnClient] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createMutation = trpc.whs.create.useMutation({
    onSuccess: () => {
      toast.success("SWMS document uploaded");
      utils.whs.listAll.invalidate();
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.whs.update.useMutation({
    onSuccess: () => {
      toast.success("Document updated");
      utils.whs.listAll.invalidate();
      setEditId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.whs.delete.useMutation({
    onSuccess: () => {
      toast.success("Document deleted");
      utils.whs.listAll.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const resetForm = () => {
    setShowForm(false);
    setTitle("");
    setDescription("");
    setShowOnTrade(false);
    setShowOnClient(false);
    setSelectedFile(null);
  };

  const handleUpload = async () => {
    if (!selectedFile || !title) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      createMutation.mutate({
        title,
        description: description || undefined,
        fileBase64: base64,
        fileName: selectedFile.name,
        contentType: selectedFile.type || "application/pdf",
        showOnTradePortal: showOnTrade,
        showOnClientPortal: showOnClient,
      });
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleToggle = (id: number, field: "showOnTradePortal" | "showOnClientPortal" | "isActive", value: boolean) => {
    updateMutation.mutate({ id, [field]: value });
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-64" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-amber-500" /> Work Health & Safety
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage SWMS documents. Toggle visibility for Trade and Client portals.
          </p>
        </div>
        {!showForm && (
          <Button variant="brand" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Document
          </Button>
        )}
      </div>

      {/* Upload Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload SWMS Document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Document Title</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Working at Heights SWMS" />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description..." />
              </div>
            </div>

            <div>
              <Label>File</Label>
              <div className="flex items-center gap-3 mt-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1.5" /> Choose File
                </Button>
                {selectedFile && (
                  <span className="text-sm text-muted-foreground">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={showOnTrade} onCheckedChange={setShowOnTrade} />
                <Label className="cursor-pointer">Show on Trade Portal</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={showOnClient} onCheckedChange={setShowOnClient} />
                <Label className="cursor-pointer">Show on Client Portal</Label>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button onClick={handleUpload} disabled={!title || !selectedFile || createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
                Upload
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document List */}
      {docs && docs.length > 0 ? (
        <div className="space-y-2">
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <div className="col-span-4">Document</div>
            <div className="col-span-2 text-center">Trade Portal</div>
            <div className="col-span-2 text-center">Client Portal</div>
            <div className="col-span-1 text-center">Active</div>
            <div className="col-span-3 text-right">Actions</div>
          </div>

          {docs.map((doc: any) => (
            <Card key={doc.id} className={!doc.isActive ? "opacity-60" : ""}>
              <CardContent className="p-4">
                {editId === doc.id ? (
                  <EditRow
                    doc={doc}
                    onSave={(data) => {
                      updateMutation.mutate({ id: doc.id, ...data });
                    }}
                    onCancel={() => setEditId(null)}
                    isPending={updateMutation.isPending}
                  />
                ) : (
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <div className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-amber-500 shrink-0" />
                        <div>
                          <p className="font-medium text-sm">{doc.title}</p>
                          {doc.description && <p className="text-xs text-muted-foreground">{doc.description}</p>}
                          {doc.fileName && <p className="text-xs text-muted-foreground">{doc.fileName}</p>}
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2 flex justify-center">
                      <Switch
                        checked={doc.showOnTradePortal}
                        onCheckedChange={(v) => handleToggle(doc.id, "showOnTradePortal", v)}
                      />
                    </div>
                    <div className="col-span-2 flex justify-center">
                      <Switch
                        checked={doc.showOnClientPortal}
                        onCheckedChange={(v) => handleToggle(doc.id, "showOnClientPortal", v)}
                      />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <Switch
                        checked={doc.isActive}
                        onCheckedChange={(v) => handleToggle(doc.id, "isActive", v)}
                      />
                    </div>
                    <div className="col-span-3 flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => window.open(doc.fileUrl, "_blank")}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditId(doc.id)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Delete "${doc.title}"? This cannot be undone.`)) {
                            deleteMutation.mutate({ id: doc.id });
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <ShieldCheck className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No SWMS documents uploaded yet</p>
            <p className="text-xs mt-1">Upload documents to make them available on the Trade and Client portals</p>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold mb-2">Portal Visibility</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>Documents toggled for <strong>Trade Portal</strong> will appear under the WH&S tab for trade contractors.</li>
            <li>Documents toggled for <strong>Client Portal</strong> will appear under the WH&S section for clients.</li>
            <li>The WH&S page will only be visible on each portal when there is at least one active document assigned to it.</li>
            <li>Inactive documents are hidden from all portals but retained for records.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

// Inline edit row component
function EditRow({ doc, onSave, onCancel, isPending }: {
  doc: any;
  onSave: (data: { title?: string; description?: string }) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState(doc.title);
  const [description, setDescription] = useState(doc.description || "");

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Title</Label>
          <Input value={title} onChange={e => setTitle(e.target.value)} className="h-8 text-sm" />
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} className="h-8 text-sm" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={onCancel}><X className="h-3 w-3 mr-1" /> Cancel</Button>
        <Button size="sm" onClick={() => onSave({ title, description })} disabled={isPending}>
          {isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}
