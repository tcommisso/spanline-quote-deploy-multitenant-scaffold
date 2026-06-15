import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Save, Package, Wrench, Users, DollarSign, Puzzle, ImagePlus, Loader2, Copy, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";

export default function DeckMasterData() {
  return (
    <Tabs defaultValue="deck-products">
      <TabsList className="h-9 flex-wrap">
        <TabsTrigger value="deck-products" className="text-xs gap-1.5"><Package className="h-3 w-3" /> Deck Products</TabsTrigger>
        <TabsTrigger value="deck-framing" className="text-xs gap-1.5"><Wrench className="h-3 w-3" /> Framing</TabsTrigger>
        <TabsTrigger value="deck-labour" className="text-xs gap-1.5"><Users className="h-3 w-3" /> Labour Rules</TabsTrigger>
        <TabsTrigger value="deck-pricing" className="text-xs gap-1.5"><DollarSign className="h-3 w-3" /> Pricing Rules</TabsTrigger>
        <TabsTrigger value="deck-addons" className="text-xs gap-1.5"><Puzzle className="h-3 w-3" /> Add-Ons</TabsTrigger>
      </TabsList>

      <TabsContent value="deck-products" className="mt-4"><DeckProductsTab /></TabsContent>
      <TabsContent value="deck-framing" className="mt-4"><DeckFramingTab /></TabsContent>
      <TabsContent value="deck-labour" className="mt-4"><DeckLabourTab /></TabsContent>
      <TabsContent value="deck-pricing" className="mt-4"><DeckPricingTab /></TabsContent>
      <TabsContent value="deck-addons" className="mt-4"><DeckAddonsTab /></TabsContent>
    </Tabs>
  );
}

