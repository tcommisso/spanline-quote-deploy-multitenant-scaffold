import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Pencil,
  ExternalLink,
  Brain,
  RefreshCw,
  BookOpen,
  Loader2,
  FileText,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { EnginiAvatar } from "@/components/EnginiAvatar";

interface DocFormData {
  title: string;
  code: string;
  description: string;
  url: string;
  updatedLabel: string;
}

const emptyForm: DocFormData = {
  title: "",
  code: "",
  description: "",
  url: "",
  updatedLabel: "",
};

export default function TechLibraryAdmin() {
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<DocFormData>(emptyForm);

  const utils = trpc.useUtils();
  const { data: docs, isLoading } = trpc.techLibrary.listAll.useQuery();

  const createMutation = trpc.techLibrary.create.useMutation({
    onSuccess: () => {
      utils.techLibrary.listAll.invalidate();
      utils.techLibrary.listActive.invalidate();
      setAddOpen(false);
      setForm(emptyForm);
      toast.success("Document added to Technical Library");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.techLibrary.update.useMutation({
    onSuccess: () => {
      utils.techLibrary.listAll.invalidate();
      utils.techLibrary.listActive.invalidate();
      setEditOpen(false);
      setEditId(null);
      setForm(emptyForm);
      toast.success("Document updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.techLibrary.delete.useMutation({
    onSuccess: () => {
      utils.techLibrary.listAll.invalidate();
      utils.techLibrary.listActive.invalidate();
      toast.success("Document removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateKnowledgeMutation = trpc.techLibrary.updateKnowledge.useMutation({
    onSuccess: () => {
      utils.techLibrary.listAll.invalidate();
      toast.success("Knowledge updated for this document");
    },
    onError: (err) => toast.error(`Knowledge update failed: ${err.message}`),
  });

  const updateAllKnowledgeMutation = trpc.techLibrary.updateAllKnowledge.useMutation({
    onSuccess: (data) => {
      utils.techLibrary.listAll.invalidate();
      if (data.failed && data.failed > 0) {
        toast.warning(
          `Knowledge updated: ${data.updated}/${data.total} succeeded, ${data.failed} failed`,
          { duration: 8000, description: data.errors?.map((e: any) => `${e.title}: ${e.error}`).join("\n") }
        );
      } else {
        toast.success(`Engini's knowledge updated: ${data.updated}/${data.total} documents processed`);
      }
    },
    onError: (err) => toast.error(`Bulk knowledge update failed: ${err.message}`),
  });

  const toggleActive = (id: number, currentActive: boolean) => {
    updateMutation.mutate({ id, active: !currentActive });
  };

  const handleEdit = (doc: NonNullable<typeof docs>[number]) => {
    setEditId(doc.id);
    setForm({
      title: doc.title,
      code: doc.code,
      description: doc.description ?? "",
      url: doc.url,
      updatedLabel: doc.updatedLabel ?? "",
    });
    setEditOpen(true);
  };

  const handleCreate = () => {
    if (!form.title || !form.code || !form.url) {
      toast.error("Title, code, and URL are required");
      return;
    }
    createMutation.mutate({
      title: form.title,
      code: form.code,
      description: form.description || undefined,
      url: form.url,
      updatedLabel: form.updatedLabel || undefined,
    });
  };

  const handleUpdate = () => {
    if (!editId || !form.title || !form.code || !form.url) {
      toast.error("Title, code, and URL are required");
      return;
    }
    updateMutation.mutate({
      id: editId,
      title: form.title,
      code: form.code,
      description: form.description || null,
      url: form.url,
      updatedLabel: form.updatedLabel || null,
    });
  };

  const formFields = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="title">Document Title *</Label>
          <Input
            id="title"
            placeholder="e.g. Building & Assembly Methods"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="code">Document Code *</Label>
          <Input
            id="code"
            placeholder="e.g. MAN-2012"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="url">Document URL *</Label>
        <Input
          id="url"
          placeholder="/manus-storage/filename.pdf, /assets/filename.pdf, or https://..."
          value={form.url}
          onChange={(e) => setForm({ ...form, url: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Upload PDFs via app storage, then paste the stored file path here
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="updatedLabel">Version / Updated Label</Label>
          <Input
            id="updatedLabel"
            placeholder="e.g. Feb 2025"
            value={form.updatedLabel}
            onChange={(e) => setForm({ ...form, updatedLabel: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          placeholder="Brief description of what this document covers..."
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <EnginiAvatar size="xl" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Technical Library</h1>
            <p className="text-muted-foreground">
              Manage documents that Engini uses to answer technical questions
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => updateAllKnowledgeMutation.mutate()}
            disabled={updateAllKnowledgeMutation.isPending}
          >
            {updateAllKnowledgeMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Brain className="mr-2 h-4 w-4" />
            )}
            Update Engini's Knowledge
          </Button>
          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setForm(emptyForm); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Document
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[550px]">
              <DialogHeader>
                <DialogTitle>Add Technical Document</DialogTitle>
                <DialogDescription>
                  Add a document to the Technical Library. It will be available for viewing in Engini's chat widget.
                </DialogDescription>
              </DialogHeader>
              {formFields}
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Document
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Info Card */}
      <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
        <CardContent className="flex items-start gap-3 pt-4 pb-4">
          <BookOpen className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-300">How it works</p>
            <p className="text-amber-700 dark:text-amber-400/80 mt-1">
              Documents added here appear in Engini's Technical Library panel (the 📖 icon in the chat header).
              Users can view documents directly. Click <strong>"Update Engini's Knowledge"</strong> after adding or
              changing documents so Engini can reference them when answering questions.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Documents List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !docs || docs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <h3 className="text-lg font-medium">No documents yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Add your first technical document to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => (
            <Card key={doc.id} className={!doc.active ? "opacity-60" : ""}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium truncate">{doc.title}</h3>
                    <Badge variant="outline" className="shrink-0 text-xs">{doc.code}</Badge>
                    {doc.active ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 shrink-0">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="shrink-0">
                        <XCircle className="h-3 w-3 mr-1" />
                        Inactive
                      </Badge>
                    )}
                    {doc.knowledgeStatus === "failed" && (
                      <Badge variant="outline" className="shrink-0 text-xs border-red-300 text-red-700 dark:text-red-400" title={doc.knowledgeError || "Knowledge update failed"}>
                        <XCircle className="h-3 w-3 mr-1" />
                        Knowledge failed
                      </Badge>
                    )}
                    {doc.knowledgeStatus === "pending" && (
                      <Badge variant="outline" className="shrink-0 text-xs border-blue-300 text-blue-700 dark:text-blue-400">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Processing
                      </Badge>
                    )}
                    {doc.knowledgeStatus === "success" && doc.knowledgeSummary && (
                      <Badge variant="outline" className="shrink-0 text-xs border-amber-300 text-amber-700 dark:text-amber-400">
                        <Brain className="h-3 w-3 mr-1" />
                        Knowledge loaded
                      </Badge>
                    )}
                    {!doc.knowledgeStatus && doc.knowledgeSummary && (
                      <Badge variant="outline" className="shrink-0 text-xs border-amber-300 text-amber-700 dark:text-amber-400">
                        <Brain className="h-3 w-3 mr-1" />
                        Knowledge loaded
                      </Badge>
                    )}
                  </div>
                  {doc.description && (
                    <p className="text-sm text-muted-foreground truncate">{doc.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {doc.updatedLabel && <span>Updated {doc.updatedLabel}</span>}
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View document
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-2 mr-2">
                    <Label htmlFor={`active-${doc.id}`} className="text-xs text-muted-foreground">
                      Active
                    </Label>
                    <Switch
                      id={`active-${doc.id}`}
                      checked={doc.active}
                      onCheckedChange={() => toggleActive(doc.id, doc.active)}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => updateKnowledgeMutation.mutate({ id: doc.id })}
                    disabled={updateKnowledgeMutation.isPending}
                    title="Update Engini's knowledge for this document"
                  >
                    {updateKnowledgeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleEdit(doc)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete document?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove "{doc.title}" ({doc.code}) from the Technical Library.
                          Engini will no longer reference this document.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate({ id: doc.id })}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) { setEditId(null); setForm(emptyForm); } }}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
            <DialogDescription>
              Update the document details. Remember to update Engini's knowledge after making changes.
            </DialogDescription>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
