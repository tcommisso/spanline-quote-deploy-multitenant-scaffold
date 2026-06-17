import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Copy, Download, Plus, Trash2, Camera, ArrowLeft, FileText, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Link, useParams, useLocation } from "wouter";

// ─── Door/Window Configuration Diagram ──────────────────────────────────────

function ConfigDiagram({ productType, handleSide, hingeSide, openingDirection }: { productType: string; handleSide: string; hingeSide: string; openingDirection: string }) {
  const width = 200;
  const height = productType === "door" ? 280 : 180;
  const padding = 20;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[200px] mx-auto border rounded bg-slate-50">
      {/* Frame */}
      <rect x={padding} y={padding} width={width - 2 * padding} height={height - 2 * padding} fill="none" stroke="#334155" strokeWidth="3" />

      {/* Mesh pattern */}
      {Array.from({ length: 8 }).map((_, i) => (
        <line key={`h${i}`} x1={padding + 5} y1={padding + 10 + i * ((height - 2 * padding - 20) / 8)} x2={width - padding - 5} y2={padding + 10 + i * ((height - 2 * padding - 20) / 8)} stroke="#94a3b8" strokeWidth="0.5" />
      ))}
      {Array.from({ length: 6 }).map((_, i) => (
        <line key={`v${i}`} x1={padding + 10 + i * ((width - 2 * padding - 20) / 6)} y1={padding + 5} x2={padding + 10 + i * ((width - 2 * padding - 20) / 6)} y2={height - padding - 5} stroke="#94a3b8" strokeWidth="0.5" />
      ))}

      {/* Handle indicator */}
      {productType === "door" && (
        <circle
          cx={handleSide === "left" ? padding + 15 : width - padding - 15}
          cy={height / 2}
          r={6}
          fill="#f59e0b"
          stroke="#92400e"
          strokeWidth="1.5"
        />
      )}

      {/* Hinge indicators */}
      {productType === "door" && (
        <>
          <rect
            x={hingeSide === "left" ? padding - 4 : width - padding}
            y={padding + 20}
            width={4}
            height={12}
            fill="#3b82f6"
            rx={1}
          />
          <rect
            x={hingeSide === "left" ? padding - 4 : width - padding}
            y={height - padding - 32}
            width={4}
            height={12}
            fill="#3b82f6"
            rx={1}
          />
        </>
      )}

      {/* Opening direction arrow */}
      {openingDirection && (
        <text
          x={width / 2}
          y={height - 8}
          textAnchor="middle"
          fontSize="10"
          fill="#64748b"
        >
          Opens {openingDirection}
        </text>
      )}

      {/* Labels */}
      {handleSide && (
        <text x={handleSide === "left" ? padding + 15 : width - padding - 15} y={height / 2 + 18} textAnchor="middle" fontSize="8" fill="#92400e">Handle</text>
      )}
      {hingeSide && (
        <text x={hingeSide === "left" ? padding + 2 : width - padding - 2} y={padding + 15} textAnchor="middle" fontSize="8" fill="#3b82f6">Hinge</text>
      )}
    </svg>
  );
}

// ─── Add Item Dialog ────────────────────────────────────────────────────────

