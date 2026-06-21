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
import { AlertTriangle, Copy, Download, Plus, Trash2, Camera, ArrowLeft, FileText, Search, UserPlus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Link, useParams, useLocation } from "wouter";
import { loadCompanyDetails, loadCustomLogo } from "@/lib/proposalStore";
import {
  BLIND_FABRIC_CATEGORIES,
  BLIND_PRODUCT_TYPES,
  blindFabricCategoryLabel,
  blindFabricCategoryNumber,
  blindOptionCategoryLabel,
  blindProductTypeLabel,
} from "@shared/blinds";

const DEFAULT_BLIND_QUOTE_FORM = {
  clientName: "",
  clientEmail: "",
  clientPhone: "",
  siteAddress: "",
};

const BLIND_QUOTE_STATUSES = ["draft", "sent", "accepted", "declined", "expired"] as const;
const BLIND_QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

type BlindQuoteIdentifier = number | string;

function quoteDetailPath(quote: { id?: unknown; quoteNumber?: unknown }) {
  const quoteNumber = String(quote.quoteNumber || "").trim();
  if (quoteNumber) return `/blinds/quote/${encodeURIComponent(quoteNumber)}`;
  return `/blinds/quote/${quote.id}`;
}

function parseQuoteIdentifier(rawId: unknown): BlindQuoteIdentifier | null {
  const raw = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!raw) return null;
  let text = String(raw).trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    // Use the raw route segment if it is not URI encoded cleanly.
  }
  if (!text) return null;
  return /^\d+$/.test(text) ? Number(text) : text;
}

function normalizeQuoteNumber(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function compactQuoteNumber(value: unknown) {
  return normalizeQuoteNumber(value).replace(/[^A-Z0-9]/g, "");
}

function matchesQuoteReference(candidate: any, quoteRef: BlindQuoteIdentifier) {
  if (typeof quoteRef === "number") return Number(candidate?.id) === quoteRef;
  const candidateNumber = normalizeQuoteNumber(candidate?.quoteNumber);
  const routeNumber = normalizeQuoteNumber(quoteRef);
  if (!candidateNumber || !routeNumber) return false;
  if (candidateNumber === routeNumber) return true;

  const compactCandidate = compactQuoteNumber(candidateNumber);
  const compactRoute = compactQuoteNumber(routeNumber);
  if (!compactCandidate || !compactRoute) return false;
  if (compactCandidate === compactRoute) return true;

  return compactRoute.length >= 8 && compactCandidate.startsWith(compactRoute);
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function blindColourValue(colour: any) {
  return String(colour?.name || colour?.key || colour?.value || colour?.id || "");
}

function colourSwatchStyle(colour: any) {
  if (colour?.hexCode && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(colour.hexCode))) {
    return colour.hexCode;
  }
  const label = blindColourValue(colour).toLowerCase();
  const known: Record<string, string> = {
    surfmist: "#f5f2e8",
    monument: "#4b5563",
    woodlandgrey: "#4b5a4d",
    "woodland grey": "#4b5a4d",
    paperbark: "#cdbb93",
    merino: "#d9c7a1",
    "ebony/black matt": "#111827",
    ebony: "#111827",
    black: "#111827",
    white: "#ffffff",
  };
  if (known[label]) return known[label];
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) hash = (hash * 31 + label.charCodeAt(i)) % 360;
  return `hsl(${hash} 55% 55%)`;
}