// ─── Deck Products Tab ────────────────────────────────────────────────────────
function DeckProductsTab() {
  const utils = trpc.useUtils();
  const { data: products, isLoading } = trpc.deck.products.list.useQuery({});
  const upsertMutation = trpc.deck.products.upsert.useMutation({
    onSuccess: () => { toast.success("Product saved"); utils.deck.products.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.deck.products.delete.useMutation({
    onSuccess: () => { toast.success("Product deleted"); utils.deck.products.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const uploadImageMutation = trpc.deck.products.uploadImage.useMutation({
    onSuccess: (data) => {
      toast.success("Product image uploaded");
      utils.deck.products.list.invalidate();
      if (editing) setEditing({ ...editing, imageUrl: data.url });
    },
    onError: (err) => toast.error(`Image upload failed: ${err.message}`),
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [sortField, setSortField] = useState<"productName" | "brand" | "type" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const sortedProducts = useMemo(() => {
    let list = [...(products || [])];
    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p: any) =>
        (p.productName || "").toLowerCase().includes(q) ||
        (p.brand || "").toLowerCase().includes(q) ||
        (p.profile || "").toLowerCase().includes(q)
      );
    }
    // Apply type filter
    if (typeFilter !== "all") {
      list = list.filter((p: any) => {
        try {
          const types = JSON.parse(p.boardTypes || "[]");
          return types.includes(typeFilter);
        } catch { return false; }
      });
    }
    // Apply sort
    if (!sortField) return list;
    return list.sort((a: any, b: any) => {
      let valA: string, valB: string;
      if (sortField === "type") {
        try { valA = JSON.parse(a.boardTypes || "[]").join(","); } catch { valA = ""; }
        try { valB = JSON.parse(b.boardTypes || "[]").join(","); } catch { valB = ""; }
      } else {
        valA = (a[sortField] || "").toLowerCase();
        valB = (b[sortField] || "").toLowerCase();
      }
      const cmp = valA.localeCompare(valB);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [products, sortField, sortDir, searchQuery, typeFilter]);

  const toggleSort = (field: "productName" | "brand" | "type") => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 inline text-muted-foreground" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 ml-1 inline" /> : <ArrowDown className="w-3 h-3 ml-1 inline" />;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editing?.id) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadImageMutation.mutate({
        productId: editing.id,
        fileName: file.name,
        fileBase64: base64,
        contentType: file.type || "image/jpeg",
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  if (isLoading) return <div className="animate-pulse h-32 bg-muted rounded-lg" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Deck Products</CardTitle>
        <Button size="sm" onClick={() => setEditing({ productName: "", brand: "", profile: "", retailRatePerM2: 0, clipFixingCostPerM2: 0, wasteDefault: 0.10 })}>
          <Plus className="w-4 h-4 mr-1" />Add Product
        </Button>
      </CardHeader>
      <CardContent>
        {/* Search & Filter Bar */}
        <div className="flex gap-3 mb-3 items-center">
          <div className="flex-1">
            <Input
              placeholder="Search by name, brand, or profile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex gap-1">
            {["all", "deck", "fascia", "fillin", "edge"].map((t) => (
              <Button
                key={t}
                variant={typeFilter === t ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setTypeFilter(t)}
              >
                {t === "all" ? "All" : t === "fillin" ? "Fill-in" : t.charAt(0).toUpperCase() + t.slice(1)}
              </Button>
            ))}
          </div>
        </div>
        {editing && (
          <div className="border rounded-lg p-4 mb-4 bg-muted/30 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Product Name</Label><Input value={editing.productName} onChange={(e) => setEditing({ ...editing, productName: e.target.value })} /></div>
              <div><Label>Brand</Label><Input value={editing.brand} onChange={(e) => setEditing({ ...editing, brand: e.target.value })} /></div>
              <div><Label>Profile</Label><Input value={editing.profile || ""} onChange={(e) => setEditing({ ...editing, profile: e.target.value })} /></div>
              <div><Label>Width (mm)</Label><Input type="number" value={editing.widthMm || ""} onChange={(e) => setEditing({ ...editing, widthMm: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>Thickness (mm)</Label><Input type="number" value={editing.thicknessMm || ""} onChange={(e) => setEditing({ ...editing, thicknessMm: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>Price/Lm ($)</Label><Input type="number" step="0.01" value={editing.pricePerLm || ""} onChange={(e) => setEditing({ ...editing, pricePerLm: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Rate/Board ($)</Label><Input type="number" step="0.01" value={editing.retailRatePerM2 || ""} onChange={(e) => setEditing({ ...editing, retailRatePerM2: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Clip/Board ($)</Label><Input type="number" step="0.01" value={editing.clipFixingCostPerM2 || ""} onChange={(e) => setEditing({ ...editing, clipFixingCostPerM2: parseFloat(e.target.value) || 0 })} /></div>
              
              <div><Label>Board Length (mm)</Label><Input type="number" step="100" value={editing.boardLengthMm || ""} onChange={(e) => setEditing({ ...editing, boardLengthMm: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>Max Joist Spacing (mm)</Label><Input type="number" value={editing.maxJoistSpacingMm || ""} onChange={(e) => setEditing({ ...editing, maxJoistSpacingMm: parseInt(e.target.value) || 0 })} /></div>
            </div>
            {/* Board Type Multi-Select */}
            <div className="pt-2">
              <Label>Board Type</Label>
              <div className="flex gap-4 mt-1">
                {["deck", "fascia", "fillin", "edge"].map((bt) => {
                  const types: string[] = (() => { try { return Array.isArray(editing.boardTypes) ? editing.boardTypes : JSON.parse(editing.boardTypes || "[]"); } catch { return []; } })();
                  return (
                    <label key={bt} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="checkbox" className="rounded border-input" checked={types.includes(bt)} onChange={(e) => {
                        const updated = e.target.checked ? [...types, bt] : types.filter((t: string) => t !== bt);
                        setEditing({ ...editing, boardTypes: updated });
                      }} />
                      {bt === "fillin" ? "Fill-in" : bt.charAt(0).toUpperCase() + bt.slice(1)}
                    </label>
                  );
                })}
              </div>
            </div>
            {/* Product Image Upload */}
            <div className="flex items-center gap-4 pt-2 border-t">
              {editing.imageUrl ? (
                <img src={editing.imageUrl} alt={editing.productName} className="h-20 w-32 object-contain rounded border bg-white" />
              ) : (
                <div className="h-20 w-32 flex items-center justify-center rounded border border-dashed bg-muted/30 text-muted-foreground text-xs">No image</div>
              )}
              <div className="space-y-1">
                <Label>Product Photo</Label>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!editing.id || uploadImageMutation.isPending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadImageMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ImagePlus className="w-4 h-4 mr-1" />}
                  {editing.imageUrl ? "Replace Image" : "Upload Image"}
                </Button>
                {!editing.id && <p className="text-xs text-muted-foreground">Save product first to upload image</p>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { upsertMutation.mutate(editing); setEditing(null); }}><Save className="w-4 h-4 mr-1" />Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left">
              <th className="p-2 w-12"></th>
              <th className="p-2 cursor-pointer select-none" onClick={() => toggleSort("productName")}>Product<SortIcon field="productName" /></th>
              <th className="p-2 cursor-pointer select-none" onClick={() => toggleSort("brand")}>Brand<SortIcon field="brand" /></th>
              <th className="p-2">Profile</th>
              <th className="p-2 cursor-pointer select-none" onClick={() => toggleSort("type")}>Type<SortIcon field="type" /></th>
              <th className="p-2 text-right">Rate/Board</th><th className="p-2 text-right">Clip/Board</th><th className="p-2 text-right">Length</th>
              <th className="p-2 w-20"></th>
            </tr></thead>
            <tbody>
              {sortedProducts.map((p: any) => (
                <tr key={p.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => setEditing(p)}>
                  <td className="p-2">{p.imageUrl ? <img src={p.imageUrl} alt="" className="h-8 w-10 object-contain rounded" /> : <div className="h-8 w-10 rounded bg-muted" />}</td>
                  <td className="p-2">{p.productName}</td>
                  <td className="p-2">{p.brand}</td>
                  <td className="p-2">{p.profile}</td>
                  <td className="p-2 text-xs">{(() => { try { const t = JSON.parse(p.boardTypes || "[]"); return t.map((x: string) => x.charAt(0).toUpperCase() + x.slice(1)).join(", "); } catch { return "\u2014"; } })()}</td>
                  <td className="p-2 text-right">${parseFloat(p.retailRatePerM2 || "0").toFixed(2)}</td>
                  <td className="p-2 text-right">${parseFloat(p.clipFixingCostPerM2 || "0").toFixed(2)}</td>
                  <td className="p-2 text-right">{p.boardLengthMm ? `${p.boardLengthMm}mm` : "—"}</td>
                  <td className="p-2 flex gap-1">
                    <Button size="icon" variant="ghost" title="Duplicate" onClick={(e) => { e.stopPropagation(); const { id, imageUrl, ...rest } = p; setEditing({ ...rest, productName: `${rest.productName} (copy)` }); toast.info("Editing duplicated product — click Save to create"); }}><Copy className="w-4 h-4 text-muted-foreground" /></Button>
                    <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setDeleteTarget(p.id); }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
              {(!products || products.length === 0) && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">No deck products yet</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
      <ConfirmDeleteDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }} onConfirm={() => { if (deleteTarget) { deleteMutation.mutate({ id: deleteTarget }); setDeleteTarget(null); } }} title="Delete Deck Product?" description="This will permanently remove this deck product." />
    </Card>
  );
}

// ─── Deck Framing Tab ─────────────────────────────────────────────────────────
function DeckFramingTab() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.deck.framing.list.useQuery({});
  const upsertMutation = trpc.deck.framing.upsert.useMutation({
    onSuccess: () => { toast.success("Framing saved"); utils.deck.framing.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.deck.framing.delete.useMutation({
    onSuccess: () => { toast.success("Framing deleted"); utils.deck.framing.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [editing, setEditing] = useState<any>(null);

  if (isLoading) return <div className="animate-pulse h-32 bg-muted rounded-lg" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Framing Options</CardTitle>
        <Button size="sm" onClick={() => setEditing({ productName: "", frameType: "steel", beamSize: "", pricePerLm: 0 })}>
          <Plus className="w-4 h-4 mr-1" />Add Framing
        </Button>
      </CardHeader>
      <CardContent>
        {editing && (
          <div className="border rounded-lg p-4 mb-4 bg-muted/30 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Product Name</Label><Input value={editing.productName} onChange={(e) => setEditing({ ...editing, productName: e.target.value })} /></div>
              <div><Label>Frame Type</Label><Input value={editing.frameType} onChange={(e) => setEditing({ ...editing, frameType: e.target.value })} /></div>
              <div><Label>Beam Size</Label><Input value={editing.beamSize} onChange={(e) => setEditing({ ...editing, beamSize: e.target.value })} /></div>
              <div><Label>Price/Lm ($)</Label><Input type="number" step="0.01" value={editing.pricePerLm || ""} onChange={(e) => setEditing({ ...editing, pricePerLm: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Joist Spacing (mm)</Label><Input type="number" value={editing.joistSpacingMm || ""} onChange={(e) => setEditing({ ...editing, joistSpacingMm: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>Beam Spacing (m)</Label><Input type="number" step="0.1" value={editing.beamSpacingM || ""} onChange={(e) => setEditing({ ...editing, beamSpacingM: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Post Spacing (m)</Label><Input type="number" step="0.1" value={editing.postSpacingM || ""} onChange={(e) => setEditing({ ...editing, postSpacingM: parseFloat(e.target.value) || 0 })} /></div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { upsertMutation.mutate(editing); setEditing(null); }}><Save className="w-4 h-4 mr-1" />Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left">
              <th className="p-2">Product</th><th className="p-2">Type</th><th className="p-2">Beam</th>
              <th className="p-2 text-right">$/Lm</th><th className="p-2 text-right">Joist (mm)</th><th className="p-2 text-right">Beam (m)</th>
              <th className="p-2 w-20"></th>
            </tr></thead>
            <tbody>
              {(items || []).map((f: any) => (
                <tr key={f.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => setEditing(f)}>
                  <td className="p-2">{f.productName}</td>
                  <td className="p-2">{f.frameType}</td>
                  <td className="p-2">{f.beamSize}</td>
                  <td className="p-2 text-right">${parseFloat(f.pricePerLm || "0").toFixed(2)}</td>
                  <td className="p-2 text-right">{f.joistSpacingMm || "—"}</td>
                  <td className="p-2 text-right">{f.beamSpacingM || "—"}</td>
                  <td className="p-2 flex gap-1">
                    <Button size="icon" variant="ghost" title="Duplicate" onClick={(e) => { e.stopPropagation(); const { id, ...rest } = f; setEditing({ ...rest, productName: `${rest.productName} (copy)` }); toast.info("Editing duplicated framing — click Save to create"); }}><Copy className="w-4 h-4 text-muted-foreground" /></Button>
                    <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setDeleteTarget(f.id); }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
              {(!items || items.length === 0) && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No framing options yet</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
      <ConfirmDeleteDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }} onConfirm={() => { if (deleteTarget) { deleteMutation.mutate({ id: deleteTarget }); setDeleteTarget(null); } }} title="Delete Framing Option?" description="This will permanently remove this framing option." />
    </Card>
  );
}

// ─── Deck Labour Rules Tab ────────────────────────────────────────────────────
function DeckLabourTab() {
  const utils = trpc.useUtils();
  const { data: rules, isLoading } = trpc.deck.labourRules.list.useQuery();
  const upsertMutation = trpc.deck.labourRules.upsert.useMutation({
    onSuccess: () => { toast.success("Labour rule saved"); utils.deck.labourRules.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.deck.labourRules.delete.useMutation({
    onSuccess: () => { toast.success("Labour rule deleted"); utils.deck.labourRules.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [editing, setEditing] = useState<any>(null);

  if (isLoading) return <div className="animate-pulse h-32 bg-muted rounded-lg" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Labour Rules</CardTitle>
        <Button size="sm" onClick={() => setEditing({ ruleName: "Default", baseRatePerM2: 85, slopingSiteMultiplier: 1.15, restrictedAccessMultiplier: 1.10, elevatedDeckMultiplier: 1.20, pictureFrameLabourUplift: 1.15, splitLevelUplift: 1.10, multiLevelUplift: 1.20 })}>
          <Plus className="w-4 h-4 mr-1" />Add Rule
        </Button>
      </CardHeader>
      <CardContent>
        {editing && (
          <div className="border rounded-lg p-4 mb-4 bg-muted/30 space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <div><Label>Rule Name</Label><Input value={editing.ruleName} onChange={(e) => setEditing({ ...editing, ruleName: e.target.value })} /></div>
              <div><Label>Base Rate/m² ($)</Label><Input type="number" step="1" value={editing.baseRatePerM2} onChange={(e) => setEditing({ ...editing, baseRatePerM2: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Sloping ×</Label><Input type="number" step="0.01" value={editing.slopingSiteMultiplier} onChange={(e) => setEditing({ ...editing, slopingSiteMultiplier: parseFloat(e.target.value) || 1 })} /></div>
              <div><Label>Restricted ×</Label><Input type="number" step="0.01" value={editing.restrictedAccessMultiplier} onChange={(e) => setEditing({ ...editing, restrictedAccessMultiplier: parseFloat(e.target.value) || 1 })} /></div>
              <div><Label>Elevated ×</Label><Input type="number" step="0.01" value={editing.elevatedDeckMultiplier} onChange={(e) => setEditing({ ...editing, elevatedDeckMultiplier: parseFloat(e.target.value) || 1 })} /></div>
              <div><Label>Picture Frame ×</Label><Input type="number" step="0.01" value={editing.pictureFrameLabourUplift} onChange={(e) => setEditing({ ...editing, pictureFrameLabourUplift: parseFloat(e.target.value) || 1 })} /></div>
              <div><Label>Split Level ×</Label><Input type="number" step="0.01" value={editing.splitLevelUplift} onChange={(e) => setEditing({ ...editing, splitLevelUplift: parseFloat(e.target.value) || 1 })} /></div>
              <div><Label>Multi Level ×</Label><Input type="number" step="0.01" value={editing.multiLevelUplift} onChange={(e) => setEditing({ ...editing, multiLevelUplift: parseFloat(e.target.value) || 1 })} /></div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { upsertMutation.mutate(editing); setEditing(null); }}><Save className="w-4 h-4 mr-1" />Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left">
              <th className="p-2">Rule</th><th className="p-2 text-right">Base/m²</th><th className="p-2 text-right">Sloping</th>
              <th className="p-2 text-right">Restricted</th><th className="p-2 text-right">Elevated</th><th className="p-2 text-right">Picture</th>
              <th className="p-2 text-right">Split</th><th className="p-2 text-right">Multi</th><th className="p-2 w-16"></th>
            </tr></thead>
            <tbody>
              {(rules || []).map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => setEditing(r)}>
                  <td className="p-2">{r.ruleName}</td>
                  <td className="p-2 text-right">${parseFloat(r.baseRatePerM2 || "0").toFixed(0)}</td>
                  <td className="p-2 text-right">×{parseFloat(r.slopingSiteMultiplier || "1").toFixed(2)}</td>
                  <td className="p-2 text-right">×{parseFloat(r.restrictedAccessMultiplier || "1").toFixed(2)}</td>
                  <td className="p-2 text-right">×{parseFloat(r.elevatedDeckMultiplier || "1").toFixed(2)}</td>
                  <td className="p-2 text-right">×{parseFloat(r.pictureFrameLabourUplift || "1").toFixed(2)}</td>
                  <td className="p-2 text-right">×{parseFloat(r.splitLevelUplift || "1").toFixed(2)}</td>
                  <td className="p-2 text-right">×{parseFloat(r.multiLevelUplift || "1").toFixed(2)}</td>
                  <td className="p-2"><Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setDeleteTarget(r.id); }}><Trash2 className="w-4 h-4 text-destructive" /></Button></td>
                </tr>
              ))}
              {(!rules || rules.length === 0) && <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">No labour rules yet</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
      <ConfirmDeleteDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }} onConfirm={() => { if (deleteTarget) { deleteMutation.mutate({ id: deleteTarget }); setDeleteTarget(null); } }} title="Delete Labour Rule?" description="This will permanently remove this labour rule." />
    </Card>
  );
}

// ─── Deck Pricing Rules Tab ───────────────────────────────────────────────────
function DeckPricingTab() {
  const utils = trpc.useUtils();
  const { data: rules, isLoading } = trpc.deck.pricingRules.list.useQuery();
  const upsertMutation = trpc.deck.pricingRules.upsert.useMutation({
    onSuccess: () => { toast.success("Pricing rule saved"); utils.deck.pricingRules.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.deck.pricingRules.delete.useMutation({
    onSuccess: () => { toast.success("Pricing rule deleted"); utils.deck.pricingRules.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [editing, setEditing] = useState<any>(null);

  if (isLoading) return <div className="animate-pulse h-32 bg-muted rounded-lg" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Pricing Rules</CardTitle>
        <Button size="sm" onClick={() => setEditing({ ruleName: "Default", defaultMarginPercent: 35, minimumMarginPercent: 25, stretchMarginPercent: 40, gstPercent: 10, defaultDepositPercent: 20, baseDeliveryFee: 350, restrictedAccessSurcharge: 150 })}>
          <Plus className="w-4 h-4 mr-1" />Add Rule
        </Button>
      </CardHeader>
      <CardContent>
        {editing && (
          <div className="border rounded-lg p-4 mb-4 bg-muted/30 space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <div><Label>Rule Name</Label><Input value={editing.ruleName} onChange={(e) => setEditing({ ...editing, ruleName: e.target.value })} /></div>
              <div><Label>Default Margin %</Label><Input type="number" step="1" value={editing.defaultMarginPercent} onChange={(e) => setEditing({ ...editing, defaultMarginPercent: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Min Margin %</Label><Input type="number" step="1" value={editing.minimumMarginPercent} onChange={(e) => setEditing({ ...editing, minimumMarginPercent: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Stretch Margin %</Label><Input type="number" step="1" value={editing.stretchMarginPercent} onChange={(e) => setEditing({ ...editing, stretchMarginPercent: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>GST %</Label><Input type="number" step="1" value={editing.gstPercent} onChange={(e) => setEditing({ ...editing, gstPercent: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Deposit %</Label><Input type="number" step="1" value={editing.defaultDepositPercent} onChange={(e) => setEditing({ ...editing, defaultDepositPercent: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Delivery Fee ($)</Label><Input type="number" step="10" value={editing.baseDeliveryFee} onChange={(e) => setEditing({ ...editing, baseDeliveryFee: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Restricted Surcharge ($)</Label><Input type="number" step="10" value={editing.restrictedAccessSurcharge} onChange={(e) => setEditing({ ...editing, restrictedAccessSurcharge: parseFloat(e.target.value) || 0 })} /></div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { upsertMutation.mutate(editing); setEditing(null); }}><Save className="w-4 h-4 mr-1" />Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left">
              <th className="p-2">Rule</th><th className="p-2 text-right">Margin</th><th className="p-2 text-right">Min</th>
              <th className="p-2 text-right">Stretch</th><th className="p-2 text-right">GST</th><th className="p-2 text-right">Deposit</th>
              <th className="p-2 text-right">Delivery</th><th className="p-2 w-16"></th>
            </tr></thead>
            <tbody>
              {(rules || []).map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => setEditing(r)}>
                  <td className="p-2">{r.ruleName}</td>
                  <td className="p-2 text-right">{parseFloat(r.defaultMarginPercent || "0")}%</td>
                  <td className="p-2 text-right">{parseFloat(r.minimumMarginPercent || "0")}%</td>
                  <td className="p-2 text-right">{parseFloat(r.stretchMarginPercent || "0")}%</td>
                  <td className="p-2 text-right">{parseFloat(r.gstPercent || "0")}%</td>
                  <td className="p-2 text-right">{parseFloat(r.defaultDepositPercent || "0")}%</td>
                  <td className="p-2 text-right">${parseFloat(r.baseDeliveryFee || "0").toFixed(0)}</td>
                  <td className="p-2"><Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setDeleteTarget(r.id); }}><Trash2 className="w-4 h-4 text-destructive" /></Button></td>
                </tr>
              ))}
              {(!rules || rules.length === 0) && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">No pricing rules yet</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
      <ConfirmDeleteDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }} onConfirm={() => { if (deleteTarget) { deleteMutation.mutate({ id: deleteTarget }); setDeleteTarget(null); } }} title="Delete Pricing Rule?" description="This will permanently remove this pricing rule." />
    </Card>
  );
}

// ─── Deck Add-Ons Tab ─────────────────────────────────────────────────────────
function DeckAddonsTab() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.deck.addonItems.list.useQuery({});
  const upsertMutation = trpc.deck.addonItems.upsert.useMutation({
    onSuccess: () => { toast.success("Add-on saved"); utils.deck.addonItems.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.deck.addonItems.delete.useMutation({
    onSuccess: () => { toast.success("Add-on deleted"); utils.deck.addonItems.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [editing, setEditing] = useState<any>(null);

  if (isLoading) return <div className="animate-pulse h-32 bg-muted rounded-lg" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Add-On Items</CardTitle>
        <Button size="sm" onClick={() => setEditing({ itemName: "", category: "stairs", unit: "each", unitPrice: 0 })}>
          <Plus className="w-4 h-4 mr-1" />Add Item
        </Button>
      </CardHeader>
      <CardContent>
        {editing && (
          <div className="border rounded-lg p-4 mb-4 bg-muted/30 space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <div><Label>Item Name</Label><Input value={editing.itemName} onChange={(e) => setEditing({ ...editing, itemName: e.target.value })} /></div>
              <div>
                <Label>Category</Label>
                <Select value={editing.category || ""} onValueChange={(v) => setEditing({ ...editing, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Stairs">Stairs</SelectItem>
                    <SelectItem value="Landing">Landing</SelectItem>
                    <SelectItem value="Handrail">Handrail</SelectItem>
                    <SelectItem value="Screens">Screens</SelectItem>
                    <SelectItem value="Lighting">Lighting</SelectItem>
                    <SelectItem value="Demolition">Demolition</SelectItem>
                    <SelectItem value="Disposal">Disposal</SelectItem>
                    <SelectItem value="Engineering">Engineering</SelectItem>
                    <SelectItem value="Permit">Permit</SelectItem>
                    <SelectItem value="Frame">Frame</SelectItem>
                    <SelectItem value="Fixings">Fixings</SelectItem>
                    <SelectItem value="Waterproofing">Waterproofing</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unit</Label>
                <Select value={editing.unit || "each"} onValueChange={(v) => setEditing({ ...editing, unit: v })}>
                  <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Each">Each</SelectItem>
                    <SelectItem value="Per m²">Per m²</SelectItem>
                    <SelectItem value="Per LM">Per LM (lineal metre)</SelectItem>
                    <SelectItem value="Per Flight">Per Flight</SelectItem>
                    <SelectItem value="Fixed">Fixed (lump sum)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Unit Price ($)</Label><Input type="number" step="0.01" value={editing.unitPrice || ""} onChange={(e) => setEditing({ ...editing, unitPrice: parseFloat(e.target.value) || 0 })} /></div>
              <div><Label>Labour Rate ($)</Label><Input type="number" step="0.01" value={editing.labourRate || ""} onChange={(e) => setEditing({ ...editing, labourRate: parseFloat(e.target.value) || 0 })} /></div>
              <div className="col-span-2"><Label>Description</Label><Input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { upsertMutation.mutate(editing); setEditing(null); }}><Save className="w-4 h-4 mr-1" />Save</Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left">
              <th className="p-2">Item</th><th className="p-2">Category</th><th className="p-2">Unit</th>
              <th className="p-2 text-right">Price</th><th className="p-2 text-right">Labour</th><th className="p-2">Description</th><th className="p-2 w-16"></th>
            </tr></thead>
            <tbody>
              {(items || []).map((a: any) => (
                <tr key={a.id} className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => setEditing(a)}>
                  <td className="p-2">{a.itemName}</td>
                  <td className="p-2 capitalize">{a.category}</td>
                  <td className="p-2">{a.unit || "—"}</td>
                  <td className="p-2 text-right">${parseFloat(a.unitPrice || "0").toFixed(2)}</td>
                  <td className="p-2 text-right">${parseFloat(a.labourRate || "0").toFixed(2)}</td>
                  <td className="p-2 text-muted-foreground">{a.description || "—"}</td>
                  <td className="p-2"><Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setDeleteTarget(a.id); }}><Trash2 className="w-4 h-4 text-destructive" /></Button></td>
                </tr>
              ))}
              {(!items || items.length === 0) && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No add-on items yet</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
      <ConfirmDeleteDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }} onConfirm={() => { if (deleteTarget) { deleteMutation.mutate({ id: deleteTarget }); setDeleteTarget(null); } }} title="Delete Add-On Item?" description="This will permanently remove this add-on item." />
    </Card>
  );
}
