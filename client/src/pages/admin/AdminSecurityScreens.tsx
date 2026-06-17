import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Percent, DollarSign, Palette, Shield, GlassWater, Upload } from "lucide-react";
import { toast } from "sonner";

// ─── Price Adjustments Tab ──────────────────────────────────────────────────

const DEFAULT_ADJUSTMENT_FORM = { effectiveDate: "", percentageIncrease: "", description: "" };
const DEFAULT_COST_FORM = { category: "per_uom", name: "", description: "", cost: "", uom: "" };
const DEFAULT_OPTION_FORM = { category: "door_handle", orderCode: "", name: "", description: "", brand: "", costPrice: "", sellPrice: "" };
const DEFAULT_GLASS_FORM = { glassType: "", description: "", cost: "", uom: "m2" };
const DEFAULT_COLOUR_FORM = { name: "", hexCode: "#000000", colorbondName: "", surchargePercent: "0" };

function PricingSettingsTab() {
  const utils = trpc.useUtils();
  const { data: settings, isLoading } = trpc.securityScreens.pricingSettings.get.useQuery();
  const updateMutation = trpc.securityScreens.pricingSettings.update.useMutation({
    onSuccess: () => {
      utils.securityScreens.pricingSettings.get.invalidate();
      toast.success("Default markup updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const [defaultMarkupPercent, setDefaultMarkupPercent] = useState("30");

  useEffect(() => {
    if (settings) setDefaultMarkupPercent(String(settings.defaultMarkupPercent ?? 30));
  }, [settings]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quote Pricing Settings</CardTitle>
      </CardHeader>
      <CardContent className="max-w-md space-y-4">
        <div>
          <Label>Default markup %</Label>
          <Input
            type="number"
            min="0"
            max="300"
            step="0.1"
            value={defaultMarkupPercent}
            disabled={isLoading}
            onChange={(e) => setDefaultMarkupPercent(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Applied to new security screen quotes and quote items. Advisors do not edit this in the quote.
          </p>
        </div>
        <Button
          disabled={updateMutation.isPending}
          onClick={() => updateMutation.mutate({ defaultMarkupPercent: parseFloat(defaultMarkupPercent) || 0 })}
        >
          {updateMutation.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PriceAdjustmentsTab() {
  const utils = trpc.useUtils();
  const { data: adjustments = [], isLoading } = trpc.securityScreens.adjustments.list.useQuery();
  const createMutation = trpc.securityScreens.adjustments.create.useMutation({
    onSuccess: () => { utils.securityScreens.adjustments.list.invalidate(); setForm(DEFAULT_ADJUSTMENT_FORM); setOpen(false); toast.success("Adjustment added"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.securityScreens.adjustments.delete.useMutation({
    onSuccess: () => { utils.securityScreens.adjustments.list.invalidate(); toast.success("Adjustment removed"); },
    onError: (e) => toast.error(e.message),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_ADJUSTMENT_FORM);
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setForm(DEFAULT_ADJUSTMENT_FORM);
    setOpen(nextOpen);
  };

  const now = new Date();
  let cumulativeFactor = 1.0;
  for (const adj of adjustments) {
    if (new Date(adj.effectiveDate) <= now) {
      cumulativeFactor *= 1 + parseFloat(adj.percentageIncrease) / 100;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Price Adjustment Factors</h3>
          <p className="text-sm text-muted-foreground">
            Cumulative adjustments applied to base matrix prices. Current factor:{" "}
            <span className="font-mono font-bold text-primary">{(cumulativeFactor * 100 - 100).toFixed(2)}%</span> (×{cumulativeFactor.toFixed(4)})
          </p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Adjustment</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Price Adjustment</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Effective Date</Label><Input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} /></div>
              <div><Label>Percentage Increase (%)</Label><Input type="number" step="0.01" value={form.percentageIncrease} onChange={(e) => setForm({ ...form, percentageIncrease: e.target.value })} placeholder="e.g. 5.0" /></div>
              <div><Label>Description (optional)</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Annual CPI increase" /></div>
              <Button className="w-full" disabled={!form.effectiveDate || !form.percentageIncrease || createMutation.isPending} onClick={() => createMutation.mutate({ effectiveDate: form.effectiveDate, percentageIncrease: parseFloat(form.percentageIncrease), description: form.description || undefined })}>{createMutation.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Effective Date</TableHead><TableHead>Increase %</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead><TableHead className="w-16"></TableHead></TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
          : adjustments.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No adjustments configured</TableCell></TableRow>
          : adjustments.map((adj: any) => (
            <TableRow key={adj.id}>
              <TableCell className="font-mono">{new Date(adj.effectiveDate).toLocaleDateString("en-AU")}</TableCell>
              <TableCell><Badge variant="secondary">{adj.percentageIncrease}%</Badge></TableCell>
              <TableCell>{adj.description || "—"}</TableCell>
              <TableCell>{new Date(adj.effectiveDate) <= now ? <Badge className="bg-green-100 text-green-800">Active</Badge> : <Badge variant="outline">Pending</Badge>}</TableCell>
              <TableCell><Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate({ id: adj.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Cost Additions Tab ─────────────────────────────────────────────────────

const COST_CATEGORIES = [
  { value: "per_uom", label: "Per UOM (Ea, M², LM)" },
  { value: "site_conditions", label: "Site Conditions" },
  { value: "delivery", label: "Delivery" },
  { value: "extra_labour", label: "Extra Labour" },
  { value: "powder_coating", label: "Powder Coating" },
] as const;

function CostAdditionsTab() {
  const utils = trpc.useUtils();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const { data: costs = [], isLoading } = trpc.securityScreens.costAdditions.list.useQuery(
    selectedCategory !== "all" ? { category: selectedCategory } : undefined
  );
  const createMutation = trpc.securityScreens.costAdditions.create.useMutation({
    onSuccess: () => { utils.securityScreens.costAdditions.list.invalidate(); setForm(DEFAULT_COST_FORM); setOpen(false); toast.success("Cost addition created"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.securityScreens.costAdditions.delete.useMutation({
    onSuccess: () => { utils.securityScreens.costAdditions.list.invalidate(); toast.success("Cost removed"); },
    onError: (e) => toast.error(e.message),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_COST_FORM);
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setForm(DEFAULT_COST_FORM);
    setOpen(nextOpen);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h3 className="text-lg font-semibold">Cost Additions</h3><p className="text-sm text-muted-foreground">Additional costs applied to quotes</p></div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Cost</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Cost Addition</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Category</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COST_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Standard Installation" /></div>
              <div><Label>Description (optional)</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Cost ($)</Label><Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
                <div><Label>UOM</Label><Input value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} placeholder="e.g. Ea, M², LM" /></div>
              </div>
              <Button className="w-full" disabled={!form.name || !form.cost || createMutation.isPending} onClick={() => createMutation.mutate({ category: form.category, name: form.name, description: form.description || undefined, cost: parseFloat(form.cost), uom: form.uom || undefined })}>{createMutation.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button variant={selectedCategory === "all" ? "default" : "outline"} size="sm" onClick={() => setSelectedCategory("all")}>All</Button>
        {COST_CATEGORIES.map((c) => <Button key={c.value} variant={selectedCategory === c.value ? "default" : "outline"} size="sm" onClick={() => setSelectedCategory(c.value)}>{c.label}</Button>)}
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Name</TableHead><TableHead>Description</TableHead><TableHead>Cost</TableHead><TableHead>UOM</TableHead><TableHead className="w-16"></TableHead></TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
          : costs.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No cost additions</TableCell></TableRow>
          : costs.map((cost: any) => (
            <TableRow key={cost.id}>
              <TableCell><Badge variant="outline">{COST_CATEGORIES.find((c) => c.value === cost.category)?.label || cost.category}</Badge></TableCell>
              <TableCell className="font-medium">{cost.name}</TableCell>
              <TableCell className="text-muted-foreground">{cost.description || "—"}</TableCell>
              <TableCell className="font-mono">${parseFloat(cost.cost).toFixed(2)}</TableCell>
              <TableCell>{cost.uom || "—"}</TableCell>
              <TableCell><Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate({ id: cost.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Product Options Tab ────────────────────────────────────────────────────

const OPTION_CATEGORIES = [
  { value: "door_handle", label: "Door Handles" },
  { value: "closer", label: "Closers" },
  { value: "buildout_frame", label: "Buildout Frames" },
  { value: "other", label: "Other" },
] as const;

function ProductOptionsTab() {
  const utils = trpc.useUtils();
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const { data: options = [], isLoading } = trpc.securityScreens.productOptions.list.useQuery(
    selectedCategory !== "all" ? { category: selectedCategory } : undefined
  );
  const createMutation = trpc.securityScreens.productOptions.create.useMutation({
    onSuccess: () => { utils.securityScreens.productOptions.list.invalidate(); setForm(DEFAULT_OPTION_FORM); setOpen(false); toast.success("Option created"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.securityScreens.productOptions.delete.useMutation({
    onSuccess: () => { utils.securityScreens.productOptions.list.invalidate(); toast.success("Option removed"); },
    onError: (e) => toast.error(e.message),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_OPTION_FORM);
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setForm(DEFAULT_OPTION_FORM);
    setOpen(nextOpen);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h3 className="text-lg font-semibold">Product Options</h3><p className="text-sm text-muted-foreground">Door handles, closers, buildout frames, and other accessories</p></div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Option</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Product Option</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Category</Label><Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{OPTION_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Order Code</Label><Input value={form.orderCode} onChange={(e) => setForm({ ...form, orderCode: e.target.value })} placeholder="e.g. DH-001" /></div>
                <div><Label>Brand</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} placeholder="e.g. Lockwood" /></div>
              </div>
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. D-Handle Satin Chrome" /></div>
              <div><Label>Description (optional)</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Cost Price ($)</Label><Input type="number" step="0.01" value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} /></div>
                <div><Label>Sell Price ($)</Label><Input type="number" step="0.01" value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: e.target.value })} /></div>
              </div>
              <Button className="w-full" disabled={!form.name || !form.costPrice || !form.sellPrice || createMutation.isPending} onClick={() => createMutation.mutate({ category: form.category, orderCode: form.orderCode || undefined, name: form.name, description: form.description || undefined, brand: form.brand || undefined, costPrice: parseFloat(form.costPrice), sellPrice: parseFloat(form.sellPrice) })}>{createMutation.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button variant={selectedCategory === "all" ? "default" : "outline"} size="sm" onClick={() => setSelectedCategory("all")}>All</Button>
        {OPTION_CATEGORIES.map((c) => <Button key={c.value} variant={selectedCategory === c.value ? "default" : "outline"} size="sm" onClick={() => setSelectedCategory(c.value)}>{c.label}</Button>)}
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Brand</TableHead><TableHead>Category</TableHead><TableHead>Cost</TableHead><TableHead>Sell</TableHead><TableHead>Margin</TableHead><TableHead className="w-16"></TableHead></TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
          : options.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No product options</TableCell></TableRow>
          : options.map((opt: any) => {
            const cost = parseFloat(opt.costPrice); const sell = parseFloat(opt.sellPrice);
            const margin = sell > 0 ? ((sell - cost) / sell * 100).toFixed(1) : "0";
            return (
              <TableRow key={opt.id}>
                <TableCell className="font-mono text-sm">{opt.orderCode || "—"}</TableCell>
                <TableCell className="font-medium">{opt.name}</TableCell>
                <TableCell>{opt.brand || "—"}</TableCell>
                <TableCell><Badge variant="outline">{OPTION_CATEGORIES.find((c) => c.value === opt.category)?.label || opt.category}</Badge></TableCell>
                <TableCell className="font-mono">${cost.toFixed(2)}</TableCell>
                <TableCell className="font-mono">${sell.toFixed(2)}</TableCell>
                <TableCell className="font-mono text-green-600">{margin}%</TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate({ id: opt.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Glass Infill Tab ───────────────────────────────────────────────────────

function GlassInfillTab() {
  const utils = trpc.useUtils();
  const { data: glasses = [], isLoading } = trpc.securityScreens.glassInfill.list.useQuery();
  const createMutation = trpc.securityScreens.glassInfill.create.useMutation({
    onSuccess: () => { utils.securityScreens.glassInfill.list.invalidate(); setForm(DEFAULT_GLASS_FORM); setOpen(false); toast.success("Glass type added"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.securityScreens.glassInfill.delete.useMutation({
    onSuccess: () => { utils.securityScreens.glassInfill.list.invalidate(); toast.success("Glass type removed"); },
    onError: (e) => toast.error(e.message),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_GLASS_FORM);
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setForm(DEFAULT_GLASS_FORM);
    setOpen(nextOpen);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h3 className="text-lg font-semibold">Glass Infill Options</h3><p className="text-sm text-muted-foreground">Glass types available for security screen infill panels</p></div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Glass Type</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Glass Infill</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Glass Type</Label><Input value={form.glassType} onChange={(e) => setForm({ ...form, glassType: e.target.value })} placeholder="e.g. 6.38mm Laminated Clear" /></div>
              <div><Label>Description (optional)</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Cost ($)</Label><Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
                <div><Label>UOM</Label><Input value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} placeholder="e.g. m2, ea" /></div>
              </div>
              <Button className="w-full" disabled={!form.glassType || !form.cost || createMutation.isPending} onClick={() => createMutation.mutate({ glassType: form.glassType, description: form.description || undefined, cost: parseFloat(form.cost), uom: form.uom })}>{createMutation.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader><TableRow><TableHead>Glass Type</TableHead><TableHead>Description</TableHead><TableHead>Cost</TableHead><TableHead>UOM</TableHead><TableHead className="w-16"></TableHead></TableRow></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading...</TableCell></TableRow>
          : glasses.length === 0 ? <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No glass types configured</TableCell></TableRow>
          : glasses.map((g: any) => (
            <TableRow key={g.id}>
              <TableCell className="font-medium">{g.glassType}</TableCell>
              <TableCell className="text-muted-foreground">{g.description || "—"}</TableCell>
              <TableCell className="font-mono">${parseFloat(g.cost).toFixed(2)}</TableCell>
              <TableCell>{g.uom}</TableCell>
              <TableCell><Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate({ id: g.id })}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Colours Tab ────────────────────────────────────────────────────────────

function ColoursTab() {
  const utils = trpc.useUtils();
  const { data: colours = [], isLoading } = trpc.securityScreens.colours.list.useQuery();
  const createMutation = trpc.securityScreens.colours.create.useMutation({
    onSuccess: () => { utils.securityScreens.colours.list.invalidate(); setForm(DEFAULT_COLOUR_FORM); setOpen(false); toast.success("Colour added"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.securityScreens.colours.delete.useMutation({
    onSuccess: () => { utils.securityScreens.colours.list.invalidate(); toast.success("Colour removed"); },
    onError: (e) => toast.error(e.message),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_COLOUR_FORM);
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setForm(DEFAULT_COLOUR_FORM);
    setOpen(nextOpen);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h3 className="text-lg font-semibold">Colours</h3><p className="text-sm text-muted-foreground">Available colour options with optional surcharge percentage</p></div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Colour</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Colour</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Colour Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Monument" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Hex Code</Label><div className="flex gap-2 items-center"><input type="color" value={form.hexCode} onChange={(e) => setForm({ ...form, hexCode: e.target.value })} className="w-10 h-10 rounded border cursor-pointer" /><Input value={form.hexCode} onChange={(e) => setForm({ ...form, hexCode: e.target.value })} className="font-mono" /></div></div>
                <div><Label>Colorbond Name (optional)</Label><Input value={form.colorbondName} onChange={(e) => setForm({ ...form, colorbondName: e.target.value })} /></div>
              </div>
              <div><Label>Surcharge % (0 for standard colours)</Label><Input type="number" step="0.01" value={form.surchargePercent} onChange={(e) => setForm({ ...form, surchargePercent: e.target.value })} /></div>
              <Button className="w-full" disabled={!form.name || !form.hexCode || createMutation.isPending} onClick={() => createMutation.mutate({ name: form.name, hexCode: form.hexCode, colorbondName: form.colorbondName || undefined, surchargePercent: parseFloat(form.surchargePercent) || 0 })}>{createMutation.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {isLoading ? <p className="text-muted-foreground col-span-full text-center">Loading...</p>
        : colours.length === 0 ? <p className="text-muted-foreground col-span-full text-center">No colours configured</p>
        : colours.map((colour: any) => (
          <Card key={colour.id} className="relative group">
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md border shadow-sm flex-shrink-0" style={{ backgroundColor: colour.hexCode }} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{colour.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{colour.hexCode}</p>
                  {parseFloat(colour.surchargePercent || "0") > 0 && <Badge variant="secondary" className="text-xs mt-1">+{colour.surchargePercent}%</Badge>}
                </div>
                <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => deleteMutation.mutate({ id: colour.id })}><Trash2 className="h-3 w-3 text-destructive" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Pricing Matrix Preview Tab ─────────────────────────────────────────────

function PricingMatrixTab() {
  const utils = trpc.useUtils();
  const [brand, setBrand] = useState<string>("alugard");
  const [productType, setProductType] = useState<string>("window");
  const { data: matrix = [], isLoading } = trpc.securityScreens.getMatrix.useQuery({ brand, productType });
  const importMutation = trpc.securityScreens.importMatrixCsv.useMutation({
    onSuccess: (result) => {
      utils.securityScreens.getMatrix.invalidate({ brand, productType });
      toast.success(`Imported ${result.imported} pricing rows`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleImportCsv = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }

    const csv = await file.text();
    importMutation.mutate({ brand, productType, csv });
  };

  const heights = Array.from(new Set(matrix.map((r: any) => r.heightMm))).sort((a: number, b: number) => a - b);
  const widths = Array.from(new Set(matrix.map((r: any) => r.widthMm))).sort((a: number, b: number) => a - b);

  const getPrice = (h: number, w: number) => {
    const row = matrix.find((r: any) => r.heightMm === h && r.widthMm === w);
    return row ? `$${parseFloat(row.priceIncGst).toFixed(0)}` : "—";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Pricing Matrix (Read-Only)</h3>
        <div className="flex gap-2">
          <Select value={brand} onValueChange={setBrand}><SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="alugard">Alu-Gard</SelectItem><SelectItem value="invisigard">Invisi-Gard</SelectItem></SelectContent></Select>
          <Select value={productType} onValueChange={setProductType}><SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="window">Window</SelectItem><SelectItem value="door">Door</SelectItem></SelectContent></Select>
          <Label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground">
            <Upload className="h-4 w-4" />
            {importMutation.isPending ? "Importing..." : "Import CSV"}
            <Input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={importMutation.isPending}
              onChange={(event) => {
                handleImportCsv(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
          </Label>
        </div>
      </div>
      {isLoading ? <p className="text-center text-muted-foreground py-8">Loading matrix...</p>
      : matrix.length === 0 ? <p className="text-center text-muted-foreground py-8">No pricing data</p>
      : (
        <div className="overflow-x-auto border rounded-lg">
          <table className="text-xs w-full">
            <thead><tr className="bg-muted"><th className="p-2 border-r font-medium sticky left-0 bg-muted z-10">H↓ / W→</th>{widths.map((w: number) => <th key={w} className="p-2 font-mono text-center min-w-[60px]">{w}</th>)}</tr></thead>
            <tbody>{heights.map((h: number) => <tr key={h} className="border-t hover:bg-muted/50"><td className="p-2 border-r font-mono font-medium sticky left-0 bg-background z-10">{h}</td>{widths.map((w: number) => <td key={`${h}-${w}`} className="p-2 text-center font-mono">{getPrice(h, w)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Admin Page ────────────────────────────────────────────────────────

export default function AdminSecurityScreens() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Security Screens Admin</h1>
        <p className="text-muted-foreground">Manage pricing, costs, options, and colours for security screen quotes</p>
      </div>
      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="settings" className="flex items-center gap-1"><Percent className="h-3 w-3" /> Settings</TabsTrigger>
          <TabsTrigger value="adjustments" className="flex items-center gap-1"><Percent className="h-3 w-3" /> Adjustments</TabsTrigger>
          <TabsTrigger value="costs" className="flex items-center gap-1"><DollarSign className="h-3 w-3" /> Costs</TabsTrigger>
          <TabsTrigger value="options" className="flex items-center gap-1"><Shield className="h-3 w-3" /> Options</TabsTrigger>
          <TabsTrigger value="glass" className="flex items-center gap-1"><GlassWater className="h-3 w-3" /> Glass</TabsTrigger>
          <TabsTrigger value="colours" className="flex items-center gap-1"><Palette className="h-3 w-3" /> Colours</TabsTrigger>
          <TabsTrigger value="matrix">Matrix</TabsTrigger>
        </TabsList>
        <TabsContent value="settings"><PricingSettingsTab /></TabsContent>
        <TabsContent value="adjustments"><PriceAdjustmentsTab /></TabsContent>
        <TabsContent value="costs"><CostAdditionsTab /></TabsContent>
        <TabsContent value="options"><ProductOptionsTab /></TabsContent>
        <TabsContent value="glass"><GlassInfillTab /></TabsContent>
        <TabsContent value="colours"><ColoursTab /></TabsContent>
        <TabsContent value="matrix"><PricingMatrixTab /></TabsContent>
      </Tabs>
    </div>
  );
}