function blindQuotePrintHtml(quote: any) {
  const company = loadCompanyDetails();
  const logo = loadCustomLogo();
  const items = quote.items || [];
  const costs = quote.costAdditions || [];
  const companyLines = [
    company.companyName,
    company.address,
    company.phone ? `Phone: ${company.phone}` : "",
    company.email ? `Email: ${company.email}` : "",
    company.website ? `Web: ${company.website}` : "",
    company.abn ? `ABN: ${company.abn}` : "",
    company.licenceACT || company.licenceNSW ? `Lic ACT: ${company.licenceACT || "-"} | Lic NSW: ${company.licenceNSW || "-"}` : "",
  ].filter(Boolean);
  const itemRows = items.map((item: any) => `
    <tr>
      <td>${escapeHtml(item.itemNumber)}</td>
      <td>
        <strong>${escapeHtml(blindFabricCategoryLabel(item.brand))} ${escapeHtml(blindProductTypeLabel(item.productType))}</strong>
        ${item.handleSide ? `<div class="muted">Handle ${escapeHtml(item.handleSide)} | Hinge ${escapeHtml(item.hingeSide)} | Opens ${escapeHtml(item.openingDirection)}</div>` : ""}
        ${item.notes ? `<div class="muted">${escapeHtml(item.notes)}</div>` : ""}
      </td>
      <td>${escapeHtml(item.widthMm)} x ${escapeHtml(item.heightMm)}</td>
      <td>
        ${item.colourName ? `<div>Frame: ${escapeHtml(item.colourName)}</div>` : ""}
        ${item.fabricColourName ? `<div class="muted">Fabric: ${escapeHtml(item.fabricColourName)}</div>` : ""}
        ${!item.colourName && !item.fabricColourName ? "-" : ""}
      </td>
      <td>${escapeHtml(item.quantity)}</td>
      <td class="money">${money(item.adjustedPrice)}</td>
      <td class="money">${money(item.optionsTotal)}</td>
      <td class="money"><strong>${money(item.lineTotalExGst)}</strong></td>
    </tr>
  `).join("");
  const costRows = costs.map((cost: any) => `
    <tr>
      <td colspan="4">${escapeHtml(cost.name || `Cost #${cost.costAdditionId}`)}</td>
      <td>${escapeHtml(cost.quantity)}</td>
      <td class="money">${money(cost.unitCost)}</td>
      <td></td>
      <td class="money">${money(cost.lineTotal)}</td>
    </tr>
  `).join("");

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(quote.quoteNumber)} - Blind Quote</title>
      <style>
        @page { size: A4; margin: 16mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; color: #12242b; margin: 0; font-size: 12px; line-height: 1.45; }
        .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0b4f79; padding-bottom: 14px; margin-bottom: 18px; }
        .logo { max-width: 190px; max-height: 80px; object-fit: contain; }
        .company { text-align: right; color: #4f5f66; }
        h1 { margin: 0 0 4px; font-size: 24px; color: #0b4f79; }
        h2 { margin: 20px 0 8px; font-size: 15px; color: #12242b; }
        .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
        .box { border: 1px solid #d8e0e4; border-radius: 8px; padding: 12px; }
        .label { color: #68777d; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 3px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th { background: #eef4f7; color: #12242b; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
        th, td { padding: 8px; border-bottom: 1px solid #dfe6ea; vertical-align: top; }
        .money { text-align: right; white-space: nowrap; }
        .muted { color: #68777d; font-size: 10px; margin-top: 3px; }
        .totals { margin-left: auto; width: 300px; margin-top: 16px; }
        .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
        .totals .total { border-top: 2px solid #0b4f79; font-size: 15px; font-weight: 700; color: #0b4f79; }
        .footer { margin-top: 24px; color: #68777d; font-size: 10px; border-top: 1px solid #dfe6ea; padding-top: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          ${logo ? `<img class="logo" src="${logo.dataUrl}" alt="${escapeHtml(company.companyName)}" />` : `<h1>${escapeHtml(company.companyName)}</h1>`}
          <h1>Blind Quote</h1>
          <div class="muted">Quote ${escapeHtml(quote.quoteNumber)} | Status ${escapeHtml(BLIND_QUOTE_STATUS_LABELS[quote.status] || quote.status)}</div>
        </div>
        <div class="company">${companyLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div>
      </div>

      <div class="meta">
        <div class="box">
          <div class="label">Client</div>
          <strong>${escapeHtml(quote.clientName)}</strong>
          ${quote.clientEmail ? `<div>${escapeHtml(quote.clientEmail)}</div>` : ""}
          ${quote.clientPhone ? `<div>${escapeHtml(quote.clientPhone)}</div>` : ""}
        </div>
        <div class="box">
          <div class="label">Site Address</div>
          <strong>${escapeHtml(quote.siteAddress || "Not supplied")}</strong>
          <div class="muted">Created ${escapeHtml(quote.createdAt ? new Date(quote.createdAt).toLocaleDateString("en-AU") : "")}</div>
        </div>
      </div>

      <h2>Items</h2>
      <table>
        <thead>
          <tr><th>#</th><th>Product</th><th>Size</th><th>Colour</th><th>Qty</th><th class="money">Base ex GST</th><th class="money">Options</th><th class="money">Line ex GST</th></tr>
        </thead>
        <tbody>${itemRows || `<tr><td colspan="8" class="muted">No items added.</td></tr>`}</tbody>
      </table>

      ${costRows ? `<h2>Additional Costs</h2><table><tbody>${costRows}</tbody></table>` : ""}

      <div class="totals">
        <div><span>Subtotal ex GST</span><strong>${money(quote.subtotalExGst)}</strong></div>
        <div><span>GST</span><strong>${money(quote.gstAmount)}</strong></div>
        <div class="total"><span>Total inc GST</span><span>${money(quote.totalIncGst)}</span></div>
      </div>

      ${quote.notes ? `<div class="footer"><strong>Notes:</strong><br />${escapeHtml(quote.notes)}</div>` : ""}
      <div class="footer">This quote is issued by ${escapeHtml(company.companyName)} and is subject to final site measure and written acceptance.</div>
    </body>
  </html>`;
}

function exportBlindsQuotePdf(quote: any) {
  const printWindow = window.open("", "_blank", "width=900,height=1100");
  if (!printWindow) {
    toast.error("Allow pop-ups to export the PDF");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(blindQuotePrintHtml(quote));
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
}

// ─── Vertical Blind/Roller Blind Configuration Diagram ──────────────────────────────────────

function ConfigDiagram({ productType, handleSide, hingeSide, openingDirection }: { productType: string; handleSide: string; hingeSide: string; openingDirection: string }) {
  const width = 200;
  const height = productType === "vertical_blind" ? 280 : 180;
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
      {productType === "vertical_blind" && (
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
      {productType === "vertical_blind" && (
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

function AddItemDialog({ quoteId, open, onOpenChange, onSuccess, item }: { quoteId: number; open: boolean; onOpenChange: (v: boolean) => void; onSuccess: () => void; item?: any | null }) {
  const utils = trpc.useUtils();
  const { data: colours = [] } = trpc.blinds.colours.list.useQuery();
  const { data: productOptions = [] } = trpc.blinds.productOptions.list.useQuery();
  const { data: allFabricOptions = [] } = trpc.blinds.glassInfill.list.useQuery();
  const { data: allFabricColours = [] } = trpc.blinds.fabricColours.list.useQuery();
  const isEditing = Boolean(item?.id);

  const addItemMutation = trpc.blinds.quotes.addItem.useMutation({
    onSuccess: () => { onOpenChange(false); onSuccess(); toast.success("Item added to quote"); resetForm(); },
    onError: (e) => toast.error(e.message),
  });
  const updateItemMutation = trpc.blinds.quotes.updateItem.useMutation({
    onSuccess: () => { onOpenChange(false); onSuccess(); toast.success("Item updated"); },
    onError: (e) => toast.error(e.message),
  });
  const uploadPhotoMutation = trpc.blinds.quotes.uploadPhoto.useMutation({
    onSuccess: (data) => {
      setPhotoPreviewUrl(data.url);
      utils.blinds.quotes.getById.invalidate({ id: quoteId });
      onSuccess();
      toast.success("Photo uploaded");
    },
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    brand: "category1",
    productType: "zipguideawnings",
    widthMm: "",
    heightMm: "",
    quantity: "1",
    colourId: "",
    handleSide: "",
    hingeSide: "",
    openingDirection: "",
    hingePosition: "",
    glassInfillId: "",
    fabricColourId: "none",
    fabricColourName: "",
    notes: "",
    selectedOptions: [] as { productOptionId: number; quantity: number }[],
  });
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  const resetForm = () => setForm({ brand: "category1", productType: "zipguideawnings", widthMm: "", heightMm: "", quantity: "1", colourId: "", handleSide: "", hingeSide: "", openingDirection: "", hingePosition: "", glassInfillId: "", fabricColourId: "none", fabricColourName: "", notes: "", selectedOptions: [] });

  useEffect(() => {
    if (!open) return;
    if (!item) {
      resetForm();
      setPhotoPreviewUrl(null);
      return;
    }
    setPhotoPreviewUrl(item.photoUrl || null);
    setForm({
      brand: item.brand || "category1",
      productType: item.productType || "zipguideawnings",
      widthMm: item.widthMm ? String(item.widthMm) : "",
      heightMm: item.heightMm ? String(item.heightMm) : "",
      quantity: item.quantity ? String(item.quantity) : "1",
      colourId: item.colourName || (item.colourId ? String(item.colourId) : ""),
      handleSide: item.handleSide || "",
      hingeSide: item.hingeSide || "",
      openingDirection: item.openingDirection || "",
      hingePosition: item.hingePosition || "",
      glassInfillId: item.glassInfillId ? String(item.glassInfillId) : "",
      fabricColourId: item.fabricColourId ? String(item.fabricColourId) : (item.fabricColourName ? "custom" : "none"),
      fabricColourName: item.fabricColourName || "",
      notes: item.notes || "",
      selectedOptions: (item.options || [])
        .filter((option: any) => option.productOptionId)
        .map((option: any) => ({
          productOptionId: Number(option.productOptionId),
          quantity: Number(option.quantity || 1),
        })),
    });
  }, [open, item]);

  // Live price calculation
  const priceQuery = trpc.blinds.calculatePrice.useQuery(
    { brand: form.brand, productType: form.productType, widthMm: parseInt(form.widthMm) || 0, heightMm: parseInt(form.heightMm) || 0, quoteId },
    { enabled: !!form.widthMm && !!form.heightMm && parseInt(form.widthMm) > 0 && parseInt(form.heightMm) > 0 }
  );

  const selectedColour = colours.find((c: any) => blindColourValue(c) === form.colourId || String(c.id) === form.colourId);
  const selectedFabricCategoryNumber = blindFabricCategoryNumber(form.brand);
  const fabricOptions = allFabricOptions.filter((fabric: any) => {
    const rowCategory = String(fabric.categoryNumber || "");
    return !selectedFabricCategoryNumber || !rowCategory || rowCategory === selectedFabricCategoryNumber;
  });
  const selectedFabricRangeId = form.glassInfillId && form.glassInfillId !== "none" ? Number(form.glassInfillId) : null;
  const selectedFabricColour = allFabricColours.find((colour: any) => String(colour.id) === form.fabricColourId);
  const fabricColourOptions = allFabricColours.filter((colour: any) => {
    const rowCategory = String(colour.categoryNumber || "");
    const rowRangeId = Number(colour.fabricRangeId || 0);
    const categoryMatches = !selectedFabricCategoryNumber || !rowCategory || rowCategory === selectedFabricCategoryNumber;
    const rangeMatches = !selectedFabricRangeId || !rowRangeId || rowRangeId === selectedFabricRangeId;
    return categoryMatches && rangeMatches;
  });
  const visibleFabricColours = selectedFabricColour && !fabricColourOptions.some((colour: any) => colour.id === selectedFabricColour.id)
    ? [...fabricColourOptions, selectedFabricColour]
    : fabricColourOptions;

  const handleDialogPhotoUpload = (file: File | undefined) => {
    if (!file) return;
    if (!isEditing || !item?.id) {
      toast.error("Save the item before adding a photo");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result || "").split(",")[1];
      if (!base64) {
        toast.error("Could not read the image");
        return;
      }
      uploadPhotoMutation.mutate({ quoteItemId: Number(item.id), quoteId, base64, filename: file.name });
    };
    reader.onerror = () => toast.error("Could not read the image");
    reader.readAsDataURL(file);
  };

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
      <DialogContent className="w-[96vw] max-w-6xl md:min-w-[720px] max-h-[92vh] overflow-auto resize">
        <DialogHeader><DialogTitle>{isEditing ? "Edit Blind Item" : "Add Blind Item"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left column - Product & Size */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Fabric Category</Label><Select value={form.brand} onValueChange={(v) => setForm({ ...form, brand: v, glassInfillId: "", fabricColourId: "none", fabricColourName: "" })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BLIND_FABRIC_CATEGORIES.map((category) => <SelectItem key={category.value} value={category.value}>{category.label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Blind Type</Label><Select value={form.productType} onValueChange={(v) => setForm({ ...form, productType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{BLIND_PRODUCT_TYPES.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select></div>
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
                    <span className="text-sm text-green-800">Base price (ex GST):</span>
                    <span className="text-lg font-bold text-green-900">${priceQuery.data.adjustedPrice.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-green-700 mt-1">
                    Matrix ex GST ${priceQuery.data.basePrice?.toFixed(2)} × {priceQuery.data.factor.toFixed(4)} adjustment × {((priceQuery.data.markupPercent || 0) / 100 + 1).toFixed(4)} markup
                  </p>
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
                {colours.map((c: any) => {
                  const colourValue = blindColourValue(c);
                  return (
                  <button
                    key={`${c.id}-${colourValue}`}
                    type="button"
                    className={`flex flex-col items-center gap-1 p-2 rounded border transition-all ${form.colourId === colourValue ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border hover:border-primary/50"}`}
                    onClick={() => setForm({ ...form, colourId: colourValue })}
                  >
                    <div className="w-6 h-6 rounded-full border shadow-sm" style={{ backgroundColor: colourSwatchStyle(c) }} />
                    <span className="text-[10px] text-center leading-tight">{colourValue}</span>
                  </button>
                  );
                })}
              </div>
              {selectedColour && parseFloat(selectedColour.surchargePercent || "0") > 0 && (
                <p className="text-xs text-amber-600 mt-1">+{selectedColour.surchargePercent}% colour surcharge applies</p>
              )}
            </div>

            {/* Fabric infill */}
            <div>
              <Label>Fabric / Material (optional)</Label>
              <Select value={form.glassInfillId} onValueChange={(v) => setForm({ ...form, glassInfillId: v, fabricColourId: "none", fabricColourName: "" })}>
                <SelectTrigger><SelectValue placeholder="No fabric infill" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No fabric infill</SelectItem>
                  {fabricOptions.map((g: any) => <SelectItem key={g.id} value={String(g.id)}>{g.glassType}{g.fabricBrand ? ` — ${g.fabricBrand}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Fabric Colour (optional)</Label>
              <Select
                value={form.fabricColourId}
                onValueChange={(v) => {
                  const nextColour = allFabricColours.find((colour: any) => String(colour.id) === v);
                  setForm({
                    ...form,
                    fabricColourId: v,
                    fabricColourName: v === "custom" ? form.fabricColourName : nextColour?.name || "",
                  });
                }}
              >
                <SelectTrigger><SelectValue placeholder="No fabric colour" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No fabric colour</SelectItem>
                  {visibleFabricColours.map((colour: any) => <SelectItem key={colour.id} value={String(colour.id)}>{colour.name}{colour.fabricRangeName ? ` — ${colour.fabricRangeName}` : ""}</SelectItem>)}
                  <SelectItem value="custom">Custom fabric colour</SelectItem>
                </SelectContent>
              </Select>
              {form.fabricColourId === "custom" ? (
                <Input
                  className="mt-2"
                  value={form.fabricColourName}
                  onChange={(event) => setForm({ ...form, fabricColourName: event.target.value })}
                  placeholder="Enter fabric colour"
                />
              ) : selectedFabricColour ? (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="h-4 w-4 rounded border" style={{ backgroundColor: selectedFabricColour.hexCode || "#f8fafc" }} />
                  <span>{selectedFabricColour.fabricRangeName || "Fabric colour option"}</span>
                </div>
              ) : null}
            </div>

            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Additional notes for this item..." rows={2} /></div>
          </div>

          {/* Right column - Configuration & Options */}
          <div className="space-y-4">
            {/* Visual configuration */}
            {form.productType === "vertical_blind" && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Vertical Blind Configuration</CardTitle></CardHeader>
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
                          <p className="text-xs text-muted-foreground">{opt.brand ? `${opt.brand} — ` : ""}${parseFloat(opt.sellPrice).toFixed(2)}{opt.priceUnit ? `/${opt.priceUnit}` : ""}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{blindOptionCategoryLabel(opt.category)}</Badge>
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
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    handleDialogPhotoUpload(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
                <div className="space-y-3">
                  {photoPreviewUrl ? (
                    <div className="overflow-hidden rounded-lg border bg-muted">
                      <img src={photoPreviewUrl} alt="Blind quote item" className="h-40 w-full object-cover" />
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="w-full rounded-lg border-2 border-dashed p-4 text-center text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:hover:border-border disabled:hover:text-muted-foreground"
                      disabled={!isEditing}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      <Camera className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <span className="text-xs">{isEditing ? "Upload item photo" : "Save item before adding a photo"}</span>
                    </button>
                  )}
                  {isEditing ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={uploadPhotoMutation.isPending}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      {uploadPhotoMutation.isPending ? "Uploading..." : photoPreviewUrl ? "Change Photo" : "Upload Photo"}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!form.widthMm || !form.heightMm || addItemMutation.isPending || updateItemMutation.isPending}
            onClick={() => {
              const payload = {
              quoteId,
              brand: form.brand,
              productType: form.productType,
              widthMm: parseInt(form.widthMm),
              heightMm: parseInt(form.heightMm),
              quantity: parseInt(form.quantity) || 1,
              colourId: undefined,
              colourName: selectedColour ? blindColourValue(selectedColour) : form.colourId || undefined,
              handleSide: form.handleSide || undefined,
              hingeSide: form.hingeSide || undefined,
              openingDirection: form.openingDirection || undefined,
              hingePosition: form.hingePosition || undefined,
              glassInfillId: form.glassInfillId && form.glassInfillId !== "none" ? parseInt(form.glassInfillId) : undefined,
              fabricColourId: selectedFabricColour ? Number(selectedFabricColour.id) : (/^\d+$/.test(form.fabricColourId) ? Number(form.fabricColourId) : undefined),
              fabricColourName: form.fabricColourId === "custom" ? (form.fabricColourName || undefined) : (selectedFabricColour?.name || form.fabricColourName || undefined),
              notes: form.notes || undefined,
              selectedOptions: form.selectedOptions.length > 0 ? form.selectedOptions : undefined,
              };
              if (isEditing) {
                updateItemMutation.mutate({ ...payload, itemId: Number(item.id) });
              } else {
                addItemMutation.mutate(payload);
              }
            }}
          >
            {addItemMutation.isPending || updateItemMutation.isPending ? "Saving..." : isEditing ? "Save Changes" : "Add Item"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Quote Detail / Builder Page ────────────────────────────────────────────

function QuoteDetail({ quoteRef }: { quoteRef: BlindQuoteIdentifier }) {
  const utils = trpc.useUtils();
  const isQuoteNumberRoute = typeof quoteRef === "string";
  const { data: quoteList = [], isLoading: isResolvingQuoteNumber } = trpc.blinds.quotes.list.useQuery(
    undefined,
    { enabled: isQuoteNumberRoute },
  );
  const matchedQuote = isQuoteNumberRoute
    ? quoteList.find((candidate: any) => matchesQuoteReference(candidate, quoteRef))
    : null;
  const resolvedQuoteId = typeof quoteRef === "number"
    ? quoteRef
    : Number(matchedQuote?.id ?? NaN);
  const quoteQueryInput = { id: Number.isFinite(resolvedQuoteId) ? resolvedQuoteId : 0 };
  const { data: quote, isLoading, refetch: refetchQuote } = trpc.blinds.quotes.getById.useQuery(
    quoteQueryInput,
    { enabled: Number.isFinite(resolvedQuoteId) && resolvedQuoteId > 0 },
  );
  const { data: costAdditions = [] } = trpc.blinds.costAdditions.list.useQuery();
  const quoteId = Number(quote?.id ?? resolvedQuoteId);
  const removeItemMutation = trpc.blinds.quotes.removeItem.useMutation({
    onSuccess: () => { utils.blinds.quotes.getById.invalidate(quoteQueryInput); toast.success("Item removed"); },
  });
  const addCostMutation = trpc.blinds.quotes.addCostAddition.useMutation({
    onSuccess: () => { toast.success("Cost added"); },
    onError: (e) => toast.error(e.message || "Could not add cost"),
  });
  const removeCostMutation = trpc.blinds.quotes.removeCostAddition.useMutation({
    onSuccess: () => { utils.blinds.quotes.getById.invalidate(quoteQueryInput); toast.success("Cost removed"); },
    onError: (e) => toast.error(e.message || "Could not remove cost"),
  });
  const updateStatusMutation = trpc.blinds.quotes.updateStatus.useMutation({
    onSuccess: () => {
      utils.blinds.quotes.getById.invalidate(quoteQueryInput);
      toast.success("Quote status updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateCostMutation = trpc.blinds.quotes.updateCostAddition.useMutation({
    onSuccess: () => {
      utils.blinds.quotes.getById.invalidate(quoteQueryInput);
      setEditingCost(null);
      toast.success("Cost updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const uploadPhotoMutation = trpc.blinds.quotes.uploadPhoto.useMutation({
    onSuccess: () => { utils.blinds.quotes.getById.invalidate(quoteQueryInput); toast.success("Photo uploaded"); },
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
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editingCost, setEditingCost] = useState<any | null>(null);
  const [costEditForm, setCostEditForm] = useState({ quantity: "1", unitCost: "0" });

  const canMutateQuote = Number.isFinite(quoteId) && quoteId > 0;

  const refreshQuote = async () => {
    await Promise.all([
      utils.blinds.quotes.getById.invalidate(quoteQueryInput),
      utils.blinds.quotes.list.invalidate(),
    ]);
    await refetchQuote();
  };

  const handleAddCostAddition = async (costAdditionId: number) => {
    if (!canMutateQuote || addCostMutation.isPending) return;
    try {
      await addCostMutation.mutateAsync({ quoteId, costAdditionId, quantity: 1 });
      await refreshQuote();
      setAddCostOpen(false);
    } catch {
      // onError displays the user-facing message.
    }
  };

  useEffect(() => {
    if (!editingCost) return;
    setCostEditForm({
      quantity: String(Number(editingCost.quantity || 1)),
      unitCost: String(Number(editingCost.unitCost || 0)),
    });
  }, [editingCost]);

  if ((isQuoteNumberRoute && isResolvingQuoteNumber) || isLoading) return <div className="text-center py-8 text-muted-foreground">Loading quote...</div>;
  const resolvedQuote = quote ?? (matchedQuote ? { ...matchedQuote, items: [], costAdditions: [] } : null);
  if (!resolvedQuote) return <div className="text-center py-8 text-muted-foreground">Quote not found</div>;
  const quoteCostAdditions = resolvedQuote.costAdditions || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/blinds"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button></Link>
          <h2 className="text-xl font-bold mt-2">{resolvedQuote.quoteNumber}</h2>
          <p className="text-muted-foreground">{resolvedQuote.clientName} — {resolvedQuote.siteAddress || "No address"}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => exportBlindsQuotePdf(resolvedQuote)}>
            <Download className="h-4 w-4 mr-1" /> Export PDF
          </Button>
          <Select
            value={resolvedQuote.status}
            onValueChange={(status) => updateStatusMutation.mutate({ id: quoteId, status: status as any })}
            disabled={updateStatusMutation.isPending}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLIND_QUOTE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>{BLIND_QUOTE_STATUS_LABELS[status]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Quote Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Items ({resolvedQuote.items?.length || 0})</CardTitle>
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
                <TableHead>Base Price (ex GST)</TableHead>
                <TableHead>Options</TableHead>
                <TableHead>Line Total (ex GST)</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!resolvedQuote.items || resolvedQuote.items.length === 0) ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No items yet. Click "Add Item" to start building the quote.</TableCell></TableRow>
              ) : resolvedQuote.items.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono">{item.itemNumber}</TableCell>
                  <TableCell>
                    <div><span className="font-medium">{blindFabricCategoryLabel(item.brand)}</span> <Badge variant="outline" className="text-xs">{blindProductTypeLabel(item.productType)}</Badge></div>
                    {item.handleSide && <p className="text-xs text-muted-foreground mt-0.5">Handle: {item.handleSide}, Hinge: {item.hingeSide}, Opens: {item.openingDirection}</p>}
                  </TableCell>
                  <TableCell className="font-mono">{item.widthMm}×{item.heightMm}</TableCell>
                  <TableCell>
                    {item.colourName || item.fabricColourName ? (
                      <div className="space-y-0.5">
                        {item.colourName ? <p className="text-sm">Frame: {item.colourName}</p> : null}
                        {item.fabricColourName ? <p className="text-xs text-muted-foreground">Fabric: {item.fabricColourName}</p> : null}
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell className="font-mono">${parseFloat(item.adjustedPrice || "0").toFixed(2)}</TableCell>
                  <TableCell className="font-mono">${parseFloat(item.optionsTotal || "0").toFixed(2)}</TableCell>
                  <TableCell className="font-mono font-medium">${parseFloat(item.lineTotalExGst || "0").toFixed(2)}</TableCell>
                  <TableCell className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditingItem(item)} title="Edit item">
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
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
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
              <DialogHeader><DialogTitle>Add Cost to Quote</DialogTitle></DialogHeader>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {costAdditions.map((cost: any) => (
                  <button
                    key={cost.id}
                    type="button"
                    className="w-full flex items-center justify-between gap-3 p-3 rounded border text-left hover:border-primary/50 hover:bg-primary/5 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!canMutateQuote || addCostMutation.isPending}
                    onClick={() => handleAddCostAddition(cost.id)}
                  >
                    <div className="text-left"><p className="font-medium text-sm">{cost.name}</p><p className="text-xs text-muted-foreground">{cost.category.replace("_", " ")}</p></div>
                    <span className="font-mono text-sm whitespace-nowrap">${parseFloat(cost.cost).toFixed(2)}{cost.uom ? `/${cost.uom}` : ""}</span>
                  </button>
                ))}
                {costAdditions.length === 0 && <p className="text-center text-muted-foreground py-4">No cost additions configured. Add them in Admin.</p>}
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {quoteCostAdditions.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No additional costs</p>
          ) : (
            <>
              <div className="md:hidden space-y-2">
                {quoteCostAdditions.map((ca: any) => (
                  <div key={ca.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{ca.name || `Cost #${ca.costAdditionId}`}</p>
                        {ca.category ? <p className="text-xs text-muted-foreground">{ca.category.replace("_", " ")}</p> : null}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingCost(ca)} title="Edit cost">
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={removeCostMutation.isPending}
                          onClick={() => removeCostMutation.mutate({ id: ca.id, quoteId })}
                          title="Remove cost"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Qty</p>
                        <p className="font-mono font-medium">{ca.quantity}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Unit</p>
                        <p className="font-mono font-medium">${parseFloat(ca.unitCost || "0").toFixed(2)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-muted-foreground">Total</p>
                        <p className="font-mono font-semibold">${parseFloat(ca.lineTotal || "0").toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Cost</TableHead><TableHead>Qty</TableHead><TableHead>Unit Cost</TableHead><TableHead>Line Total</TableHead><TableHead className="w-20"></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {quoteCostAdditions.map((ca: any) => (
                      <TableRow key={ca.id}>
                        <TableCell>
                          <div className="font-medium">{ca.name || `Cost #${ca.costAdditionId}`}</div>
                          {ca.category ? <p className="text-xs text-muted-foreground">{ca.category.replace("_", " ")}</p> : null}
                        </TableCell>
                        <TableCell>{ca.quantity}</TableCell>
                        <TableCell className="font-mono">${parseFloat(ca.unitCost || "0").toFixed(2)}</TableCell>
                        <TableCell className="font-mono">${parseFloat(ca.lineTotal || "0").toFixed(2)}</TableCell>
                        <TableCell className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setEditingCost(ca)} title="Edit cost">
                            <Pencil className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="icon" disabled={removeCostMutation.isPending} onClick={() => removeCostMutation.mutate({ id: ca.id, quoteId })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Totals */}
      <Card className="bg-slate-50">
        <CardContent className="p-4">
          <div className="space-y-2 text-right">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal (ex GST):</span><span className="font-mono font-medium">${parseFloat(resolvedQuote.subtotalExGst || "0").toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">GST (10%):</span><span className="font-mono">${parseFloat(resolvedQuote.gstAmount || "0").toFixed(2)}</span></div>
            <div className="flex justify-between border-t pt-2"><span className="font-semibold">Total (inc GST):</span><span className="font-mono font-bold text-lg">${parseFloat(resolvedQuote.totalIncGst || "0").toFixed(2)}</span></div>
          </div>
        </CardContent>
      </Card>

      <AddItemDialog quoteId={quoteId} open={addItemOpen} onOpenChange={setAddItemOpen} onSuccess={() => utils.blinds.quotes.getById.invalidate({ id: quoteId })} />
      <AddItemDialog
        quoteId={quoteId}
        open={Boolean(editingItem)}
        item={editingItem}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setEditingItem(null);
        }}
        onSuccess={() => utils.blinds.quotes.getById.invalidate({ id: quoteId })}
      />
      <Dialog open={Boolean(editingCost)} onOpenChange={(nextOpen) => { if (!nextOpen) setEditingCost(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Additional Cost</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="font-medium">{editingCost?.name || "Additional cost"}</p>
              {editingCost?.category ? <p className="text-sm text-muted-foreground">{editingCost.category.replace("_", " ")}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Quantity</Label>
                <Input type="number" min="0.01" step="0.01" value={costEditForm.quantity} onChange={(event) => setCostEditForm({ ...costEditForm, quantity: event.target.value })} />
              </div>
              <div>
                <Label>Unit Cost</Label>
                <Input type="number" min="0" step="0.01" value={costEditForm.unitCost} onChange={(event) => setCostEditForm({ ...costEditForm, unitCost: event.target.value })} />
              </div>
            </div>
            <div className="rounded border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Line total</span>
                <span className="font-mono font-medium">${((parseFloat(costEditForm.quantity) || 0) * (parseFloat(costEditForm.unitCost) || 0)).toFixed(2)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingCost(null)}>Cancel</Button>
              <Button
                disabled={!editingCost || updateCostMutation.isPending}
                onClick={() => {
                  if (!editingCost) return;
                  updateCostMutation.mutate({
                    id: editingCost.id,
                    quoteId,
                    quantity: parseFloat(costEditForm.quantity) || 1,
                    unitCost: parseFloat(costEditForm.unitCost) || 0,
                  });
                }}
              >
                {updateCostMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Quote List Page ────────────────────────────────────────────────────────

function QuoteList() {
  const utils = trpc.useUtils();
  const { data: quotes = [], isLoading } = trpc.blinds.quotes.list.useQuery();
  const [, setLocation] = useLocation();
  const createMutation = trpc.blinds.quotes.create.useMutation({
    onSuccess: (data) => {
      setForm(DEFAULT_BLIND_QUOTE_FORM);
      setCreateOpen(false);
      setLocation(quoteDetailPath(data));
      toast.success(`Quote ${data.quoteNumber} created`);
    },
    onError: (e) => toast.error(e.message || "Could not create blind quote"),
  });
  const createFromLeadMutation = trpc.blinds.quotes.createFromLead.useMutation({
    onSuccess: (data) => {
      setLeadQuery("");
      setLeadSearchOpen(false);
      setLocation(quoteDetailPath(data));
      toast.success(`Quote ${data.quoteNumber} created from lead`);
      if (data.leadUnarchived) {
        toast.info("Lead was automatically unarchived");
      }
    },
    onError: (e) => toast.error(e.message || "Could not create quote from lead"),
  });
  const cloneMutation = trpc.blinds.quotes.clone.useMutation({
    onSuccess: (data) => {
      utils.blinds.quotes.list.invalidate();
      setLocation(quoteDetailPath(data));
      toast.success(`Quote ${data.quoteNumber} cloned`);
    },
    onError: (e) => toast.error(e.message),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [leadSearchOpen, setLeadSearchOpen] = useState(false);
  const [leadQuery, setLeadQuery] = useState("");
  const { data: leadResults = [] } = trpc.blinds.leads.search.useQuery({ query: leadQuery }, { enabled: leadQuery.length >= 2 });
  const [form, setForm] = useState(DEFAULT_BLIND_QUOTE_FORM);

  const handleCreateOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setForm(DEFAULT_BLIND_QUOTE_FORM);
    setCreateOpen(nextOpen);
  };

  const handleLeadSearchOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setLeadQuery("");
    setLeadSearchOpen(nextOpen);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Blinds Quotes</h1>
          <p className="text-muted-foreground">Create and manage blind quotations</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={leadSearchOpen} onOpenChange={handleLeadSearchOpenChange}>
            <Button variant="outline" onClick={() => handleLeadSearchOpenChange(true)}><UserPlus className="h-4 w-4 mr-1" /> From Lead</Button>
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
                    <button
                      key={lead.id}
                      className="w-full flex items-center justify-between p-3 rounded border hover:border-primary/50 hover:bg-primary/5 transition-all text-left disabled:opacity-60"
                      disabled={createFromLeadMutation.isPending}
                      onClick={() => createFromLeadMutation.mutate({ leadId: lead.id })}
                    >
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
          <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
            <Button onClick={() => handleCreateOpenChange(true)}><Plus className="h-4 w-4 mr-1" /> New Quote</Button>
          <DialogContent>
            <DialogHeader><DialogTitle>New Blind Quote</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Client Name *</Label><Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="e.g. John Smith" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Email</Label><Input value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} /></div>
              </div>
              <div><Label>Site Address</Label><Input value={form.siteAddress} onChange={(e) => setForm({ ...form, siteAddress: e.target.value })} /></div>
              <Button
                type="button"
                className="w-full"
                disabled={!form.clientName.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate({
                  clientName: form.clientName.trim(),
                  clientEmail: form.clientEmail.trim() || undefined,
                  clientPhone: form.clientPhone.trim() || undefined,
                  siteAddress: form.siteAddress.trim() || undefined,
                })}
              >
                {createMutation.isPending ? "Creating..." : "Create Quote"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {isLoading ? <p className="text-center text-muted-foreground py-8">Loading quotes...</p>
      : quotes.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" /><p className="text-muted-foreground">No blind quotes yet</p><Button className="mt-4" onClick={() => handleCreateOpenChange(true)}>Create First Quote</Button></CardContent></Card>
      ) : (
        <Table>
          <TableHeader><TableRow><TableHead>Quote #</TableHead><TableHead>Client</TableHead><TableHead>Address</TableHead><TableHead>Status</TableHead><TableHead>Total (inc GST)</TableHead><TableHead>Created</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
          <TableBody>
            {quotes.map((q: any) => (
              <TableRow key={q.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(quoteDetailPath(q))}>
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

export default function BlindsQuote() {
  const params = useParams();
  const quoteRef = parseQuoteIdentifier(params?.id);

  if (quoteRef) return <QuoteDetail quoteRef={quoteRef} />;
  return <QuoteList />;
}
