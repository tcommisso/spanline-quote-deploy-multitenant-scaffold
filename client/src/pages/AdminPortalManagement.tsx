import { useState } from "react";
import { trpc } from "@/lib/trpc";
import RichTextEditor from "@/components/RichTextEditor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Users, FileText, AlertTriangle, Wrench, Newspaper, ShoppingBag, Shield, Plus,
  Copy, ExternalLink, Ban, CheckCircle2, Clock, Pencil, Archive, RotateCcw, Heart, Menu, ChevronDown
} from "lucide-react";
import { toast } from "sonner";

// ─── Portal Access Tab ───────────────────────────────────────────────────────

function PortalAccessTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [jobId, setJobId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  const accessQuery = trpc.adminPortal.listPortalAccess.useQuery();
  const jobsQuery = trpc.adminPortal.listJobs.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.adminPortal.createPortalAccess.useMutation({
    onSuccess: (data) => {
      toast.success("Portal access created");
      utils.adminPortal.listPortalAccess.invalidate();
      setShowCreate(false);
      setJobId("");
      setClientName("");
      setClientEmail("");
      // Copy the portal link
      const portalUrl = `${window.location.origin}/portal/login?token=${data.token}`;
      navigator.clipboard.writeText(portalUrl);
      toast.info("Portal link copied to clipboard");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const revokeMutation = trpc.adminPortal.revokePortalAccess.useMutation({
    onSuccess: () => {
      toast.success("Access revoked");
      utils.adminPortal.listPortalAccess.invalidate();
    },
  });

  const reactivateMutation = trpc.adminPortal.reactivatePortalAccess.useMutation({
    onSuccess: () => {
      toast.success("Access reactivated");
      utils.adminPortal.listPortalAccess.invalidate();
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Client Portal Access</h3>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Grant Access</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Portal Access</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({ constructionJobId: Number(jobId), clientName, clientEmail });
            }} className="space-y-4">
              <div>
                <Label>Construction Job</Label>
                <Select value={jobId} onValueChange={setJobId}>
                  <SelectTrigger><SelectValue placeholder="Select job..." /></SelectTrigger>
                  <SelectContent>
                    {jobsQuery.data?.map((j) => (
                      <SelectItem key={j.id} value={String(j.id)}>
                        {j.quoteNumber} - {j.clientName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Client Name</Label>
                <Input value={clientName} onChange={(e) => setClientName(e.target.value)} required />
              </div>
              <div>
                <Label>Client Email</Label>
                <Input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create & Copy Link"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {accessQuery.isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !accessQuery.data?.length ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No portal access granted yet</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {accessQuery.data.map((access) => (
            <Card key={access.id}>
              <CardContent className="py-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{access.clientName}</p>
                    <p className="text-sm text-muted-foreground truncate">{access.clientEmail}</p>
                    <p className="text-xs text-muted-foreground">
                      Job #{access.constructionJobId} • Last accessed: {access.lastAccessedAt ? new Date(access.lastAccessedAt).toLocaleDateString("en-AU") : "Never"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {access.isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const portalUrl = `${window.location.origin}/portal/login?token=${access.token}`;
                          navigator.clipboard.writeText(portalUrl);
                          toast.success("Portal link copied to clipboard");
                        }}
                        title="Copy portal access link"
                      >
                        <Copy className="w-4 h-4 mr-1" /> Link
                      </Button>
                    )}
                    <Badge className={access.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                      {access.isActive ? "Active" : "Revoked"}
                    </Badge>
                    {access.isActive ? (
                      <Button variant="ghost" size="sm" onClick={() => revokeMutation.mutate({ id: access.id })}>
                        <Ban className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => reactivateMutation.mutate({ id: access.id })}>
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                    )}
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

// ─── Defects Tab ─────────────────────────────────────────────────────────────

function DefectsTab() {
  const defectsQuery = trpc.adminPortal.listDefects.useQuery();
  const utils = trpc.useUtils();
  const [resolveId, setResolveId] = useState<number | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [resolutionPhotoUrl, setResolutionPhotoUrl] = useState("");
  const [resolutionPhotos, setResolutionPhotos] = useState<string[]>([]);

  const updateStatus = trpc.adminPortal.updateDefectStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated");
      utils.adminPortal.listDefects.invalidate();
      setResolveId(null);
      setResolutionNotes("");
      setResolutionPhotos([]);
    },
  });

  const statusOptions = ["reported", "acknowledged", "scheduled", "resolved"] as const;

  const handleStatusChange = (id: number, status: string) => {
    if (status === "resolved") {
      setResolveId(id);
    } else {
      updateStatus.mutate({ id, status: status as any });
    }
  };

  const handleResolve = () => {
    if (!resolveId) return;
    updateStatus.mutate({
      id: resolveId,
      status: "resolved",
      resolutionNotes: resolutionNotes || undefined,
      resolutionPhotoUrls: resolutionPhotos.length > 0 ? resolutionPhotos : undefined,
    });
  };

  const addPhoto = () => {
    if (resolutionPhotoUrl.trim()) {
      setResolutionPhotos((prev) => [...prev, resolutionPhotoUrl.trim()]);
      setResolutionPhotoUrl("");
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Defect Reports</h3>
      {defectsQuery.isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !defectsQuery.data?.length ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No defects reported</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {defectsQuery.data.map((defect) => (
            <Card key={defect.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium">{defect.title}</p>
                    {defect.description && <p className="text-sm text-muted-foreground mt-1">{defect.description}</p>}
                    {defect.photoUrls && (defect.photoUrls as string[]).length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {(defect.photoUrls as string[]).map((url, i) => (
                          <img key={i} src={url} alt="" className="w-12 h-12 object-cover rounded border" />
                        ))}
                      </div>
                    )}
                    {defect.resolutionNotes && (
                      <p className="text-xs text-green-700 mt-2">Resolution: {defect.resolutionNotes}</p>
                    )}
                    {defect.resolutionPhotoUrls && (defect.resolutionPhotoUrls as string[]).length > 0 && (
                      <div className="flex gap-1 mt-1">
                        {(defect.resolutionPhotoUrls as string[]).map((url, i) => (
                          <img key={i} src={url} alt="" className="w-10 h-10 object-cover rounded border border-green-300" />
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Job #{defect.constructionJobId} • {new Date(defect.createdAt).toLocaleDateString("en-AU")}
                    </p>
                  </div>
                  <Select
                    value={defect.status}
                    onValueChange={(v) => handleStatusChange(defect.id, v)}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Resolve dialog */}
      <Dialog open={!!resolveId} onOpenChange={(v) => { if (!v) setResolveId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Defect</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Resolution Notes</Label>
              <Textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Describe what was done to fix the issue..."
                rows={3}
              />
            </div>
            <div>
              <Label>Evidence Photos (paste URL)</Label>
              <div className="flex gap-2">
                <Input
                  value={resolutionPhotoUrl}
                  onChange={(e) => setResolutionPhotoUrl(e.target.value)}
                  placeholder="https://..."
                />
                <Button variant="outline" size="sm" onClick={addPhoto} disabled={!resolutionPhotoUrl.trim()}>Add</Button>
              </div>
              {resolutionPhotos.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {resolutionPhotos.map((url, i) => (
                    <div key={i} className="relative">
                      <img src={url} alt="" className="w-14 h-14 object-cover rounded border" />
                      <button
                        className="absolute -top-1 -right-1 bg-destructive text-white rounded-full w-4 h-4 text-xs flex items-center justify-center"
                        onClick={() => setResolutionPhotos((prev) => prev.filter((_, j) => j !== i))}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button className="w-full" onClick={handleResolve} disabled={updateStatus.isPending}>
              {updateStatus.isPending ? "Resolving..." : "Mark as Resolved"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Maintenance Tab ─────────────────────────────────────────────────────────

function MaintenanceTab() {
  const requestsQuery = trpc.adminPortal.listMaintenanceRequests.useQuery();
  const utils = trpc.useUtils();

  const updateStatus = trpc.adminPortal.updateMaintenanceStatus.useMutation({
    onSuccess: () => {
      toast.success("Status updated");
      utils.adminPortal.listMaintenanceRequests.invalidate();
    },
  });

  const statusOptions = ["submitted", "reviewed", "scheduled", "completed"] as const;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Maintenance Requests</h3>
      {requestsQuery.isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : !requestsQuery.data?.length ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No maintenance requests</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {requestsQuery.data.map((req) => (
            <Card key={req.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-medium">{req.description?.slice(0, 80) || "Maintenance Request"}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-xs">{req.urgency}</Badge>
                      <span className="text-xs text-muted-foreground">Job #{req.constructionJobId}</span>
                      <span className="text-xs text-muted-foreground">{new Date(req.createdAt).toLocaleDateString("en-AU")}</span>
                    </div>
                  </div>
                  <Select
                    value={req.status}
                    onValueChange={(v) => updateStatus.mutate({ id: req.id, status: v as any })}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── News Tab ────────────────────────────────────────────────────────────────

function NewsTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [category, setCategory] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [portalType, setPortalType] = useState<string>("client");

  // Edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editExcerpt, setEditExcerpt] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editCoverImageUrl, setEditCoverImageUrl] = useState("");
  const [editIsPublished, setEditIsPublished] = useState(false);
  const [editPortalType, setEditPortalType] = useState<string>("client");

  const newsQuery = trpc.adminPortal.listNews.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.adminPortal.createNewsArticle.useMutation({
    onSuccess: () => {
      toast.success("Article created");
      utils.adminPortal.listNews.invalidate();
      setShowCreate(false);
      setTitle(""); setSlug(""); setContent(""); setExcerpt(""); setCategory(""); setCoverImageUrl(""); setIsPublished(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = trpc.adminPortal.deleteNewsArticle.useMutation({
    onSuccess: () => {
      toast.success("Article deleted");
      utils.adminPortal.listNews.invalidate();
    },
  });

  const updateMutation = trpc.adminPortal.updateNewsArticle.useMutation({
    onSuccess: () => {
      toast.success("Article updated");
      utils.adminPortal.listNews.invalidate();
      setEditId(null);
    },
  });

  const openEdit = (article: any) => {
    setEditId(article.id);
    setEditTitle(article.title || "");
    setEditSlug(article.slug || "");
    setEditContent(article.content || "");
    setEditExcerpt(article.excerpt || "");
    setEditCategory(article.category || "");
    setEditCoverImageUrl(article.coverImageUrl || "");
    setEditIsPublished(article.isPublished || false);
    setEditPortalType(article.portalType || "client");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">News Articles</h3>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" variant="brand"><Plus className="w-4 h-4 mr-1" /> New Article</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create News Article</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({ title, slug, content, excerpt, coverImageUrl: coverImageUrl || undefined, category: category || undefined, isPublished, portalType: portalType as any });
            }} className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(e) => {
                  setTitle(e.target.value);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
                }} required />
              </div>
              <div>
                <Label>Slug</Label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Category</Label>
                  <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Company News" />
                </div>
                <div>
                  <Label>Cover Image URL</Label>
                  <Input value={coverImageUrl} onChange={(e) => setCoverImageUrl(e.target.value)} placeholder="https://..." />
                </div>
              </div>
              <div>
                <Label>Excerpt</Label>
                <Input value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Brief summary..." />
              </div>
              <div>
                <Label>Content</Label>
                <RichTextEditor content={content} onChange={setContent} placeholder="Write your article content here..." />
              </div>
              <div>
                <Label>Publish To</Label>
                <select className="w-full border rounded px-3 py-2 text-sm" value={portalType} onChange={(e) => setPortalType(e.target.value)}>
                  <option value="client">Client Portal</option>
                  <option value="trade">Trade Portal</option>
                  <option value="da">DA Portal</option>
                  <option value="both">Client + Trade</option>
                  <option value="all">All Portals</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={isPublished} onCheckedChange={setIsPublished} />
                <Label>Publish immediately</Label>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Article"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {newsQuery.isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !newsQuery.data?.length ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No articles yet</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {newsQuery.data.map((article) => (
            <Card key={article.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{article.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {article.publishedAt ? `Published ${new Date(article.publishedAt).toLocaleDateString("en-AU")}` : "Draft"}
                      {article.category && ` · ${article.category}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge className="bg-blue-50 text-blue-700 text-[10px]">
                      {(article as any).portalType === "all" ? "All" : (article as any).portalType === "both" ? "Client+Trade" : (article as any).portalType === "da" ? "DA" : (article as any).portalType === "trade" ? "Trade" : "Client"}
                    </Badge>
                    <Badge className={article.isPublished ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                      {article.isPublished ? "Published" : "Draft"}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(article)} title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {!article.isPublished ? (
                      <Button variant="ghost" size="sm" onClick={() => updateMutation.mutate({ id: article.id, isPublished: true })} title="Publish">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => updateMutation.mutate({ id: article.id, isPublished: false })} title="Unpublish">
                        <Archive className="w-3.5 h-3.5 text-amber-600" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => {
                      if (confirm("Delete this article?")) deleteMutation.mutate({ id: article.id });
                    }} title="Delete">
                      <Ban className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Article Dialog */}
      <Dialog open={!!editId} onOpenChange={(v) => { if (!v) setEditId(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Article</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!editId) return;
            updateMutation.mutate({
              id: editId,
              title: editTitle,
              slug: editSlug,
              content: editContent,
              excerpt: editExcerpt || undefined,
              coverImageUrl: editCoverImageUrl || null,
              category: editCategory || null,
              isPublished: editIsPublished,
              portalType: editPortalType as any,
            });
          }} className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="e.g. Company News" />
              </div>
              <div>
                <Label>Cover Image URL</Label>
                <Input value={editCoverImageUrl} onChange={(e) => setEditCoverImageUrl(e.target.value)} placeholder="https://..." />
              </div>
            </div>
            <div>
              <Label>Excerpt</Label>
              <Input value={editExcerpt} onChange={(e) => setEditExcerpt(e.target.value)} placeholder="Brief summary..." />
            </div>
            <div>
              <Label>Content</Label>
              <RichTextEditor content={editContent} onChange={setEditContent} placeholder="Write your article content here..." />
            </div>
            <div>
              <Label>Publish To</Label>
              <select className="w-full border rounded px-3 py-2 text-sm" value={editPortalType} onChange={(e) => setEditPortalType(e.target.value)}>
                <option value="client">Client Portal</option>
                <option value="trade">Trade Portal</option>
                <option value="da">DA Portal</option>
                <option value="both">Client + Trade</option>
                <option value="all">All Portals</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editIsPublished} onCheckedChange={setEditIsPublished} />
              <Label>Published</Label>
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Products Tab ────────────────────────────────────────────────────────────

function ProductsTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceFrom, setPriceFrom] = useState("");
  const [category, setCategory] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);

  // Edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriceFrom, setEditPriceFrom] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editIsFeatured, setEditIsFeatured] = useState(false);
  const [editImageUrl, setEditImageUrl] = useState("");
  const [editCtaLabel, setEditCtaLabel] = useState("");
  const [editCtaUrl, setEditCtaUrl] = useState("");

  const productsQuery = trpc.adminPortal.listProducts.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.adminPortal.createProduct.useMutation({
    onSuccess: () => {
      toast.success("Product created");
      utils.adminPortal.listProducts.invalidate();
      setShowCreate(false);
      setName(""); setDescription(""); setPriceFrom(""); setCategory(""); setIsFeatured(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = trpc.adminPortal.deleteProduct.useMutation({
    onSuccess: () => {
      toast.success("Product deleted");
      utils.adminPortal.listProducts.invalidate();
    },
  });

  const updateMutation = trpc.adminPortal.updateProduct.useMutation({
    onSuccess: () => {
      toast.success("Product updated");
      utils.adminPortal.listProducts.invalidate();
      setEditId(null);
    },
  });

  const openEdit = (product: any) => {
    setEditId(product.id);
    setEditName(product.name || "");
    setEditDescription(product.description || "");
    setEditPriceFrom(product.priceFrom || "");
    setEditCategory(product.category || "");
    setEditIsFeatured(product.isFeatured || false);
    setEditImageUrl(product.imageUrl || "");
    setEditCtaLabel(product.ctaLabel || "");
    setEditCtaUrl(product.ctaUrl || "");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Products & Services</h3>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" variant="brand"><Plus className="w-4 h-4 mr-1" /> New Product</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Product</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({ name, description, priceFrom, category, isFeatured });
            }} className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
              </div>
              <div>
                <Label>Price From</Label>
                <Input value={priceFrom} onChange={(e) => setPriceFrom(e.target.value)} placeholder="e.g. 299" />
              </div>
              <div>
                <Label>Category</Label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Outdoor Living" />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={isFeatured} onCheckedChange={setIsFeatured} />
                <Label>Featured Product</Label>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Product"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {productsQuery.isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !productsQuery.data?.length ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No products yet</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {productsQuery.data.map((product) => (
            <Card key={product.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{product.name}</p>
                      {product.isFeatured && <Badge className="bg-amber-100 text-amber-700 text-xs">Featured</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {product.category || "Uncategorized"} {product.priceFrom ? `• From $${product.priceFrom}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={product.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                      {product.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(product)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => updateMutation.mutate({ id: product.id, isActive: !product.isActive })}>
                      {product.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => {
                      if (confirm("Delete this product?")) deleteMutation.mutate({ id: product.id });
                    }}>
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Product Dialog */}
      <Dialog open={!!editId} onOpenChange={(v) => { if (!v) setEditId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!editId) return;
            updateMutation.mutate({
              id: editId,
              name: editName,
              description: editDescription || null,
              priceFrom: editPriceFrom || null,
              category: editCategory || null,
              isFeatured: editIsFeatured,
              imageUrl: editImageUrl || null,
              ctaLabel: editCtaLabel || null,
              ctaUrl: editCtaUrl || null,
            });
          }} className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Price From</Label>
                <Input value={editPriceFrom} onChange={(e) => setEditPriceFrom(e.target.value)} placeholder="e.g. 299" />
              </div>
              <div>
                <Label>Category</Label>
                <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="e.g. Outdoor Living" />
              </div>
            </div>
            <div>
              <Label>Image URL</Label>
              <Input value={editImageUrl} onChange={(e) => setEditImageUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CTA Label</Label>
                <Input value={editCtaLabel} onChange={(e) => setEditCtaLabel(e.target.value)} placeholder="e.g. Learn More" />
              </div>
              <div>
                <Label>CTA URL</Label>
                <Input value={editCtaUrl} onChange={(e) => setEditCtaUrl(e.target.value)} placeholder="https://..." />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editIsFeatured} onCheckedChange={setEditIsFeatured} />
              <Label>Featured Product</Label>
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Care Plans Tab ──────────────────────────────────────────────────────────

function CarePlansTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [frequency, setFrequency] = useState<"annual" | "seasonal" | "premium">("annual");
  const [priceSmall, setPriceSmall] = useState("");
  const [priceMedium, setPriceMedium] = useState("");
  const [priceLarge, setPriceLarge] = useState("");
  const [features, setFeatures] = useState("");

  // Edit state
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriceSmall, setEditPriceSmall] = useState("");
  const [editPriceMedium, setEditPriceMedium] = useState("");
  const [editPriceLarge, setEditPriceLarge] = useState("");
  const [editFeatures, setEditFeatures] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);

  const plansQuery = trpc.adminPortal.listPlans.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.adminPortal.createPlan.useMutation({
    onSuccess: () => {
      toast.success("Care plan created");
      utils.adminPortal.listPlans.invalidate();
      setShowCreate(false);
      setName(""); setDescription(""); setFrequency("annual"); setPriceSmall(""); setPriceMedium(""); setPriceLarge(""); setFeatures("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateMutation = trpc.adminPortal.updatePlan.useMutation({
    onSuccess: () => {
      toast.success("Plan updated");
      utils.adminPortal.listPlans.invalidate();
      setEditId(null);
    },
  });

  const openEdit = (plan: any) => {
    setEditId(plan.id);
    setEditName(plan.name || "");
    setEditDescription(plan.description || "");
    setEditPriceSmall(plan.priceSmall || "");
    setEditPriceMedium(plan.priceMedium || "");
    setEditPriceLarge(plan.priceLarge || "");
    setEditFeatures((plan.features || []).join("\n"));
    setEditIsActive(plan.isActive ?? true);
  };

  const frequencyLabels: Record<string, string> = {
    annual: "Annual",
    seasonal: "Seasonal",
    premium: "Premium",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Care Plans (CPC Subscriptions)</h3>
          <p className="text-xs text-muted-foreground">These plans appear on the portal Care Plans page for client subscription.</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button size="sm" variant="brand"><Plus className="w-4 h-4 mr-1" /> New Plan</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Care Plan</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate({
                name,
                description,
                frequency,
                priceSmall,
                priceMedium,
                priceLarge,
                features: features.split("\n").map(f => f.trim()).filter(Boolean),
              });
            }} className="space-y-4">
              <div>
                <Label>Plan Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Essential Clean" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Brief description..." />
              </div>
              <div>
                <Label>Frequency</Label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="seasonal">Seasonal</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Price (Small &lt;30m²)</Label>
                  <Input value={priceSmall} onChange={(e) => setPriceSmall(e.target.value)} required placeholder="e.g. 299" />
                </div>
                <div>
                  <Label>Price (Medium 30-60m²)</Label>
                  <Input value={priceMedium} onChange={(e) => setPriceMedium(e.target.value)} required placeholder="e.g. 399" />
                </div>
                <div>
                  <Label>Price (Large 60m²+)</Label>
                  <Input value={priceLarge} onChange={(e) => setPriceLarge(e.target.value)} required placeholder="e.g. 499" />
                </div>
              </div>
              <div>
                <Label>Features (one per line)</Label>
                <Textarea value={features} onChange={(e) => setFeatures(e.target.value)} rows={4} placeholder="Annual professional clean\nGutter clearance\nInspection report" />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Plan"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {plansQuery.isLoading ? (
        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : !plansQuery.data?.length ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No care plans yet. Create one to show on the portal.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {plansQuery.data.map((plan) => (
            <Card key={plan.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{plan.name}</p>
                      <Badge variant="outline" className="text-xs">{frequencyLabels[plan.frequency] || plan.frequency}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Small: ${plan.priceSmall} · Medium: ${plan.priceMedium} · Large: ${plan.priceLarge}
                    </p>
                    {plan.features && (plan.features as string[]).length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(plan.features as string[]).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Badge className={plan.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                      {plan.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(plan)} title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => updateMutation.mutate({ id: plan.id, isActive: !plan.isActive })}>
                      {plan.isActive ? <Archive className="w-3.5 h-3.5 text-amber-600" /> : <RotateCcw className="w-3.5 h-3.5 text-green-600" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Plan Dialog */}
      <Dialog open={!!editId} onOpenChange={(v) => { if (!v) setEditId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Care Plan</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!editId) return;
            updateMutation.mutate({
              id: editId,
              name: editName,
              description: editDescription || undefined,
              priceSmall: editPriceSmall,
              priceMedium: editPriceMedium,
              priceLarge: editPriceLarge,
              features: editFeatures.split("\n").map(f => f.trim()).filter(Boolean),
              isActive: editIsActive,
            });
          }} className="space-y-4">
            <div>
              <Label>Plan Name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Price (Small)</Label>
                <Input value={editPriceSmall} onChange={(e) => setEditPriceSmall(e.target.value)} required />
              </div>
              <div>
                <Label>Price (Medium)</Label>
                <Input value={editPriceMedium} onChange={(e) => setEditPriceMedium(e.target.value)} required />
              </div>
              <div>
                <Label>Price (Large)</Label>
                <Input value={editPriceLarge} onChange={(e) => setEditPriceLarge(e.target.value)} required />
              </div>
            </div>
            <div>
              <Label>Features (one per line)</Label>
              <Textarea value={editFeatures} onChange={(e) => setEditFeatures(e.target.value)} rows={4} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editIsActive} onCheckedChange={setEditIsActive} />
              <Label>Active</Label>
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const portalTabs = [
  { value: "access", label: "Access", icon: Users },
  { value: "defects", label: "Defects", icon: AlertTriangle },
  { value: "maintenance", label: "Maintenance", icon: Wrench },
  { value: "news", label: "News", icon: Newspaper },
  { value: "products", label: "Products", icon: ShoppingBag },
  { value: "careplans", label: "Care Plans", icon: Heart },
] as const;

export default function AdminPortalManagement() {
  const [activeTab, setActiveTab] = useState("access");
  const activeTabInfo = portalTabs.find((t) => t.value === activeTab) || portalTabs[0];
  const ActiveIcon = activeTabInfo.icon;

  return (
    <div className="container max-w-5xl py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6" /> Client Portal Management
        </h1>
        <p className="text-muted-foreground">Manage client portal access, content, and service requests</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        {/* Desktop: standard tabs row */}
        <TabsList className="hidden sm:flex w-full gap-0.5 h-auto">
          {portalTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-1">
                <Icon className="w-4 h-4" /> {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Mobile: hamburger dropdown */}
        <div className="sm:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Menu className="w-4 h-4" />
                  <ActiveIcon className="w-4 h-4" />
                  {activeTabInfo.label}
                </span>
                <ChevronDown className="w-4 h-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
              {portalTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <DropdownMenuItem
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={activeTab === tab.value ? "bg-accent" : ""}
                  >
                    <Icon className="w-4 h-4 mr-2" /> {tab.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <TabsContent value="access"><PortalAccessTab /></TabsContent>
        <TabsContent value="defects"><DefectsTab /></TabsContent>
        <TabsContent value="maintenance"><MaintenanceTab /></TabsContent>
        <TabsContent value="news"><NewsTab /></TabsContent>
        <TabsContent value="products"><ProductsTab /></TabsContent>
        <TabsContent value="careplans"><CarePlansTab /></TabsContent>
      </Tabs>
    </div>
  );
}
