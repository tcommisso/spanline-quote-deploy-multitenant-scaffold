import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Newspaper, FileText, MessageSquare, KeyRound, Plus, Trash2, Send,
  Eye, EyeOff, RefreshCw, Copy, ExternalLink, Menu, ChevronDown,
  HardHat, Mail, Pencil, Check, X, Clock, ArrowLeft, Link2, Loader2,
  Phone, AlertCircle, Download, ArrowUpDown, Users, FileCheck, BellRing
} from "lucide-react";
import { toast } from "sonner";
import RichTextEditor from "@/components/RichTextEditor";
import TradeNotificationRulesManager from "@/components/TradeNotificationRulesManager";

// ─── News Tab ───────────────────────────────────────────────────────────────

function NewsTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [isPublished, setIsPublished] = useState(false);

  const newsQuery = trpc.adminTradePortal.listNews.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.adminTradePortal.createNews.useMutation({
    onSuccess: () => {
      toast.success("News article created");
      utils.adminTradePortal.listNews.invalidate();
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateMutation = trpc.adminTradePortal.updateNews.useMutation({
    onSuccess: () => {
      toast.success("Article updated");
      utils.adminTradePortal.listNews.invalidate();
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = trpc.adminTradePortal.deleteNews.useMutation({
    onSuccess: () => {
      toast.success("Article deleted");
      utils.adminTradePortal.listNews.invalidate();
    },
  });

  function resetForm() {
    setShowCreate(false);
    setEditingId(null);
    setTitle("");
    setSlug("");
    setExcerpt("");
    setContent("");
    setCategory("");
    setIsPublished(false);
  }

  function startEdit(article: any) {
    setEditingId(article.id);
    setTitle(article.title);
    setSlug(article.slug);
    setExcerpt(article.excerpt || "");
    setContent(article.content || "");
    setCategory(article.category || "");
    setIsPublished(article.isPublished);
    setShowCreate(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = { title, slug, excerpt, content, category, isPublished };
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...data });
    } else {
      createMutation.mutate(data);
    }
  }

  if (newsQuery.isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">News Articles</h3>
        <Dialog open={showCreate} onOpenChange={(open) => { if (!open) resetForm(); else setShowCreate(true); }}>
          <DialogTrigger asChild>
            <Button size="sm" variant="brand"><Plus className="w-4 h-4 mr-1" /> New Article</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Article" : "Create Article"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Article title..." required />
                </div>
                <div>
                  <Label>Slug</Label>
                  <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="article-slug" required />
                </div>
              </div>
              <div>
                <Label>Category</Label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Update, Safety, General" />
              </div>
              <div>
                <Label>Excerpt</Label>
                <Textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="Brief summary..." rows={2} />
              </div>
              <div>
                <Label>Content</Label>
                <RichTextEditor content={content} onChange={setContent} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={isPublished} onCheckedChange={setIsPublished} />
                <Label>Published</Label>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Update" : "Create"} Article
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {newsQuery.data?.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No news articles yet. Create one to get started.</CardContent></Card>
      )}

      <div className="space-y-2">
        {newsQuery.data?.map((article: any) => (
          <Card key={article.id}>
            <CardContent className="py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium">{article.title}</span>
                    {article.isPublished ? (
                      <Badge variant="default" className="text-xs"><Eye className="w-3 h-3 mr-0.5" /> Published</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs"><EyeOff className="w-3 h-3 mr-0.5" /> Draft</Badge>
                    )}
                    {article.category && <Badge variant="secondary" className="text-xs">{article.category}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{article.excerpt || "No excerpt"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{new Date(article.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(article)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (confirm("Delete this article?")) deleteMutation.mutate({ id: article.id });
                  }}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Xero Bills Section ────────────────────────────────────────────────────

function XeroBillsSection({ installerId }: { installerId: number }) {
  const billsQuery = trpc.adminTradePortal.getXeroBills.useQuery({ installerId });
  const matchMutation = trpc.adminTradePortal.matchTradeToXero.useMutation({
    onSuccess: (data) => {
      toast.success(`Matched to Xero contact "${data.contactName}" (by ${data.matchedBy})`);
      billsQuery.refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (billsQuery.isLoading) return <Skeleton className="h-20 w-full" />;

  const data = billsQuery.data;
  if (!data) return null;

  if (!data.connected) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        <AlertCircle className="w-5 h-5 mx-auto mb-2 text-amber-500" />
        Xero not connected. Connect Xero in Settings to view bills.
      </div>
    );
  }

  if (data.error && data.bills.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center">
        <p className="text-sm text-muted-foreground mb-3">{data.error}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => matchMutation.mutate({ installerId })}
          disabled={matchMutation.isPending}
        >
          {matchMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Link2 className="w-4 h-4 mr-1" />}
          Link to Xero
        </Button>
      </div>
    );
  }

  if (data.bills.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        No bills found in Xero for this supplier.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground">Xero Bills (Accounts Payable)</h4>
        <Button size="sm" variant="ghost" onClick={() => billsQuery.refetch()}>
          <RefreshCw className="w-3 h-3" />
        </Button>
      </div>
      {data.bills.map((bill: any) => (
        <div key={bill.invoiceId} className="rounded-lg border p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-medium">{bill.invoiceNumber || "No Number"}</span>
                <Badge variant={
                  bill.status === "PAID" ? "default" :
                  bill.status === "AUTHORISED" ? "secondary" :
                  "outline"
                } className="text-xs">
                  {bill.status}
                </Badge>
              </div>
              {bill.reference && <p className="text-muted-foreground text-xs">Ref: {bill.reference}</p>}
              <p className="text-xs text-muted-foreground">
                {bill.date ? new Date(bill.date).toLocaleDateString() : "No date"}
                {bill.dueDate ? ` · Due ${new Date(bill.dueDate).toLocaleDateString()}` : ""}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-medium">${Number(bill.total || 0).toFixed(2)}</p>
              {bill.amountDue > 0 && (
                <p className="text-xs text-amber-600">Due: ${Number(bill.amountDue).toFixed(2)}</p>
              )}
              {bill.amountPaid > 0 && (
                <p className="text-xs text-green-600">Paid: ${Number(bill.amountPaid).toFixed(2)}</p>
              )}
            </div>
          </div>
          {bill.lineItems && bill.lineItems.length > 0 && (
            <div className="mt-2 pt-2 border-t">
              {bill.lineItems.slice(0, 3).map((li: any, idx: number) => (
                <p key={idx} className="text-xs text-muted-foreground truncate">
                  {li.description} — {li.quantity} x ${Number(li.unitAmount || 0).toFixed(2)}
                </p>
              ))}
              {bill.lineItems.length > 3 && (
                <p className="text-xs text-muted-foreground">+{bill.lineItems.length - 3} more items</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Reconciliation Stats Card ─────────────────────────────────────────────

function ReconciliationCard() {
  const statsQuery = trpc.adminTradePortal.reconciliationStats.useQuery();
  const utils = trpc.useUtils();

  const reconcileMutation = trpc.adminTradePortal.reconcileXeroPayments.useMutation({
    onSuccess: (data) => {
      if (data.created > 0) {
        toast.success(`Created ${data.created} remittance records from Xero payments`);
      } else {
        toast.info("No new payments to reconcile — everything is up to date");
      }
      if (data.skipped > 0) toast.info(`${data.skipped} payments already synced`);
      if (data.errors > 0) toast.warning(`${data.errors} errors during reconciliation`);
      utils.adminTradePortal.reconciliationStats.invalidate();
      utils.adminTradePortal.listRemittances.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const bulkContactSyncMutation = trpc.adminTradePortal.bulkSyncContactsFromXero.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced ${data.synced} of ${data.total} trade contacts from Xero`);
      if (data.failed > 0) toast.warning(`${data.failed} failed to sync`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (statsQuery.isLoading) return <Skeleton className="h-32 w-full" />;
  const stats = statsQuery.data;
  if (!stats) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowUpDown className="w-4 h-4" /> Xero Reconciliation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border p-3 text-center">
            <p className="text-2xl font-bold">{stats.manualRemittances}</p>
            <p className="text-xs text-muted-foreground">Manual Uploads</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.xeroRemittances}</p>
            <p className="text-xs text-muted-foreground">From Xero</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-2xl font-bold">{stats.linkedTrades}</p>
            <p className="text-xs text-muted-foreground">Linked Trades</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-2xl font-bold">{stats.totalActiveTrades}</p>
            <p className="text-xs text-muted-foreground">Active Trades</p>
          </div>
        </div>

        {stats.lastXeroSyncAt && (
          <p className="text-xs text-muted-foreground">
            Last Xero sync: {new Date(stats.lastXeroSyncAt!).toLocaleString()}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => reconcileMutation.mutate()}
            disabled={reconcileMutation.isPending}
          >
            {reconcileMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-1" />
            )}
            Sync Payments from Xero
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkContactSyncMutation.mutate()}
            disabled={bulkContactSyncMutation.isPending}
          >
            {bulkContactSyncMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Users className="w-4 h-4 mr-1" />
            )}
            Sync All Contacts from Xero
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Contact Sync Buttons ──────────────────────────────────────────────────

function ContactSyncButtons({ installerId }: { installerId: number }) {
  const utils = trpc.useUtils();

  const pullMutation = trpc.adminTradePortal.syncContactFromXero.useMutation({
    onSuccess: (data) => {
      if (data.updatedFields.length > 0) {
        toast.success(`Updated: ${data.updatedFields.join(", ")}`);
      } else {
        toast.info("Contact details already in sync");
      }
      utils.adminTradePortal.listRemittances.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const pushMutation = trpc.adminTradePortal.pushContactToXero.useMutation({
    onSuccess: () => {
      toast.success("Trade details pushed to Xero");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="flex gap-1">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => pullMutation.mutate({ installerId })}
        disabled={pullMutation.isPending}
        title="Pull contact details from Xero"
      >
        {pullMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => pushMutation.mutate({ installerId })}
        disabled={pushMutation.isPending}
        title="Push local details to Xero"
      >
        {pushMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
      </Button>
    </div>
  );
}

// ─── Remittances Tab ────────────────────────────────────────────────────────

function RemittancesTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [installerId, setInstallerId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [xeroTradeId, setXeroTradeId] = useState<string>("");

  const remittancesQuery = trpc.adminTradePortal.listRemittances.useQuery();
  const tradesQuery = trpc.people.search.useQuery({ type: "trade", limit: 200 });
  const utils = trpc.useUtils();

  const bulkMatchMutation = trpc.adminTradePortal.bulkMatchTradesToXero.useMutation({
    onSuccess: (data) => {
      toast.success(`Matched ${data.matched} of ${data.total} trades to Xero`);
      if (data.failed > 0) toast.info(`${data.failed} trades could not be matched`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const createMutation = trpc.adminTradePortal.createRemittance.useMutation({
    onSuccess: () => {
      toast.success("Remittance advice uploaded");
      utils.adminTradePortal.listRemittances.invalidate();
      utils.adminTradePortal.reconciliationStats.invalidate();
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = trpc.adminTradePortal.deleteRemittance.useMutation({
    onSuccess: () => {
      toast.success("Remittance deleted");
      utils.adminTradePortal.listRemittances.invalidate();
      utils.adminTradePortal.reconciliationStats.invalidate();
    },
  });

  function resetForm() {
    setShowCreate(false);
    setInstallerId("");
    setAmount("");
    setDate(new Date().toISOString().split("T")[0]);
    setReference("");
    setNotes("");
    setFile(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    let fileBase64: string | undefined;
    let fileName: string | undefined;
    let fileMimeType: string | undefined;

    if (file) {
      const buffer = await file.arrayBuffer();
      fileBase64 = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(buffer))));
      fileName = file.name;
      fileMimeType = file.type;
    }

    createMutation.mutate({
      installerId: Number(installerId),
      amount,
      date,
      reference: reference || undefined,
      notes: notes || undefined,
      fileBase64,
      fileName,
      fileMimeType,
    });
  }

  if (remittancesQuery.isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-semibold">Remittance Advice</h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulkMatchMutation.mutate()}
            disabled={bulkMatchMutation.isPending}
          >
            {bulkMatchMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Link2 className="w-4 h-4 mr-1" />}
            Sync Trades to Xero
          </Button>
          <Dialog open={showCreate} onOpenChange={(open) => { if (!open) resetForm(); else setShowCreate(true); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Upload Remittance</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Remittance Advice</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Trade</Label>
                  <Select value={installerId} onValueChange={setInstallerId}>
                    <SelectTrigger><SelectValue placeholder="Select trade..." /></SelectTrigger>
                    <SelectContent>
                      {tradesQuery.data?.map((t: any) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name} ({t.tradeType})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Amount ($)</Label>
                    <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                  </div>
                </div>
                <div>
                  <Label>Reference</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Payment reference..." />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
                </div>
                <div>
                  <Label>PDF File</Label>
                  <Input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={createMutation.isPending || !installerId || !amount}>
                    Upload Remittance
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm}>Cancel</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Upload remittance advice PDFs for trades, view bills from Xero, and auto-reconcile payments. Use "Sync Trades to Xero" to auto-match trades by email address.
      </p>

      {/* Reconciliation Stats */}
      <ReconciliationCard />

      {/* Xero Bills per trade selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            Xero Ledger Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3">
            <Label className="text-sm">Select trade to view Xero bills</Label>
            <div className="flex gap-2 mt-1">
              <Select value={xeroTradeId} onValueChange={setXeroTradeId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select a trade..." /></SelectTrigger>
                <SelectContent>
                  {tradesQuery.data?.map((t: any) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {xeroTradeId && <ContactSyncButtons installerId={Number(xeroTradeId)} />}
            </div>
          </div>
          {xeroTradeId && <XeroBillsSection installerId={Number(xeroTradeId)} />}
          {!xeroTradeId && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Select a trade above to view their Xero bills and payment history. Use the sync buttons to pull/push contact details.
            </p>
          )}
        </CardContent>
      </Card>

      {/* All remittances */}
      <h4 className="text-sm font-medium text-muted-foreground mt-6">All Remittances</h4>

      {remittancesQuery.data?.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No remittances yet. Upload one or sync from Xero.</CardContent></Card>
      )}

      <div className="space-y-2">
        {remittancesQuery.data?.map((r: any) => (
          <Card key={r.id}>
            <CardContent className="py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium">{r.installerName}</span>
                    <Badge variant="outline">${Number(r.amount).toFixed(2)}</Badge>
                    {r.source === "xero" ? (
                      <Badge variant="secondary" className="text-xs">
                        <ArrowUpDown className="w-3 h-3 mr-0.5" /> Xero
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        <FileCheck className="w-3 h-3 mr-0.5" /> Manual
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(r.date).toLocaleDateString()}
                    {r.reference && ` · Ref: ${r.reference}`}
                    {r.xeroInvoiceNumber && ` · Invoice: ${r.xeroInvoiceNumber}`}
                  </p>
                  {r.notes && <p className="text-xs text-muted-foreground mt-0.5">{r.notes}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {r.fileUrl && (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={r.fileUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (confirm("Delete this remittance?")) deleteMutation.mutate({ id: r.id });
                  }}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Messages Tab ───────────────────────────────────────────────────────────

function MessagesTab() {
  const [selectedInstallerId, setSelectedInstallerId] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const [bulkContent, setBulkContent] = useState("");
  const [bulkSubject, setBulkSubject] = useState("");
  const [channels, setChannels] = useState<string[]>(["portal"]);

  const threadsQuery = trpc.adminTradePortal.listMessageThreads.useQuery();
  const messagesQuery = trpc.adminTradePortal.getMessages.useQuery(
    { installerId: selectedInstallerId! },
    { enabled: !!selectedInstallerId }
  );
  const tradeTemplatesQuery = trpc.adminTradePortal.tradeTemplates.useQuery();
  const utils = trpc.useUtils();

  const activeTradeTemplates = useMemo(
    () => (tradeTemplatesQuery.data || []).filter((t: any) => t.isActive),
    [tradeTemplatesQuery.data]
  );

  const sendMutation = trpc.adminTradePortal.sendMessage.useMutation({
    onSuccess: () => {
      toast.success("Message sent");
      setReplyContent("");
      utils.adminTradePortal.getMessages.invalidate();
      utils.adminTradePortal.listMessageThreads.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const bulkMutation = trpc.adminTradePortal.sendBulkAnnouncement.useMutation({
    onSuccess: (data: any) => {
      const parts: string[] = [];
      if (data.portalSent > 0) parts.push(`${data.portalSent} portal messages`);
      if (data.smsSent > 0) parts.push(`${data.smsSent} SMS`);
      if (data.emailSent > 0) parts.push(`${data.emailSent} emails`);
      toast.success(`Sent: ${parts.join(", ")}`);
      if (data.smsErrors > 0) toast.warning(`${data.smsErrors} SMS failed`);
      if (data.emailErrors > 0) toast.warning(`${data.emailErrors} emails failed`);
      setBulkContent("");
      setBulkSubject("");
      setChannels(["portal"]);
      setShowBulk(false);
      utils.adminTradePortal.listMessageThreads.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  function toggleChannel(ch: string) {
    setChannels(prev =>
      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
    );
  }

  function handleTemplateSelect(templateId: string) {
    const template = activeTradeTemplates.find((t: any) => String(t.id) === templateId);
    if (template) {
      setBulkContent(template.body);
      toast.info(`Template "${template.name}" loaded`);
    }
  }

  function handleReplyTemplateSelect(templateId: string) {
    const template = activeTradeTemplates.find((t: any) => String(t.id) === templateId);
    if (template) {
      setReplyContent(template.body);
      toast.info(`Template "${template.name}" loaded`);
    }
  }

  // Thread list view
  if (!selectedInstallerId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Trade Messages</h3>
          <Dialog open={showBulk} onOpenChange={setShowBulk}>
            <DialogTrigger asChild>
              <Button size="sm"><Send className="w-4 h-4 mr-1" /> Bulk Announcement</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Send Bulk Announcement</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">This message will be sent to all trades with active portal access via the selected channels.</p>

              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium mb-2 block">Channels</Label>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={channels.includes("portal")}
                        onCheckedChange={() => toggleChannel("portal")}
                      />
                      <MessageSquare className="w-4 h-4" /> Portal Message
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={channels.includes("sms")}
                        onCheckedChange={() => toggleChannel("sms")}
                      />
                      <Phone className="w-4 h-4" /> SMS
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={channels.includes("email")}
                        onCheckedChange={() => toggleChannel("email")}
                      />
                      <Mail className="w-4 h-4" /> Email
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    SMS and email announcements are also posted to the trade portal notification feed.
                  </p>
                </div>

                {channels.includes("email") && (
                  <div>
                    <Label>Email Subject</Label>
                    <Input
                      value={bulkSubject}
                      onChange={(e) => setBulkSubject(e.target.value)}
                      placeholder="Announcement from Altaspan"
                    />
                  </div>
                )}

                {/* Trade SMS Template Picker */}
                {activeTradeTemplates.length > 0 && (
                  <div>
                    <Label>Use Template</Label>
                    <Select onValueChange={handleTemplateSelect}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select a trade template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {activeTradeTemplates.map((t: any) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            <span className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs shrink-0">{t.category.replace("Trade - ", "")}</Badge>
                              {t.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Templates use merge fields like {"{{trade_name}}"}, {"{{site_address}}"}, {"{{job_date}}"} — replace before sending.
                    </p>
                  </div>
                )}

                <div>
                  <Label>Message</Label>
                  <Textarea
                    value={bulkContent}
                    onChange={(e) => setBulkContent(e.target.value)}
                    placeholder="Type your announcement..."
                    rows={4}
                  />
                  {channels.includes("sms") && (
                    <p className="text-xs text-muted-foreground mt-1">
                      SMS will be sent as plain text (HTML stripped). {bulkContent.length}/1600 characters.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => bulkMutation.mutate({
                    content: bulkContent,
                    subject: bulkSubject || undefined,
                    channels: channels as any,
                  })}
                  disabled={bulkMutation.isPending || !bulkContent.trim() || channels.length === 0}
                >
                  {bulkMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                  Send to All Trades
                </Button>
                <Button variant="outline" onClick={() => setShowBulk(false)}>Cancel</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <p className="text-sm text-muted-foreground">
          View and reply to messages from trades. Unread messages from trades are highlighted.
        </p>

        {threadsQuery.isLoading && <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>}

        {threadsQuery.data?.length === 0 && (
          <Card><CardContent className="py-8 text-center text-muted-foreground">No messages yet.</CardContent></Card>
        )}

        <div className="space-y-2">
          {threadsQuery.data?.map((thread: any) => (
            <Card
              key={thread.installerId}
              className={`cursor-pointer hover:bg-accent/50 transition-colors ${thread.unreadCount > 0 ? "border-primary/50" : ""}`}
              onClick={() => setSelectedInstallerId(thread.installerId)}
            >
              <CardContent className="py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-medium">{thread.installerName}</span>
                      {thread.unreadCount > 0 && (
                        <Badge variant="destructive" className="text-xs">{thread.unreadCount} new</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{thread.lastMessage}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(thread.lastMessageAt).toLocaleString()} · {thread.totalMessages} messages
                    </p>
                  </div>
                  <MessageSquare className="w-5 h-5 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Individual conversation view
  const thread = threadsQuery.data?.find((t: any) => t.installerId === selectedInstallerId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setSelectedInstallerId(null)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <h3 className="text-lg font-semibold">{thread?.installerName || "Trade"}</h3>
      </div>

      {messagesQuery.isLoading && <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}

      <div className="space-y-2 max-h-[400px] overflow-y-auto p-2 rounded-lg border bg-muted/30">
        {messagesQuery.data?.map((msg: any) => (
          <div
            key={msg.id}
            className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
              msg.direction === "outbound"
                ? "bg-primary text-primary-foreground"
                : "bg-background border"
            }`}>
              <p>{msg.content}</p>
              <p className={`text-xs mt-1 ${msg.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {msg.senderName} · {new Date(msg.createdAt).toLocaleString()}
              </p>
              {msg.attachmentUrl && (
                <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline mt-1 inline-block">
                  View Attachment
                </a>
              )}
            </div>
          </div>
        ))}
        {messagesQuery.data?.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No messages in this conversation yet.</p>
        )}
      </div>

      {/* Reply with template picker */}
      <div className="space-y-2">
        {activeTradeTemplates.length > 0 && (
          <Select onValueChange={handleReplyTemplateSelect}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Use a trade template..." />
            </SelectTrigger>
            <SelectContent>
              {activeTradeTemplates.map((t: any) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs shrink-0">{t.category.replace("Trade - ", "")}</Badge>
                    {t.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!replyContent.trim()) return;
            sendMutation.mutate({ installerId: selectedInstallerId, content: replyContent });
          }}
          className="flex gap-2"
        >
          <Input
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Type a reply..."
            className="flex-1"
          />
          <Button type="submit" disabled={sendMutation.isPending || !replyContent.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}

// ─── Access Management Tab ──────────────────────────────────────────────────

function AccessManagementTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTradeId, setSelectedTradeId] = useState("");
  const [email, setEmail] = useState("");

  const accessQuery = trpc.adminTradePortal.listAccess.useQuery();
  const tradesWithoutAccessQuery = trpc.adminTradePortal.tradesWithoutAccess.useQuery();
  const utils = trpc.useUtils();

  const createMutation = trpc.adminTradePortal.createAccess.useMutation({
    onSuccess: (data) => {
      toast.success("Portal access created");
      const portalUrl = `${window.location.origin}/trade-portal/login?token=${data.accessToken}`;
      navigator.clipboard.writeText(portalUrl);
      toast.info("Portal login link copied to clipboard");
      utils.adminTradePortal.listAccess.invalidate();
      utils.adminTradePortal.tradesWithoutAccess.invalidate();
      resetForm();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleMutation = trpc.adminTradePortal.toggleAccess.useMutation({
    onSuccess: (data) => {
      toast.success(data.success ? "Access toggled" : "Toggle failed");
      utils.adminTradePortal.listAccess.invalidate();
    },
  });

  const deleteMutation = trpc.adminTradePortal.deleteAccess.useMutation({
    onSuccess: () => {
      toast.success("Access revoked");
      utils.adminTradePortal.listAccess.invalidate();
      utils.adminTradePortal.tradesWithoutAccess.invalidate();
    },
  });

  function resetForm() {
    setShowCreate(false);
    setSelectedTradeId("");
    setEmail("");
  }

  if (accessQuery.isLoading) return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Access Management</h3>
        <Dialog open={showCreate} onOpenChange={(open) => { if (!open) resetForm(); else setShowCreate(true); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Invite Access</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Trade Portal Access</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Trade</Label>
                <Select value={selectedTradeId} onValueChange={(val) => {
                  setSelectedTradeId(val);
                  const trade = tradesWithoutAccessQuery.data?.find((t: any) => String(t.id) === val);
                  if (trade?.email) setEmail(trade.email);
                }}>
                  <SelectTrigger><SelectValue placeholder="Select trade..." /></SelectTrigger>
                  <SelectContent>
                    {tradesWithoutAccessQuery.data?.map((t: any) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name} ({t.tradeType})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Email (for magic link)</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="trade@example.com" type="email" />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => createMutation.mutate({
                    installerId: Number(selectedTradeId),
                    email: email || "",
                  })}
                  disabled={createMutation.isPending || !selectedTradeId}
                >
                  Send Invitation
                </Button>
                <Button variant="outline" onClick={resetForm}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <p className="text-sm text-muted-foreground">
        Manage trade portal access. Each trade gets a unique magic link for passwordless login.
      </p>

      {accessQuery.data?.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">No portal access granted yet.</CardContent></Card>
      )}

      <div className="space-y-2">
        {accessQuery.data?.map((access: any) => (
          <Card key={access.id}>
            <CardContent className="py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-medium">{access.installerName || `Trade #${access.installerId}`}</span>
                    {access.isActive ? (
                      <Badge variant="default" className="text-xs"><Check className="w-3 h-3 mr-0.5" /> Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs"><X className="w-3 h-3 mr-0.5" /> Disabled</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {access.email || "No email"}
                    {access.lastLoginAt && ` · Last login: ${new Date(access.lastLoginAt).toLocaleDateString()}`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Created: {new Date(access.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const portalUrl = `${window.location.origin}/trade-portal/login?token=${access.accessToken}`;
                      navigator.clipboard.writeText(portalUrl);
                      toast.success("Portal link copied to clipboard");
                    }}
                    title="Copy portal link"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleMutation.mutate({ id: access.id, isActive: !access.isActive })}
                  >
                    {access.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (confirm("Revoke this trade's portal access?")) deleteMutation.mutate({ id: access.id });
                  }}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

const portalTabs = [
  { value: "news", label: "News", icon: Newspaper },
  { value: "remittances", label: "Remittances", icon: FileText },
  { value: "messages", label: "Messages", icon: MessageSquare },
  { value: "notifications", label: "Notification Rules", icon: BellRing },
  { value: "access", label: "Access Management", icon: KeyRound },
] as const;

export default function AdminTradePortalContent() {
  const [activeTab, setActiveTab] = useState("news");
  const activeTabInfo = portalTabs.find((t) => t.value === activeTab) || portalTabs[0];
  const ActiveIcon = activeTabInfo.icon;

  return (
    <div className="container max-w-5xl py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HardHat className="w-6 h-6" /> Trade Portal Management
        </h1>
        <p className="text-muted-foreground">Manage trade portal content, notifications, remittances, messages, and access</p>
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

        <TabsContent value="news"><NewsTab /></TabsContent>
        <TabsContent value="remittances"><RemittancesTab /></TabsContent>
        <TabsContent value="messages"><MessagesTab /></TabsContent>
        <TabsContent value="notifications"><TradeNotificationRulesManager /></TabsContent>
        <TabsContent value="access"><AccessManagementTab /></TabsContent>
      </Tabs>
    </div>
  );
}
