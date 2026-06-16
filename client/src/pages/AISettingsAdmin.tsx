import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Pencil,
  Brain,
  Loader2,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  BookOpen,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Eye,
} from "lucide-react";
import { useState, useMemo, useRef, useEffect } from "react";
import { EnginiAvatar } from "@/components/EnginiAvatar";

// ─── Feedback Trends Chart ──────────────────────────────────────────────────
function FeedbackTrendsChart() {
  const { data: trends } = trpc.aiLearning.feedback.trends.useQuery();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!trends || trends.length === 0 || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 20, right: 20, bottom: 40, left: 40 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    ctx.clearRect(0, 0, width, height);

    const maxVal = Math.max(1, ...trends.map(t => Math.max(t.positive, t.negative)));
    const barWidth = Math.min(20, (chartW / trends.length - 8) / 2);
    const groupWidth = barWidth * 2 + 4;
    const groupSpacing = (chartW - groupWidth * trends.length) / (trends.length + 1);

    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 0.5;
    const ySteps = 4;
    for (let i = 0; i <= ySteps; i++) {
      const y = padding.top + (chartH / ySteps) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.fillStyle = "#6b7280";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(String(Math.round(maxVal - (maxVal / ySteps) * i)), padding.left - 6, y + 3);
    }

    trends.forEach((t, i) => {
      const x = padding.left + groupSpacing * (i + 1) + groupWidth * i;
      const posH = (t.positive / maxVal) * chartH;
      const negH = (t.negative / maxVal) * chartH;
      ctx.fillStyle = "#22c55e";
      ctx.fillRect(x, padding.top + chartH - posH, barWidth, posH);
      ctx.fillStyle = "#ef4444";
      ctx.fillRect(x + barWidth + 4, padding.top + chartH - negH, barWidth, negH);
      ctx.fillStyle = "#6b7280";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(t.week.slice(5), x + groupWidth / 2, height - padding.bottom + 14);
    });

    ctx.fillStyle = "#22c55e";
    ctx.fillRect(width - 120, 6, 10, 10);
    ctx.fillStyle = "#374151";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Positive", width - 106, 15);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(width - 60, 6, 10, 10);
    ctx.fillStyle = "#374151";
    ctx.fillText("Negative", width - 46, 15);
  }, [trends]);

  if (!trends || trends.length === 0) return null;

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-medium">Feedback Trends (Last 12 Weeks)</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <canvas ref={canvasRef} width={600} height={200} className="w-full" style={{ maxHeight: "200px" }} />
      </CardContent>
    </Card>
  );
}

// ─── Prompts Tab ──────────────────────────────────────────────────────────