function AddItemDialog({ quoteId, open, onOpenChange, onSuccess }: { quoteId: number; open: boolean; onOpenChange: (v: boolean) => void; onSuccess: () => void }) {
  const { data: colours = [] } = trpc.securityScreens.colours.list.useQuery();
  const { data: productOptions = [] } = trpc.securityScreens.productOptions.list.useQuery();
  const { data: glassOptions = [] } = trpc.securityScreens.glassInfill.list.useQuery();

  const addItemMutation = trpc.securityScreens.quotes.addItem.useMutation({
    onSuccess: () => { onOpenChange(false); onSuccess(); toast.success("Item added to quote"); resetForm(); },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    brand: "alugard",
    productType: "window",
    widthMm: "",
    heightMm: "",
    quantity: "1",
    colourId: "",
    handleSide: "",
    hingeSide: "",
    openingDirection: "",
    hingePosition: "",
    glassInfillId: "",
    notes: "",
    selectedOptions: [] as { productOptionId: number; quantity: number }[],
  });

  const resetForm = () => setForm({ brand: "alugard", productType: "window", widthMm: "", heightMm: "", quantity: "1", colourId: "", handleSide: "", hingeSide: "", openingDirection: "", hingePosition: "", glassInfillId: "", notes: "", selectedOptions: [] });

  // Live price calculation
  const priceQuery = trpc.securityScreens.calculatePrice.useQuery(
    { brand: form.brand, productType: form.productType, widthMm: parseInt(form.widthMm) || 0, heightMm: parseInt(form.heightMm) || 0 },
    { enabled: !!form.widthMm && !!form.heightMm && parseInt(form.widthMm) > 0 && parseInt(form.heightMm) > 0 }
  );

  const selectedColour = colours.find((c: any) => c.id === parseInt(form.colourId));

  const toggleOption = (optId: number) => {
    const existing = form.selectedOptions.find((o) => o.productOptionId === optId);
    if (existing) {
      setForm({ ...form, selectedOptions: form.selectedOptions.filter((o) => o.productOptionId !== optId) });
    } else {
      setForm({ ...form, selectedOptions: [...form.selectedOptions, { productOptionId: optId, quantity: 1 }] });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Security Screen Item</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left column - Product & Size */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Brand</Label><Select value={form.brand} onValueChange={(v) => setForm({ ...form, brand: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="alugard">Alu-Gard</SelectItem><SelectItem value="invisigard">Invisi-Gard</SelectItem></SelectContent></Select></div>
              <div><Label>Product Type</Label><Select value={form.productType} onValueChange={(v) => setForm({ ...form, productType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="window">Window</SelectItem><SelectItem value="door">Door</SelectItem></SelectContent></Select></div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div><Label>Width (mm)</Label><Input type="number" value={form.widthMm} onChange={(e) => setForm({ ...form, widthMm: e.target.value })} placeholder="e.g. 900" /></div>
              <div><Label>Height (mm)</Label><Input type="number" value={form.heightMm} onChange={(e) => setForm({ ...form, heightMm: e.target.value })} placeholder="e.g. 2100" /></div>
              <div><Label>Qty</Label><Input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
            </div>

            {/* Live price */}
            {priceQuery.data && priceQuery.data.adjustedPrice !== null && (
              <Card className="bg-green-50 border-green-200">
                <CardContent className="p-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-green-800">Unit Price (inc GST):</span>
                    <span className="text-lg font-bold text-green-900">${priceQuery.data.adjustedPrice.toFixed(2)}</span>
                  </div>
                  {priceQuery.data.factor > 1 && <p className="text-xs text-green-700 mt-1">Base: ${priceQuery.data.basePrice?.toFixed(2)} × {priceQuery.data.factor.toFixed(4)} adjustment</p>}
                </CardContent>
              </Card>
            )}
            {priceQuery.data?.warnings?.length ? (
              <Card className="bg-amber-50 border-amber-200">
                <CardContent className="p-3">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-amber-900">Check measurements</p>
                      {priceQuery.data.warnings.map((warning: string, index: number) => (
                        <p key={index} className="text-xs text-amber-800">{warning}</p>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {/* Colour selection */}
            <div>
              <Label>Colour</Label>
              <div className="grid grid-cols-4 gap-2 mt-2 max-h-[120px] overflow-y-auto">
                {colours.map((c: any) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`flex flex-col items-center gap-1 p-2 rounded border transition-all ${form.colourId === String(c.id) ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border hover:border-primary/50"}`}
                    onClick={() => setForm({ ...form, colourId: String(c.id) })}
                  >
                    <div className="w-6 h-6 rounded-full border shadow-sm" style={{ backgroundColor: c.hexCode }} />
                    <span className="text-[10px] text-center leading-tight">{c.name}</span>
                  </button>
                ))}
              </div>
              {selectedColour && parseFloat(selectedColour.surchargePercent || "0") > 0 && (
                <p className="text-xs text-amber-600 mt-1">+{selectedColour.surchargePercent}% colour surcharge applies</p>
              )}
            </div>

            {/* Glass infill */}
            <div>
              <Label>Glass Infill (optional)</Label>
              <Select value={form.glassInfillId} onValueChange={(v) => setForm({ ...form, glassInfillId: v })}>
                <SelectTrigger><SelectValue placeholder="No glass infill" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No glass infill</SelectItem>
                  {glassOptions.map((g: any) => <SelectItem key={g.id} value={String(g.id)}>{g.glassType} — ${parseFloat(g.cost).toFixed(2)}/{g.uom}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes for this item..." rows={2} /></div>
          </div>

          {/* Right column - Configuration & Options */}
          <div className="space-y-4">
            {/* Visual configuration */}
            {form.productType === "door" && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Door Configuration</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Handle Side</Label><Select value={form.handleSide} onValueChange={(v) => setForm({ ...form, handleSide: v, hingeSide: v === "left" ? "right" : "left" })}><SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="left">Left</SelectItem><SelectItem value="right">Right</SelectItem></SelectContent></Select></div>
                    <div><Label className="text-xs">Hinge Side</Label><Select value={form.hingeSide} onValueChange={(v) => setForm({ ...form, hingeSide: v, handleSide: v === "left" ? "right" : "left" })}><SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="left">Left</SelectItem><SelectItem value="right">Right</SelectItem></SelectContent></Select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label className="text-xs">Opening Direction</Label><Select value={form.openingDirection} onValueChange={(v) => setForm({ ...form, openingDirection: v })}><SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="inward">Inward</SelectItem><SelectItem value="outward">Outward</SelectItem></SelectContent></Select></div>
                    <div><Label className="text-xs">Hinge Position</Label><Select value={form.hingePosition} onValueChange={(v) => setForm({ ...form, hingePosition: v })}><SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="standard">Standard</SelectItem><SelectItem value="offset">Offset</SelectItem><SelectItem value="centre">Centre</SelectItem></SelectContent></Select></div>
                  </div>
                  <ConfigDiagram productType={form.productType} handleSide={form.handleSide} hingeSide={form.hingeSide} openingDirection={form.openingDirection} />
                </CardContent>
              </Card>
            )}

            {/* Product options */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Product Options</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {productOptions.length === 0 ? <p className="text-xs text-muted-foreground">No options configured</p>
                  : productOptions.map((opt: any) => {
                    const isSelected = form.selectedOptions.some((o) => o.productOptionId === opt.id);
                    return (
                      <label key={opt.id} className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-all ${isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleOption(opt.id)} className="rounded" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{opt.name}</p>
                          <p className="text-xs text-muted-foreground">{opt.brand ? `${opt.brand} — ` : ""}${parseFloat(opt.sellPrice).toFixed(2)}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{opt.category.replace("_", " ")}</Badge>
                      </label>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Photo upload placeholder */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Photo</CardTitle></CardHeader>
              <CardContent>
                <div className="border-2 border-dashed rounded-lg p-4 text-center text-muted-foreground">
                  <Camera className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">Photo upload coming soon</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!form.widthMm || !form.heightMm || addItemMutation.isPending}
            onClick={() => addItemMutation.mutate({
              quoteId,
              brand: form.brand,
              productType: form.productType,
              widthMm: parseInt(form.widthMm),
              heightMm: parseInt(form.heightMm),
              quantity: parseInt(form.quantity) || 1,
              colourId: form.colourId && form.colourId !== "none" ? parseInt(form.colourId) : undefined,
              colourName: selectedColour?.name,
              handleSide: form.handleSide || undefined,
              hingeSide: form.hingeSide || undefined,
              openingDirection: form.openingDirection || undefined,
              hingePosition: form.hingePosition || undefined,
              glassInfillId: form.glassInfillId && form.glassInfillId !== "none" ? parseInt(form.glassInfillId) : undefined,
              notes: form.notes || undefined,
              selectedOptions: form.selectedOptions.length > 0 ? form.selectedOptions : undefined,
            })}
          >
            {addItemMutation.isPending ? "Adding..." : "Add Item"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Quote Detail / Builder Page ────────────────────────────────────────────

function QuoteDetail({ quoteId }: { quoteId: number }) {
  const utils = trpc.useUtils();
  const { data: quote, isLoading } = trpc.securityScreens.quotes.getById.useQuery({ id: quoteId });
  const { data: costAdditions = [] } = trpc.securityScreens.costAdditions.list.useQuery();
  const removeItemMutation = trpc.securityScreens.quotes.removeItem.useMutation({
    onSuccess: () => { utils.securityScreens.quotes.getById.invalidate({ id: quoteId }); toast.success("Item removed"); },
  });
  const addCostMutation = trpc.securityScreens.quotes.addCostAddition.useMutation({
    onSuccess: () => { utils.securityScreens.quotes.getById.invalidate({ id: quoteId }); toast.success("Cost added"); },
  });
  const removeCostMutation = trpc.securityScreens.quotes.removeCostAddition.useMutation({
    onSuccess: () => { utils.securityScreens.quotes.getById.invalidate({ id: quoteId }); toast.success("Cost removed"); },
  });
  const uploadPhotoMutation = trpc.securityScreens.quotes.uploadPhoto.useMutation({
    onSuccess: () => { utils.securityScreens.quotes.getById.invalidate({ id: quoteId }); toast.success("Photo uploaded"); },
  });

  const handlePhotoUpload = (quoteItemId: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1];
        uploadPhotoMutation.mutate({ quoteItemId, quoteId, base64, filename: file.name });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addCostOpen, setAddCostOpen] = useState(false);

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Loading quote...</div>;
  if (!quote) return <div className="text-center py-8 text-muted-foreground">Quote not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/security-screens"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button></Link>
          <h2 className="text-xl font-bold mt-2">{quote.quoteNumber}</h2>
          <p className="text-muted-foreground">{quote.clientName} — {quote.siteAddress || "No address"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Download className="h-4 w-4 mr-1" /> Export PDF
          </Button>
          <Badge variant={quote.status === "draft" ? "outline" : quote.status === "sent" ? "secondary" : "default"}>{quote.status}</Badge>
        </div>
      </div>

      {/* Quote Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Items ({quote.items?.length || 0})</CardTitle>
          <Button size="sm" onClick={() => setAddItemOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Item</Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Size (W×H)</TableHead>
                <TableHead>Colour</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Base Price</TableHead>
                <TableHead>Options</TableHead>
                <TableHead>Line Total (ex GST)</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!quote.items || quote.items.length === 0) ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No items yet. Click "Add Item" to start building the quote.</TableCell></TableRow>
              ) : quote.items.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono">{item.itemNumber}</TableCell>
                  <TableCell>
                    <div><span className="font-medium capitalize">{item.brand}</span> <Badge variant="outline" className="text-xs">{item.productType}</Badge></div>
                    {item.handleSide && <p className="text-xs text-muted-foreground mt-0.5">Handle: {item.handleSide}, Hinge: {item.hingeSide}, Opens: {item.openingDirection}</p>}
                  </TableCell>
                  <TableCell className="font-mono">{item.widthMm}×{item.heightMm}</TableCell>
                  <TableCell>
                    {item.colourName ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{item.colourName}</span>
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell className="font-mono">${parseFloat(item.adjustedPrice || "0").toFixed(2)}</TableCell>
                  <TableCell className="font-mono">${parseFloat(item.optionsTotal || "0").toFixed(2)}</TableCell>
                  <TableCell className="font-mono font-medium">${parseFloat(item.lineTotalExGst || "0").toFixed(2)}</TableCell>
                  <TableCell className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handlePhotoUpload(item.id)} title="Upload photo">
                      {item.photoUrl ? <img src={item.photoUrl} className="h-6 w-6 rounded object-cover" /> : <Camera className="h-4 w-4 text-muted-foreground" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => removeItemMutation.mutate({ itemId: item.id, quoteId })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cost Additions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Additional Costs</CardTitle>
          <Dialog open={addCostOpen} onOpenChange={setAddCostOpen}>
            <Button size="sm" onClick={() => setAddCostOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Cost</Button>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Cost to Quote</DialogTitle></DialogHeader>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {costAdditions.map((cost: any) => (
                  <button key={cost.id} className="w-full flex items-center justify-between p-3 rounded border hover:border-primary/50 hover:bg-primary/5 transition-all" onClick={() => { addCostMutation.mutate({ quoteId, costAdditionId: cost.id, quantity: 1 }); setAddCostOpen(false); }}>
                    <div className="text-left"><p className="font-medium text-sm">{cost.name}</p><p className="text-xs text-muted-foreground">{cost.category.replace("_", " ")}</p></div>
                    <span className="font-mono text-sm">${parseFloat(cost.cost).toFixed(2)}{cost.uom ? `/${cost.uom}` : ""}</span>
                  </button>
                ))}
                {costAdditions.length === 0 && <p className="text-center text-muted-foreground py-4">No cost additions configured. Add them in Admin.</p>}
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {(!quote.costAdditions || quote.costAdditions.length === 0) ? (
            <p className="text-center text-muted-foreground py-4">No additional costs</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Cost</TableHead><TableHead>Qty</TableHead><TableHead>Unit Cost</TableHead><TableHead>Line Total</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
              <TableBody>
                {quote.costAdditions.map((ca: any) => (
                  <TableRow key={ca.id}>
                    <TableCell className="font-medium">{ca.costAdditionId}</TableCell>
                    <TableCell>{ca.quantity}</TableCell>
                    <TableCell className="font-mono">${parseFloat(ca.unitCost || "0").toFixed(2)}</TableCell>
                    <TableCell className="font-mono">${parseFloat(ca.lineTotal || "0").toFixed(2)}</TableCell>
                    <TableCell><Button variant="ghost" size="icon" onClick={() => removeCostMutation.mutate({ id: ca.id, quoteId })}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Totals */}
      <Card className="bg-slate-50">
        <CardContent className="p-4">
          <div className="space-y-2 text-right">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal (ex GST):</span><span className="font-mono font-medium">${parseFloat(quote.subtotalExGst || "0").toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">GST (10%):</span><span className="font-mono">${parseFloat(quote.gstAmount || "0").toFixed(2)}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="font-semibold">Total (inc GST):</span><span className="font-mono font-bold text-lg">${parseFloat(quote.totalIncGst || "0").toFixed(2)}</span></div>
          </div>
        </CardContent>
      </Card>

      <AddItemDialog quoteId={quoteId} open={addItemOpen} onOpenChange={setAddItemOpen} onSuccess={() => utils.securityScreens.quotes.getById.invalidate({ id: quoteId })} />
    </div>
  );
}

// ─── Quote List Page ────────────────────────────────────────────────────────

function QuoteList() {
  const utils = trpc.useUtils();
  const { data: quotes = [], isLoading } = trpc.securityScreens.quotes.list.useQuery();
  const [, setLocation] = useLocation();
  const createMutation = trpc.securityScreens.quotes.create.useMutation({
    onSuccess: (data) => { setLocation(`/security-screens/quote/${data.id}`); toast.success(`Quote ${data.quoteNumber} created`); },
  });
  const createFromLeadMutation = trpc.securityScreens.quotes.createFromLead.useMutation({
    onSuccess: (data) => { setLocation(`/security-screens/quote/${data.id}`); toast.success(`Quote ${data.quoteNumber} created from lead`); },
  });
  const cloneMutation = trpc.securityScreens.quotes.clone.useMutation({
    onSuccess: (data) => {
      utils.securityScreens.quotes.list.invalidate();
      setLocation(`/security-screens/quote/${data.id}`);
      toast.success(`Quote ${data.quoteNumber} cloned`);
    },
    onError: (e) => toast.error(e.message),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [leadSearchOpen, setLeadSearchOpen] = useState(false);
  const [leadQuery, setLeadQuery] = useState("");
  const { data: leadResults = [] } = trpc.securityScreens.leads.search.useQuery({ query: leadQuery }, { enabled: leadQuery.length >= 2 });
  const [form, setForm] = useState({ clientName: "", clientEmail: "", clientPhone: "", siteAddress: "" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Security Screen Quotes</h1>
          <p className="text-muted-foreground">Create and manage security screen quotations</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={leadSearchOpen} onOpenChange={setLeadSearchOpen}>
            <Button variant="outline" onClick={() => setLeadSearchOpen(true)}><UserPlus className="h-4 w-4 mr-1" /> From Lead</Button>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Quote from CRM Lead</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Search leads by name, email, address..." value={leadQuery} onChange={(e) => setLeadQuery(e.target.value)} />
                </div>
                <div className="max-h-[300px] overflow-y-auto space-y-1">
                  {leadQuery.length < 2 ? <p className="text-center text-muted-foreground py-4 text-sm">Type at least 2 characters to search</p>
                  : leadResults.length === 0 ? <p className="text-center text-muted-foreground py-4 text-sm">No leads found</p>
                  : leadResults.map((lead: any) => (
                    <button key={lead.id} className="w-full flex items-center justify-between p-3 rounded border hover:border-primary/50 hover:bg-primary/5 transition-all text-left" onClick={() => { createFromLeadMutation.mutate({ leadId: lead.id }); setLeadSearchOpen(false); }}>
                      <div>
                        <p className="font-medium text-sm">{[lead.contactFirstName, lead.contactLastName].filter(Boolean).join(" ") || lead.company || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{lead.contactAddress || lead.suburb || "No address"}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{lead.leadNumber}</Badge>
                    </button>
                  ))}
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> New Quote</Button>
          <DialogContent>
            <DialogHeader><DialogTitle>New Security Screen Quote</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Client Name *</Label><Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="e.g. John Smith" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Email</Label><Input value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} /></div>
              </div>
              <div><Label>Site Address</Label><Input value={form.siteAddress} onChange={(e) => setForm({ ...form, siteAddress: e.target.value })} /></div>
              <Button className="w-full" disabled={!form.clientName || createMutation.isPending} onClick={() => createMutation.mutate({ clientName: form.clientName, clientEmail: form.clientEmail || undefined, clientPhone: form.clientPhone || undefined, siteAddress: form.siteAddress || undefined })}>
                {createMutation.isPending ? "Creating..." : "Create Quote"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {isLoading ? <p className="text-center text-muted-foreground py-8">Loading quotes...</p>
      : quotes.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" /><p className="text-muted-foreground">No security screen quotes yet</p><Button className="mt-4" onClick={() => setCreateOpen(true)}>Create First Quote</Button></CardContent></Card>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Quote #</TableHead><TableHead>Client</TableHead><TableHead>Address</TableHead><TableHead>Status</TableHead><TableHead>Total (inc GST)</TableHead><TableHead>Created</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
          <TableBody>
            {quotes.map((q: any) => (
              <TableRow key={q.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(`/security-screens/quote/${q.id}`)}>
                <TableCell className="font-mono font-medium">{q.quoteNumber}</TableCell>
                <TableCell>{q.clientName}</TableCell>
                <TableCell className="text-muted-foreground">{q.siteAddress || "—"}</TableCell>
                <TableCell><Badge variant={q.status === "draft" ? "outline" : q.status === "sent" ? "secondary" : "default"}>{q.status}</Badge></TableCell>
                <TableCell className="font-mono">${parseFloat(q.totalIncGst || "0").toFixed(2)}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(q.createdAt).toLocaleDateString("en-AU")}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={cloneMutation.isPending}
                    onClick={(event) => {
                      event.stopPropagation();
                      cloneMutation.mutate({ id: q.id });
                    }}
                    title="Duplicate quote"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ─── Main Export ────────────────────────────────────────────────────────────

export default function SecurityScreenQuote() {
  const params = useParams();
  const quoteId = params?.id ? parseInt(params.id as string) : null;

  if (quoteId) return <QuoteDetail quoteId={quoteId} />;
  return <QuoteList />;
}
