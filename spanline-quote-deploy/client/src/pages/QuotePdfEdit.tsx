/**
 * QuotePdfEdit — Full-page preview & edit screen for a quote PDF.
 * Mirrors the PDF layout with all sections editable inline.
 * Supports line item add/remove/reorder, live total recalculation,
 * "Save Draft" to persist edits, and "Finalise & Download PDF" to generate.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Save, Plus, Trash2, GripVertical, Eye } from "lucide-react";
import { toast } from "sonner";
import { generateProposalPDF, type ProposalQuoteData } from "@/lib/pdfProposal";
import { loadCompanyDetails, loadCustomLogo, loadProposalText } from "@/lib/proposalStore";

const tabLabels: Record<string, string> = {
  roof: "Roof", channel: "Channel", beam: "Beam", post: "Post",
  gable: "Gable", cantilever: "Cantilever", carport: "Carport",
  glassroom: "Glassroom", screenroom: "Screenroom",
  lattice: "Lattice", spacemaker: "Spacemaker",
  trades: "Trades", extras: "Extras", windows: "Windows", awnings: "Awnings",
};

interface EditableLineItem {
  id: string; // local key for React
  tabName: string;
  component: string;
  colour: string;
  uom: string;
  qty: number;
  sellRate: number;
  total: number;
}

interface EditableAdjustment {
  id: string;
  name: string;
  amount: number;
}

export default function QuotePdfEdit() {
  const { id: idStr } = useParams<{ id: string }>();
  const quoteId = parseInt(idStr || "0");

  const { data: pdfData, isLoading } = trpc.quotes.getQuotePdfData.useQuery(
    { id: quoteId },
    { enabled: quoteId > 0 }
  );

  const updateMutation = trpc.quotes.update.useMutation({
    onSuccess: () => toast.success("Draft saved"),
    onError: (err) => toast.error(err.message),
  });

  // Editable state
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [descriptionOfWork, setDescriptionOfWork] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<EditableLineItem[]>([]);
  const [adjustments, setAdjustments] = useState<EditableAdjustment[]>([]);
  const [generating, setGenerating] = useState(false);

  // Populate state from server data
  useEffect(() => {
    if (pdfData) {
      setClientName(pdfData.clientName);
      setClientPhone(pdfData.clientPhone);
      setClientEmail(pdfData.clientEmail);
      setSiteAddress(pdfData.siteAddress);
      setSuburb(pdfData.suburb);
      setDescriptionOfWork(pdfData.descriptionOfWork);
      setNotes(pdfData.notes);
      setLineItems(pdfData.lineItems.map((li, i) => ({
        ...li,
        id: `li-${i}-${Date.now()}`,
      })));
      setAdjustments(pdfData.adjustments.map((adj, i) => ({
        ...adj,
        id: `adj-${i}-${Date.now()}`,
      })));
    }
  }, [pdfData]);

  // Live total recalculation
  const totals = useMemo(() => {
    const componentSubtotal = lineItems.reduce((sum, li) => sum + li.qty * li.sellRate, 0);
    const adjustmentTotal = adjustments.reduce((sum, adj) => sum + adj.amount, 0);
    const grandTotalExGst = componentSubtotal + adjustmentTotal;
    const gst = grandTotalExGst * 0.1;
    const grandTotalIncGst = grandTotalExGst + gst;
    return { componentSubtotal, adjustmentTotal, grandTotalExGst, gst, grandTotalIncGst };
  }, [lineItems, adjustments]);

  const fmt = (val: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(val);

  // Line item operations
  const addLineItem = () => {
    setLineItems(prev => [...prev, {
      id: `li-new-${Date.now()}`,
      tabName: "extras",
      component: "",
      colour: "",
      uom: "ea",
      qty: 1,
      sellRate: 0,
      total: 0,
    }]);
  };

  const removeLineItem = (id: string) => {
    setLineItems(prev => prev.filter(li => li.id !== id));
  };

  const updateLineItem = (id: string, field: keyof EditableLineItem, value: any) => {
    setLineItems(prev => prev.map(li => {
      if (li.id !== id) return li;
      const updated = { ...li, [field]: value };
      if (field === "qty" || field === "sellRate") {
        updated.total = updated.qty * updated.sellRate;
      }
      return updated;
    }));
  };

  const moveLineItem = (idx: number, direction: "up" | "down") => {
    setLineItems(prev => {
      const arr = [...prev];
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= arr.length) return arr;
      [arr[idx], arr[targetIdx]] = [arr[targetIdx], arr[idx]];
      return arr;
    });
  };

  // Adjustment operations
  const addAdjustment = () => {
    setAdjustments(prev => [...prev, {
      id: `adj-new-${Date.now()}`,
      name: "",
      amount: 0,
    }]);
  };

  const removeAdjustment = (id: string) => {
    setAdjustments(prev => prev.filter(a => a.id !== id));
  };

  const updateAdjustment = (id: string, field: "name" | "amount", value: any) => {
    setAdjustments(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  // Save Draft
  const handleSaveDraft = useCallback(() => {
    updateMutation.mutate({
      id: quoteId,
      clientName,
      clientPhone,
      clientEmail,
      siteAddress,
      suburb,
      descriptionOfWork,
      notes,
    });
  }, [quoteId, clientName, clientPhone, clientEmail, siteAddress, suburb, descriptionOfWork, notes, updateMutation]);

  // Finalise & Download PDF
  const handleFinaliseDownload = useCallback(async () => {
    if (!pdfData) return;
    setGenerating(true);
    try {
      // Build component summary from line items grouped by tab
      const tabTotals = new Map<string, number>();
      for (const li of lineItems) {
        const label = tabLabels[li.tabName] || li.tabName;
        tabTotals.set(label, (tabTotals.get(label) || 0) + li.qty * li.sellRate);
      }
      const componentSummary = Array.from(tabTotals.entries())
        .filter(([, amount]) => amount > 0)
        .map(([name, amount]) => ({ name, amount }));

      const proposalData: ProposalQuoteData = {
        quoteNumber: pdfData.quoteNumber,
        clientName,
        clientPhone: clientPhone || undefined,
        clientEmail: clientEmail || undefined,
        siteAddress: siteAddress || undefined,
        suburb: suburb || undefined,
        region: pdfData.region || undefined,
        descriptionOfWork: descriptionOfWork || undefined,
        grandTotalExGst: totals.grandTotalExGst,
        grandTotalIncGst: totals.grandTotalIncGst,
        gst: totals.gst,
        componentSummary,
        adjustments: adjustments.filter(a => a.name && a.amount !== 0).map(a => ({ name: a.name, amount: a.amount })),
        progressPayments: pdfData.progressPayments ? (pdfData.progressPayments as Record<string, string>) : undefined,
      };
      await generateProposalPDF(proposalData, "download");
      toast.success("PDF downloaded");
    } catch (err: any) {
      toast.error("Failed to generate PDF: " + (err.message || "Unknown error"));
    } finally {
      setGenerating(false);
    }
  }, [pdfData, lineItems, adjustments, clientName, clientPhone, clientEmail, siteAddress, suburb, descriptionOfWork, totals]);

  // Preview PDF (opens in new tab)
  const handlePreviewPdf = useCallback(async () => {
    if (!pdfData) return;
    setGenerating(true);
    try {
      const tabTotals = new Map<string, number>();
      for (const li of lineItems) {
        const label = tabLabels[li.tabName] || li.tabName;
        tabTotals.set(label, (tabTotals.get(label) || 0) + li.qty * li.sellRate);
      }
      const componentSummary = Array.from(tabTotals.entries())
        .filter(([, amount]) => amount > 0)
        .map(([name, amount]) => ({ name, amount }));

      const proposalData: ProposalQuoteData = {
        quoteNumber: pdfData.quoteNumber,
        clientName,
        clientPhone: clientPhone || undefined,
        clientEmail: clientEmail || undefined,
        siteAddress: siteAddress || undefined,
        suburb: suburb || undefined,
        region: pdfData.region || undefined,
        descriptionOfWork: descriptionOfWork || undefined,
        grandTotalExGst: totals.grandTotalExGst,
        grandTotalIncGst: totals.grandTotalIncGst,
        gst: totals.gst,
        componentSummary,
        adjustments: adjustments.filter(a => a.name && a.amount !== 0).map(a => ({ name: a.name, amount: a.amount })),
        progressPayments: pdfData.progressPayments ? (pdfData.progressPayments as Record<string, string>) : undefined,
      };
      await generateProposalPDF(proposalData, "preview");
    } catch (err: any) {
      toast.error("Failed to preview PDF: " + (err.message || "Unknown error"));
    } finally {
      setGenerating(false);
    }
  }, [pdfData, lineItems, adjustments, clientName, clientPhone, clientEmail, siteAddress, suburb, descriptionOfWork, totals]);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!pdfData) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Quote not found.
        <Link href="/proposals"><Button variant="link">Back to Proposals</Button></Link>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/quotes/${quoteId}`}>
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Quote PDF Editor</h1>
            <p className="text-sm text-muted-foreground">{pdfData.quoteNumber} &middot; <Badge variant="outline">{pdfData.status}</Badge></p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handlePreviewPdf} disabled={generating}>
            <Eye className="h-4 w-4 mr-1.5" />Preview
          </Button>
          <Button variant="outline" size="sm" onClick={handleSaveDraft} disabled={updateMutation.isPending}>
            <Save className="h-4 w-4 mr-1.5" />{updateMutation.isPending ? "Saving..." : "Save Draft"}
          </Button>
          <Button size="sm" onClick={handleFinaliseDownload} disabled={generating}>
            <Download className="h-4 w-4 mr-1.5" />{generating ? "Generating..." : "Finalise & Download"}
          </Button>
        </div>
      </div>

      {/* Client Details Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Client Name</label>
            <Input value={clientName} onChange={e => setClientName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Phone</label>
            <Input value={clientPhone} onChange={e => setClientPhone(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <Input value={clientEmail} onChange={e => setClientEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Suburb</label>
            <Input value={suburb} onChange={e => setSuburb(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Site Address</label>
            <Input value={siteAddress} onChange={e => setSiteAddress(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* Description of Work */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Description of Work</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={descriptionOfWork}
            onChange={e => setDescriptionOfWork(e.target.value)}
            rows={3}
            placeholder="Describe the scope of work..."
          />
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Line Items</CardTitle>
          <Button variant="outline" size="sm" onClick={addLineItem}>
            <Plus className="h-3.5 w-3.5 mr-1" />Add Item
          </Button>
        </CardHeader>
        <CardContent>
          {lineItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No line items. Click "Add Item" to begin.</p>
          ) : (
            <div className="space-y-2">
              {/* Table header */}
              <div className="hidden sm:grid grid-cols-[auto_1fr_100px_60px_60px_90px_90px_32px] gap-2 text-xs font-medium text-muted-foreground px-1">
                <span></span>
                <span>Component</span>
                <span>Category</span>
                <span>UOM</span>
                <span>Qty</span>
                <span>Rate</span>
                <span>Total</span>
                <span></span>
              </div>
              {lineItems.map((li, idx) => (
                <div key={li.id} className="grid grid-cols-1 sm:grid-cols-[auto_1fr_100px_60px_60px_90px_90px_32px] gap-2 items-center border rounded-md p-2 sm:p-1">
                  <div className="hidden sm:flex flex-col gap-0.5">
                    <button
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      onClick={() => moveLineItem(idx, "up")}
                      disabled={idx === 0}
                    >
                      <GripVertical className="h-3 w-3" />
                    </button>
                  </div>
                  <Input
                    value={li.component}
                    onChange={e => updateLineItem(li.id, "component", e.target.value)}
                    placeholder="Component name"
                    className="text-sm h-8"
                  />
                  <Input
                    value={tabLabels[li.tabName] || li.tabName}
                    onChange={e => updateLineItem(li.id, "tabName", e.target.value)}
                    className="text-sm h-8"
                  />
                  <Input
                    value={li.uom}
                    onChange={e => updateLineItem(li.id, "uom", e.target.value)}
                    className="text-sm h-8"
                  />
                  <Input
                    type="number"
                    value={li.qty}
                    onChange={e => updateLineItem(li.id, "qty", parseFloat(e.target.value) || 0)}
                    className="text-sm h-8"
                  />
                  <Input
                    type="number"
                    value={li.sellRate}
                    onChange={e => updateLineItem(li.id, "sellRate", parseFloat(e.target.value) || 0)}
                    className="text-sm h-8"
                  />
                  <span className="text-sm font-medium text-right pr-1">{fmt(li.qty * li.sellRate)}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLineItem(li.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
              <div className="flex justify-end pt-2 border-t">
                <span className="text-sm font-semibold">Component Subtotal: {fmt(totals.componentSubtotal)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Adjustments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Adjustments</CardTitle>
          <Button variant="outline" size="sm" onClick={addAdjustment}>
            <Plus className="h-3.5 w-3.5 mr-1" />Add Adjustment
          </Button>
        </CardHeader>
        <CardContent>
          {adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No adjustments.</p>
          ) : (
            <div className="space-y-2">
              {adjustments.map(adj => (
                <div key={adj.id} className="grid grid-cols-[1fr_120px_32px] gap-2 items-center">
                  <Input
                    value={adj.name}
                    onChange={e => updateAdjustment(adj.id, "name", e.target.value)}
                    placeholder="Adjustment name"
                    className="text-sm h-8"
                  />
                  <Input
                    type="number"
                    value={adj.amount}
                    onChange={e => updateAdjustment(adj.id, "amount", parseFloat(e.target.value) || 0)}
                    className="text-sm h-8"
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeAdjustment(adj.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Totals */}
      <Card className="border-2 border-amber-500">
        <CardContent className="p-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Component Subtotal</span>
              <span>{fmt(totals.componentSubtotal)}</span>
            </div>
            {adjustments.filter(a => a.amount !== 0).map(adj => (
              <div key={adj.id} className="flex justify-between text-sm text-muted-foreground">
                <span>{adj.name || "Unnamed"}</span>
                <span>{fmt(adj.amount)}</span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between text-sm font-medium">
              <span>Total (ex GST)</span>
              <span>{fmt(totals.grandTotalExGst)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>GST (10%)</span>
              <span>{fmt(totals.gst)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-amber-600">
              <span>Total (inc GST)</span>
              <span>{fmt(totals.grandTotalIncGst)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder="Internal notes..."
          />
        </CardContent>
      </Card>
    </div>
  );
}