function PromptsTab() {
  const utils = trpc.useUtils();
  const { data: prompts, isLoading } = trpc.aiLearning.prompts.list.useQuery();
  const upsertMutation = trpc.aiLearning.prompts.upsert.useMutation({
    onSuccess: () => { utils.aiLearning.prompts.list.invalidate(); setDialogOpen(false); toast.success("Prompt saved"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.aiLearning.prompts.delete.useMutation({
    onSuccess: () => { utils.aiLearning.prompts.list.invalidate(); toast.success("Prompt deleted"); },
    onError: (err) => toast.error(err.message),
  });
  const toggleMutation = trpc.aiLearning.prompts.toggleActive.useMutation({
    onSuccess: () => utils.aiLearning.prompts.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ key: "", label: "", description: "", systemPrompt: "" });

  const handleEdit = (p: NonNullable<typeof prompts>[number]) => {
    setEditId(p.id);
    setForm({ key: p.key, label: p.label, description: p.description || "", systemPrompt: p.systemPrompt });
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditId(null);
    setForm({ key: "", label: "", description: "", systemPrompt: "" });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.key || !form.label || !form.systemPrompt) { toast.error("Key, label, and system prompt are required"); return; }
    upsertMutation.mutate({ id: editId || undefined, ...form });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manage system prompts used by Engini. Edit the prompt text to fine-tune AI behaviour.
        </p>
        <Button onClick={handleNew} size="sm"><Plus className="mr-2 h-4 w-4" />Add Prompt</Button>
      </div>

      {(!prompts || prompts.length === 0) ? (
        <Card><CardContent className="flex flex-col items-center py-12 text-center">
          <Brain className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <h3 className="text-lg font-medium">No prompts configured</h3>
          <p className="text-sm text-muted-foreground mt-1">Add your first system prompt to get started.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {prompts.map((p) => (
            <Card key={p.id} className={!p.isActive ? "opacity-60" : ""}>
              <CardContent className="flex items-start gap-4 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium">{p.label}</h3>
                    <Badge variant="outline" className="text-xs">{p.key}</Badge>
                    {p.isActive ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">Active</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Inactive</Badge>
                    )}
                  </div>
                  {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1 font-mono truncate max-w-[600px]">
                    {p.systemPrompt.substring(0, 120)}...
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={p.isActive} onCheckedChange={(v) => toggleMutation.mutate({ id: p.id, isActive: v })} />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(p)}><Pencil className="h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete prompt "{p.label}"?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently remove this system prompt.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate({ id: p.id })} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Prompt" : "Add Prompt"}</DialogTitle>
            <DialogDescription>Configure the system prompt that shapes Engini's behaviour.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Key *</Label>
                <Input placeholder="e.g. engini, pricing_assistant" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
                <p className="text-xs text-muted-foreground">Unique identifier used in code</p>
              </div>
              <div className="space-y-2">
                <Label>Label *</Label>
                <Input placeholder="e.g. Engini Main Assistant" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input placeholder="Brief description of this prompt's purpose" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>System Prompt *</Label>
              <Textarea
                placeholder="You are Engini, an AI assistant for..."
                value={form.systemPrompt}
                onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                rows={14}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                This is the system message sent to the LLM. Use markdown, bullet points, and clear instructions.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editId ? "Save Changes" : "Create Prompt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Knowledge Tab ──────────────────────────────────────────────────────────

function KnowledgeTab() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const { data: chunks, isLoading } = trpc.aiLearning.knowledge.list.useQuery({ search: search || undefined, category: categoryFilter || undefined });
  const { data: categories } = trpc.aiLearning.knowledge.categories.useQuery();
  const upsertMutation = trpc.aiLearning.knowledge.upsert.useMutation({
    onSuccess: () => { utils.aiLearning.knowledge.list.invalidate(); utils.aiLearning.knowledge.categories.invalidate(); setDialogOpen(false); toast.success("Knowledge chunk saved"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.aiLearning.knowledge.delete.useMutation({
    onSuccess: () => { utils.aiLearning.knowledge.list.invalidate(); toast.success("Knowledge chunk deleted"); },
    onError: (err) => toast.error(err.message),
  });
  const toggleMutation = trpc.aiLearning.knowledge.toggleActive.useMutation({
    onSuccess: () => utils.aiLearning.knowledge.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: "", content: "", category: "", tags: "" });

  const handleEdit = (k: NonNullable<typeof chunks>[number]) => {
    setEditId(k.id);
    const tags = k.tags ? (JSON.parse(k.tags) as string[]).join(", ") : "";
    setForm({ title: k.title, content: k.content, category: k.category || "", tags });
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditId(null);
    setForm({ title: "", content: "", category: "", tags: "" });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.title || !form.content) { toast.error("Title and content are required"); return; }
    const tags = form.tags ? form.tags.split(",").map(t => t.trim()).filter(Boolean) : undefined;
    upsertMutation.mutate({ id: editId || undefined, title: form.title, content: form.content, category: form.category || undefined, tags });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input placeholder="Search knowledge..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories?.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button onClick={handleNew} size="sm"><Plus className="mr-2 h-4 w-4" />Add Knowledge</Button>
      </div>

      {(!chunks || chunks.length === 0) ? (
        <Card><CardContent className="flex flex-col items-center py-12 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <h3 className="text-lg font-medium">No knowledge chunks</h3>
          <p className="text-sm text-muted-foreground mt-1">Add knowledge that Engini can reference when answering questions.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {chunks.map((k) => (
            <Card key={k.id} className={!k.isActive ? "opacity-60" : ""}>
              <CardContent className="flex items-start gap-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-sm">{k.title}</h3>
                    {k.category && <Badge variant="outline" className="text-xs">{k.category}</Badge>}
                    {k.isActive ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">Active</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Inactive</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{k.content}</p>
                  {k.tags && (
                    <div className="flex gap-1 mt-1">
                      {(JSON.parse(k.tags) as string[]).map(t => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Switch checked={k.isActive} onCheckedChange={(v) => toggleMutation.mutate({ id: k.id, isActive: v })} />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(k)}><Pencil className="h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete knowledge chunk?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently remove "{k.title}" from Engini's knowledge base.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate({ id: k.id })} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Knowledge Chunk" : "Add Knowledge Chunk"}</DialogTitle>
            <DialogDescription>Knowledge chunks are injected into Engini's context to improve answers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input placeholder="e.g. Louvre blade spacing rules" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input placeholder="e.g. technical, pricing, process" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Content *</Label>
              <Textarea
                placeholder="The knowledge content that Engini will reference..."
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={10}
              />
            </div>
            <div className="space-y-2">
              <Label>Tags</Label>
              <Input placeholder="Comma-separated tags, e.g. eclipse, louvre, installation" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editId ? "Save Changes" : "Add Knowledge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Few-Shot Examples Tab ──────────────────────────────────────────────────

function FewShotTab() {
  const utils = trpc.useUtils();
  const { data: examples, isLoading } = trpc.aiLearning.fewShot.list.useQuery();
  const upsertMutation = trpc.aiLearning.fewShot.upsert.useMutation({
    onSuccess: () => { utils.aiLearning.fewShot.list.invalidate(); setDialogOpen(false); toast.success("Example saved"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.aiLearning.fewShot.delete.useMutation({
    onSuccess: () => { utils.aiLearning.fewShot.list.invalidate(); toast.success("Example deleted"); },
    onError: (err) => toast.error(err.message),
  });
  const toggleMutation = trpc.aiLearning.fewShot.toggleActive.useMutation({
    onSuccess: () => utils.aiLearning.fewShot.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ promptKey: "engini", userInput: "", expectedOutput: "", description: "", sortOrder: 0 });

  const handleEdit = (ex: NonNullable<typeof examples>[number]) => {
    setEditId(ex.id);
    setForm({ promptKey: ex.promptKey, userInput: ex.userInput, expectedOutput: ex.expectedOutput, description: ex.description || "", sortOrder: ex.sortOrder });
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditId(null);
    setForm({ promptKey: "engini", userInput: "", expectedOutput: "", description: "", sortOrder: 0 });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.userInput || !form.expectedOutput) { toast.error("User input and expected output are required"); return; }
    upsertMutation.mutate({ id: editId || undefined, ...form });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Gold-standard Q&A pairs injected as few-shot examples into Engini's prompts.
        </p>
        <Button onClick={handleNew} size="sm"><Plus className="mr-2 h-4 w-4" />Add Example</Button>
      </div>

      {(!examples || examples.length === 0) ? (
        <Card><CardContent className="flex flex-col items-center py-12 text-center">
          <Lightbulb className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <h3 className="text-lg font-medium">No few-shot examples</h3>
          <p className="text-sm text-muted-foreground mt-1">Add example Q&A pairs to teach Engini the ideal response format.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {examples.map((ex) => (
            <Card key={ex.id} className={!ex.isActive ? "opacity-60" : ""}>
              <CardContent className="py-3">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">{ex.promptKey}</Badge>
                      {ex.description && <span className="text-xs text-muted-foreground">{ex.description}</span>}
                      {ex.isActive ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Inactive</Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-muted/50 rounded p-2">
                        <p className="text-[10px] font-medium text-muted-foreground mb-1">USER INPUT</p>
                        <p className="text-xs line-clamp-3">{ex.userInput}</p>
                      </div>
                      <div className="bg-primary/5 rounded p-2">
                        <p className="text-[10px] font-medium text-muted-foreground mb-1">EXPECTED OUTPUT</p>
                        <p className="text-xs line-clamp-3">{ex.expectedOutput}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={ex.isActive} onCheckedChange={(v) => toggleMutation.mutate({ id: ex.id, isActive: v })} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(ex)}><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete example?</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently remove this few-shot example.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate({ id: ex.id })} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Few-Shot Example" : "Add Few-Shot Example"}</DialogTitle>
            <DialogDescription>These examples are injected into Engini's prompt to demonstrate ideal responses.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prompt Key *</Label>
                <Input placeholder="engini" value={form.promptKey} onChange={(e) => setForm({ ...form, promptKey: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input placeholder="Brief label for this example" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>User Input *</Label>
              <Textarea placeholder="What the user asks..." value={form.userInput} onChange={(e) => setForm({ ...form, userInput: e.target.value })} rows={4} />
            </div>
            <div className="space-y-2">
              <Label>Expected Output *</Label>
              <Textarea placeholder="The ideal response Engini should give..." value={form.expectedOutput} onChange={(e) => setForm({ ...form, expectedOutput: e.target.value })} rows={6} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editId ? "Save Changes" : "Add Example"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Corrections Tab ────────────────────────────────────────────────────────

function CorrectionsTab() {
  const utils = trpc.useUtils();
  const { data: corrections, isLoading } = trpc.aiLearning.corrections.list.useQuery();
  const upsertMutation = trpc.aiLearning.corrections.upsert.useMutation({
    onSuccess: () => { utils.aiLearning.corrections.list.invalidate(); setDialogOpen(false); toast.success("Correction saved"); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.aiLearning.corrections.delete.useMutation({
    onSuccess: () => { utils.aiLearning.corrections.list.invalidate(); toast.success("Correction deleted"); },
    onError: (err) => toast.error(err.message),
  });
  const toggleMutation = trpc.aiLearning.corrections.toggleActive.useMutation({
    onSuccess: () => utils.aiLearning.corrections.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ originalQuery: "", originalResponse: "", correction: "", context: "", promptKey: "engini" });

  const handleEdit = (c: NonNullable<typeof corrections>[number]) => {
    setEditId(c.id);
    setForm({ originalQuery: c.originalQuery, originalResponse: c.originalResponse || "", correction: c.correction, context: c.context || "", promptKey: c.promptKey || "engini" });
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditId(null);
    setForm({ originalQuery: "", originalResponse: "", correction: "", context: "", promptKey: "engini" });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.originalQuery || !form.correction) { toast.error("Original query and correction are required"); return; }
    upsertMutation.mutate({ id: editId || undefined, ...form, originalResponse: form.originalResponse || undefined, context: form.context || undefined });
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Corrections are injected when similar queries are detected, preventing repeated mistakes.
        </p>
        <Button onClick={handleNew} size="sm"><Plus className="mr-2 h-4 w-4" />Add Correction</Button>
      </div>

      {(!corrections || corrections.length === 0) ? (
        <Card><CardContent className="flex flex-col items-center py-12 text-center">
          <AlertTriangle className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <h3 className="text-lg font-medium">No corrections</h3>
          <p className="text-sm text-muted-foreground mt-1">Add corrections to fix recurring AI mistakes.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {corrections.map((c) => (
            <Card key={c.id} className={!c.isActive ? "opacity-60" : ""}>
              <CardContent className="py-3">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">{c.promptKey}</Badge>
                      {c.usageCount > 0 && <Badge variant="secondary" className="text-xs">Used {c.usageCount}x</Badge>}
                      {c.isActive ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 text-xs">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Inactive</Badge>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium text-red-600">WRONG:</span>
                        <p className="text-xs text-muted-foreground line-clamp-1">{c.originalQuery}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <ArrowRight className="h-3 w-3 text-green-600 shrink-0" />
                        <span className="text-[10px] font-medium text-green-600">CORRECT:</span>
                        <p className="text-xs line-clamp-1">{c.correction}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={c.isActive} onCheckedChange={(v) => toggleMutation.mutate({ id: c.id, isActive: v })} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete correction?</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently remove this correction rule.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate({ id: c.id })} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Correction" : "Add Correction"}</DialogTitle>
            <DialogDescription>When Engini encounters a similar query, this correction will be injected to prevent the same mistake.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Prompt Key</Label>
              <Input value={form.promptKey} onChange={(e) => setForm({ ...form, promptKey: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Original Query *</Label>
              <Textarea placeholder="What the user asked that got a wrong answer..." value={form.originalQuery} onChange={(e) => setForm({ ...form, originalQuery: e.target.value })} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Original (Wrong) Response</Label>
              <Textarea placeholder="What Engini incorrectly said..." value={form.originalResponse} onChange={(e) => setForm({ ...form, originalResponse: e.target.value })} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Correction *</Label>
              <Textarea placeholder="The correct answer or behaviour..." value={form.correction} onChange={(e) => setForm({ ...form, correction: e.target.value })} rows={4} />
            </div>
            <div className="space-y-2">
              <Label>Context</Label>
              <Input placeholder="Additional context about when this applies" value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editId ? "Save Changes" : "Add Correction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Feedback Tab ───────────────────────────────────────────────────────────

function FeedbackTab() {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [ratingFilter, setRatingFilter] = useState<string>("");
  const [topicFilter, setTopicFilter] = useState<string>("");
  const { data: feedback, isLoading } = trpc.aiLearning.feedback.list.useQuery({
    status: (statusFilter as any) || undefined,
    rating: (ratingFilter as any) || undefined,
    topic: (topicFilter as any) || undefined,
  });
  const { data: stats } = trpc.aiLearning.feedback.stats.useQuery();
  const updateStatusMutation = trpc.aiLearning.feedback.updateStatus.useMutation({
    onSuccess: () => { utils.aiLearning.feedback.list.invalidate(); utils.aiLearning.feedback.stats.invalidate(); toast.success("Status updated"); },
    onError: (err) => toast.error(err.message),
  });
  const convertMutation = trpc.aiLearning.feedback.convertToCorrection.useMutation({
    onSuccess: () => { utils.aiLearning.feedback.list.invalidate(); utils.aiLearning.feedback.stats.invalidate(); utils.aiLearning.corrections.list.invalidate(); toast.success("Converted to correction"); setConvertDialogOpen(false); },
    onError: (err) => toast.error(err.message),
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [convertFeedbackId, setConvertFeedbackId] = useState<number | null>(null);
  const [correctionText, setCorrectionText] = useState("");

  const handleConvert = (id: number) => {
    setConvertFeedbackId(id);
    setCorrectionText("");
    setConvertDialogOpen(true);
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-5 gap-3">
          <Card><CardContent className="py-3 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent></Card>
          <Card><CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.positive}</p>
            <p className="text-xs text-muted-foreground">Positive</p>
          </CardContent></Card>
          <Card><CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.negative}</p>
            <p className="text-xs text-muted-foreground">Negative</p>
          </CardContent></Card>
          <Card><CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent></Card>
          <Card><CardContent className="py-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.actioned}</p>
            <p className="text-xs text-muted-foreground">Actioned</p>
          </CardContent></Card>
        </div>
      )}

      {/* Trends Chart */}
      <FeedbackTrendsChart />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="actioned">Actioned</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={ratingFilter} onValueChange={setRatingFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="All ratings" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ratings</SelectItem>
            <SelectItem value="positive">Positive</SelectItem>
            <SelectItem value="negative">Negative</SelectItem>
          </SelectContent>
        </Select>
        <Select value={topicFilter} onValueChange={setTopicFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="All topics" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All topics</SelectItem>
            <SelectItem value="pricing">Pricing</SelectItem>
            <SelectItem value="specs">Specs</SelectItem>
            <SelectItem value="general">General</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Feedback List */}
      {(!feedback || feedback.length === 0) ? (
        <Card><CardContent className="flex flex-col items-center py-12 text-center">
          <MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <h3 className="text-lg font-medium">No feedback yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Feedback will appear here when users rate AI responses.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {feedback.map((fb) => (
            <Card key={fb.id} className="cursor-pointer" onClick={() => setExpandedId(expandedId === fb.id ? null : fb.id)}>
              <CardContent className="py-3">
                <div className="flex items-start gap-3">
                  {fb.rating === "positive" ? (
                    <ThumbsUp className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  ) : (
                    <ThumbsDown className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={fb.status === "pending" ? "default" : fb.status === "actioned" ? "secondary" : "outline"} className="text-xs">
                        {fb.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(fb.createdAt).toLocaleDateString()}
                      </span>
                      {fb.promptKey && <Badge variant="outline" className="text-xs">{fb.promptKey}</Badge>}
                      {(fb as any).topic && <Badge variant="outline" className="text-xs capitalize bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300">{(fb as any).topic}</Badge>}
                    </div>
                    {fb.userQuery && <p className="text-sm font-medium line-clamp-1">{fb.userQuery}</p>}
                    {fb.comment && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{fb.comment}</p>}

                    {expandedId === fb.id && (
                      <div className="mt-3 space-y-3 border-t pt-3" onClick={(e) => e.stopPropagation()}>
                        {fb.messageContent && (
                          <div className="bg-muted/50 rounded p-3">
                            <p className="text-[10px] font-medium text-muted-foreground mb-1">AI RESPONSE</p>
                            <p className="text-xs whitespace-pre-wrap">{fb.messageContent}</p>
                          </div>
                        )}
                        {fb.adminNotes && (
                          <div className="bg-blue-50 dark:bg-blue-950/20 rounded p-2">
                            <p className="text-[10px] font-medium text-blue-600 mb-1">ADMIN NOTES</p>
                            <p className="text-xs">{fb.adminNotes}</p>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: fb.id, status: "reviewed" })}>
                            <Eye className="mr-1 h-3 w-3" />Mark Reviewed
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: fb.id, status: "dismissed" })}>
                            <XCircle className="mr-1 h-3 w-3" />Dismiss
                          </Button>
                          {fb.rating === "negative" && (
                            <Button size="sm" onClick={() => handleConvert(fb.id)}>
                              <ArrowRight className="mr-1 h-3 w-3" />Convert to Correction
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Convert to Correction Dialog */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Convert to Correction</DialogTitle>
            <DialogDescription>Create a correction rule from this negative feedback so Engini doesn't repeat the mistake.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Correct Answer *</Label>
              <Textarea
                placeholder="What Engini should have said instead..."
                value={correctionText}
                onChange={(e) => setCorrectionText(e.target.value)}
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => convertFeedbackId && convertMutation.mutate({ feedbackId: convertFeedbackId, correction: correctionText })}
              disabled={!correctionText || convertMutation.isPending}
            >
              {convertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AISettingsAdmin() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <EnginiAvatar size="xl" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Settings</h1>
          <p className="text-muted-foreground">
            Configure Engini's prompts, knowledge, examples, corrections, and review feedback
          </p>
        </div>
      </div>

      {/* Info Card */}
      <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20">
        <CardContent className="flex items-start gap-3 pt-4 pb-4">
          <Brain className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-300">How AI Learning Works</p>
            <p className="text-amber-700 dark:text-amber-400/80 mt-1">
              <strong>Prompts</strong> define Engini's personality and rules. <strong>Knowledge</strong> chunks are injected as context.
              <strong> Few-shot examples</strong> teach ideal response patterns. <strong>Corrections</strong> prevent repeated mistakes.
              <strong> Feedback</strong> from users flags issues for review — negative feedback can be converted into corrections.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="prompts">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="prompts" className="text-xs gap-1">
            <Brain className="h-3.5 w-3.5" />Prompts
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="text-xs gap-1">
            <BookOpen className="h-3.5 w-3.5" />Knowledge
          </TabsTrigger>
          <TabsTrigger value="fewshot" className="text-xs gap-1">
            <Lightbulb className="h-3.5 w-3.5" />Few-Shot
          </TabsTrigger>
          <TabsTrigger value="corrections" className="text-xs gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />Corrections
          </TabsTrigger>
          <TabsTrigger value="feedback" className="text-xs gap-1">
            <MessageSquare className="h-3.5 w-3.5" />Feedback
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prompts" className="mt-6"><PromptsTab /></TabsContent>
        <TabsContent value="knowledge" className="mt-6"><KnowledgeTab /></TabsContent>
        <TabsContent value="fewshot" className="mt-6"><FewShotTab /></TabsContent>
        <TabsContent value="corrections" className="mt-6"><CorrectionsTab /></TabsContent>
        <TabsContent value="feedback" className="mt-6"><FeedbackTab /></TabsContent>
      </Tabs>
    </div>
  );
}
