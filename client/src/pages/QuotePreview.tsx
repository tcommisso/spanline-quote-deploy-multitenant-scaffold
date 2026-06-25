/**
 * QuotePreview — Web preview of a compiled quote for a lead (client).
 * Aggregates quotes linked to a lead
 * and renders an HTML version matching the PDF structure.
 * Includes download PDF and email-to-client actions.
 */

import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Download, Mail, Eye, FileText, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { loadCompanyDetails, loadCustomLogo, loadProposalText } from "@/lib/proposalStore";
import {
  generateUnifiedQuotePDF,
  type UnifiedQuoteData,
  type OPQSection,
  type DeckSection,
  type EclipseSection,
} from "@/lib/unifiedQuotePdf";

export default function QuotePreview() {
  const { leadId } = useParams<{ leadId: string }>();
  const id = parseInt(leadId || "0");

  // Fetch lead (client)
  const { data: lead, isLoading: leadLoading } = trpc.crm.leads.get.useQuery(
    { id },
    { enabled: id > 0 }
  );

  // Fetch all quotes for this lead
  const { data: opqQuotes } = trpc.quotes.list.useQuery(undefined);
  const { data: deckQuotes } = trpc.deck.quotes.list.useQuery();
  const { data: eclipseQuotes } = trpc.eclipseRoof.quotes.list.useQuery();
  const { data: screenQuotes } = trpc.securityScreens.quotes.list.useQuery();
  const { data: blindQuotes } = trpc.blinds.quotes.list.useQuery();

  const [generating, setGenerating] = useState(false);

  // Filter quotes belonging to this lead
  const matchesLead = (q: any) => {
    if (q.clientId === id || q.leadId === id) return true;
    const leadEmail = lead?.contactEmail?.trim().toLowerCase();
    const quoteEmail = q.clientEmail?.trim().toLowerCase();
    if (leadEmail && quoteEmail && leadEmail === quoteEmail) return true;
    const leadPhone = (lead?.contactPhone || "").replace(/\D/g, "");
    const quotePhone = (q.clientPhone || "").replace(/\D/g, "");
    return !!leadPhone && !!quotePhone && leadPhone === quotePhone;
  };

  const clientOpqQuotes = useMemo(() =>
    (opqQuotes || []).filter(matchesLead),
    [opqQuotes, id, lead?.contactEmail, lead?.contactPhone]
  );
  const clientDeckQuotes = useMemo(() =>
    (deckQuotes || []).filter(matchesLead),
    [deckQuotes, id, lead?.contactEmail, lead?.contactPhone]
  );
  const clientEclipseQuotes = useMemo(() =>
    (eclipseQuotes || []).filter(matchesLead),
    [eclipseQuotes, id, lead?.contactEmail, lead?.contactPhone]
  );
  const clientScreenQuotes = useMemo(() =>
    (screenQuotes || []).filter(matchesLead),
    [screenQuotes, id, lead?.contactEmail, lead?.contactPhone]
  );
  const clientBlindQuotes = useMemo(() =>
    (blindQuotes || []).filter(matchesLead),
    [blindQuotes, id, lead?.contactEmail, lead?.contactPhone]
  );

  const company = loadCompanyDetails();
  const proposalText = loadProposalText();
  const logo = loadCustomLogo();
  const dateStr = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  const clientName = lead ? [lead.contactFirstName, lead.contactLastName].filter(Boolean).join(" ") || "Unnamed" : "";

  // Build unified data for PDF generation
  function buildUnifiedData(): UnifiedQuoteData | null {
    if (!lead) return null;

    let opq: OPQSection | undefined;
    let deck: DeckSection | undefined;
    let eclipse: EclipseSection | undefined;

    if (clientOpqQuotes.length > 0) {
      const q = clientOpqQuotes[0] as any;
      opq = {
        quoteNumber: q.quoteNumber || "OPQ",
        descriptionOfWork: q.descriptionOfWork || undefined,
        components: [],
        adjustments: [],
        totalExGst: 0,
        totalIncGst: 0,
        gst: 0,
      };
    }

    if (clientDeckQuotes.length > 0) {
      const q = clientDeckQuotes[0] as any;
      deck = {
        quoteNumber: q.quoteNumber || "DQ",
        dimensions: q.deckWidthM && q.deckProjectionM ? `${q.deckWidthM}m × ${q.deckProjectionM}m` : undefined,
        frameType: q.frameType || undefined,
        deckingProduct: undefined,
        materialCost: parseFloat(q.materialsSubtotal || "0"),
        labourCost: parseFloat(q.adjustedLabour || "0"),
        totalExGst: parseFloat(q.sellPriceExGst || "0"),
        totalIncGst: parseFloat(q.sellPriceIncGst || "0"),
        gst: parseFloat(q.gstAmount || "0"),
      };
    }

    if (clientEclipseQuotes.length > 0) {
      const q = clientEclipseQuotes[0];
      const units = Array.isArray(q.units) ? q.units : [];
      eclipse = {
        quoteNumber: q.quoteNumber || "EQ",
        units: units.map((u: any, i: number) => ({
          name: u.label || `Unit ${i + 1}`,
          sqm: (u.width || 0) * (u.projection || 0),
          sellPrice: 0,
        })),
        additionalCosts: [],
        totalSqm: parseFloat(q.totalSqm || "0"),
        totalExGst: parseFloat(q.totalSellPriceEx || "0"),
        totalIncGst: parseFloat(q.totalRRPInc || "0"),
        gst: parseFloat(q.totalGST || "0"),
      };
    }

    const grandTotalExGst = (opq?.totalExGst || 0) + (deck?.totalExGst || 0) + (eclipse?.totalExGst || 0);
    const grandTotalGst = (opq?.gst || 0) + (deck?.gst || 0) + (eclipse?.gst || 0);
    const grandTotalIncGst = (opq?.totalIncGst || 0) + (deck?.totalIncGst || 0) + (eclipse?.totalIncGst || 0);

    return {
      client: {
        name: clientName,
        phone: lead.contactPhone || undefined,
        email: lead.contactEmail || undefined,
        address: lead.contactAddress || undefined,
        company: lead.company || undefined,
      },
      opq,
      deck,
      eclipse,
      sitePlanImage: clientEclipseQuotes[0]?.sitePlanImage || undefined,
      grandTotalExGst,
      grandTotalIncGst,
      grandTotalGst,
    };
  }

  async function handleDownloadPdf() {
    const data = buildUnifiedData();
    if (!data) { toast.error("No quote data available"); return; }
    setGenerating(true);
    try {
      await generateUnifiedQuotePDF(data, "download");
      toast.success("PDF downloaded");
    } catch (e: any) {
      toast.error("Failed to generate PDF: " + e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handlePreviewPdf() {
    const data = buildUnifiedData();
    if (!data) { toast.error("No quote data available"); return; }
    setGenerating(true);
    try {
      await generateUnifiedQuotePDF(data, "preview");
    } catch (e: any) {
      toast.error("Failed to preview PDF: " + e.message);
    } finally {
      setGenerating(false);
    }
  }

  const fmt = (val: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(val);

  if (leadLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Lead not found.
        <Link href="/proposals"><Button variant="link">Back to Proposals</Button></Link>
      </div>
    );
  }

  const hasQuotes = clientOpqQuotes.length > 0 || clientDeckQuotes.length > 0 || clientEclipseQuotes.length > 0 || clientScreenQuotes.length > 0 || clientBlindQuotes.length > 0;
  const grandTotalExGst =
    clientDeckQuotes.reduce((s: number, q: any) => s + parseFloat(q.sellPriceExGst || "0"), 0) +
    clientEclipseQuotes.reduce((s: number, q: any) => s + parseFloat(q.totalSellPriceEx || "0"), 0) +
    clientScreenQuotes.reduce((s: number, q: any) => s + parseFloat(q.subtotalExGst || "0"), 0) +
    clientBlindQuotes.reduce((s: number, q: any) => s + parseFloat(q.subtotalExGst || "0"), 0);
  const grandTotalGst =
    clientDeckQuotes.reduce((s: number, q: any) => s + parseFloat(q.gstAmount || "0"), 0) +
    clientEclipseQuotes.reduce((s: number, q: any) => s + parseFloat(q.totalGST || "0"), 0) +
    clientScreenQuotes.reduce((s: number, q: any) => s + parseFloat(q.gstAmount || "0"), 0) +
    clientBlindQuotes.reduce((s: number, q: any) => s + parseFloat(q.gstAmount || "0"), 0);
  const grandTotalIncGst = grandTotalExGst + grandTotalGst;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/proposals">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Quote Preview</h1>
            <p className="text-sm text-muted-foreground">{clientName}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePreviewPdf} disabled={!hasQuotes || generating}>
            <Eye className="h-4 w-4 mr-2" />PDF Preview
          </Button>
          <Button onClick={handleDownloadPdf} disabled={!hasQuotes || generating}>
            <Download className="h-4 w-4 mr-2" />Download PDF
          </Button>
          <Link href={`/crm/leads/${id}/email`}>
            <Button variant="secondary" disabled={!hasQuotes}>
              <Mail className="h-4 w-4 mr-2" />Email to Client
            </Button>
          </Link>
        </div>
      </div>

      {/* Company Header */}
      <Card className="border-none shadow-lg bg-gradient-to-r from-slate-900 to-slate-800 text-white">
        <CardContent className="p-6">
          <div className="flex justify-between items-start">
            <div>
              {logo && (
                <img src={logo.dataUrl} alt="Logo" className="h-10 mb-3" />
              )}
              <h2 className="text-xl font-bold">{company.companyName}</h2>
              {company.phone && <p className="text-sm text-slate-300">{company.phone}</p>}
              {company.email && <p className="text-sm text-slate-300">{company.email}</p>}
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-400">Date</p>
              <p className="text-lg font-medium">{dateStr}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Client Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium">{clientName}</p>
              {lead.company && <p className="text-muted-foreground">{lead.company}</p>}
              {lead.contactAddress && <p className="text-muted-foreground">{lead.contactAddress}</p>}
            </div>
            <div>
              {lead.contactPhone && <p>Ph: {lead.contactPhone}</p>}
              {lead.contactEmail && <p>Email: {lead.contactEmail}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scope */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{proposalText.scopeTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{proposalText.scopeBody}</p>
        </CardContent>
      </Card>

      {/* OPQ Quotes */}
      {clientOpqQuotes.length > 0 && (
        <Card>
          <CardHeader className="bg-slate-900 text-white rounded-t-lg">
            <CardTitle className="text-base">Outdoor Living</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {clientOpqQuotes.map((q: any) => (
              <div key={q.id} className="flex justify-between items-center py-2 border-b last:border-0">
                <div>
                  <p className="font-medium text-sm">{q.quoteNumber}</p>
                  {q.descriptionOfWork && <p className="text-xs text-muted-foreground">{q.descriptionOfWork}</p>}
                </div>
                <div className="text-right">
                  <p className="font-medium text-sm">{q.status}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Deck Quotes */}
      {clientDeckQuotes.length > 0 && (
        <Card>
          <CardHeader className="bg-slate-900 text-white rounded-t-lg">
            <CardTitle className="text-base">Timber Deck</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {clientDeckQuotes.map((q: any) => (
              <div key={q.id} className="flex justify-between items-center py-2 border-b last:border-0">
                <div>
                  <p className="font-medium text-sm">{q.quoteNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {(q as any).deckWidthM && (q as any).deckProjectionM ? `${(q as any).deckWidthM}m × ${(q as any).deckProjectionM}m` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{fmt(parseFloat((q as any).sellPriceIncGst || "0"))}</p>
                  <p className="text-xs text-muted-foreground">inc GST</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Eclipse Quotes */}
      {clientEclipseQuotes.length > 0 && (
        <Card>
          <CardHeader className="bg-slate-900 text-white rounded-t-lg">
            <CardTitle className="text-base">Eclipse Opening Roof</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {clientEclipseQuotes.map((q: any) => (
              <div key={q.id} className="flex justify-between items-center py-2 border-b last:border-0">
                <div>
                  <p className="font-medium text-sm">{q.quoteNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {q.totalSqm ? `${q.totalSqm} m²` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{fmt(parseFloat(q.totalRRPInc || "0"))}</p>
                  <p className="text-xs text-muted-foreground">inc GST</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Security Screen Quotes */}
      {clientScreenQuotes.length > 0 && (
        <Card>
          <CardHeader className="bg-slate-900 text-white rounded-t-lg">
            <CardTitle className="text-base">Security Screens</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {clientScreenQuotes.map((q: any) => (
              <div key={q.id} className="flex justify-between items-center py-2 border-b last:border-0">
                <div>
                  <Link href={`/security-screens/quote/${encodeURIComponent(q.quoteNumber || String(q.id))}`}>
                    <p className="font-medium text-sm hover:underline">{q.quoteNumber}</p>
                  </Link>
                  <p className="text-xs text-muted-foreground">{q.siteAddress || q.status}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{fmt(parseFloat(q.totalIncGst || "0"))}</p>
                  <p className="text-xs text-muted-foreground">inc GST</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Blind Quotes */}
      {clientBlindQuotes.length > 0 && (
        <Card>
          <CardHeader className="bg-slate-900 text-white rounded-t-lg">
            <CardTitle className="text-base">Blinds</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {clientBlindQuotes.map((q: any) => (
              <div key={q.id} className="flex justify-between items-center py-2 border-b last:border-0">
                <div>
                  <Link href={`/blinds/quote/${encodeURIComponent(q.quoteNumber || String(q.id))}`}>
                    <p className="font-medium text-sm hover:underline">{q.quoteNumber}</p>
                  </Link>
                  <p className="text-xs text-muted-foreground">{q.siteAddress || q.status}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold">{fmt(parseFloat(q.totalIncGst || "0"))}</p>
                  <p className="text-xs text-muted-foreground">inc GST</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Grand Total */}
      {hasQuotes && (
        <Card className="border-2 border-amber-500">
          <CardContent className="p-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold">Project Total</h3>
                <p className="text-sm text-muted-foreground">
                  Subtotal: {fmt(grandTotalExGst)} | GST: {fmt(grandTotalGst)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-amber-600">{fmt(grandTotalIncGst)}</p>
                <p className="text-xs text-muted-foreground">inc GST</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No quotes */}
      {!hasQuotes && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No quotes linked to this lead yet.</p>
            <p className="text-sm mt-1">Create quotes and select this lead using the Lead Picker.</p>
          </CardContent>
        </Card>
      )}

      {/* Activity Timeline */}
      <LeadTimeline leadId={id} />

      {/* Terms */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{proposalText.warrantyTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{proposalText.warrantyBody}</p>
          {proposalText.footerNote && (
            <p className="text-xs text-muted-foreground mt-4 italic">{proposalText.footerNote}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Lead Activity Timeline Component ───────────────────────────────────────
function LeadTimeline({ leadId }: { leadId: number }) {
  const { data: events, isLoading } = trpc.crm.leads.timeline.useQuery(
    { id: leadId },
    { enabled: leadId > 0 }
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading timeline...</p>
        </CardContent>
      </Card>
    );
  }

  if (!events || events.length === 0) return null;

  const getEventIcon = (type: string) => {
    switch (type) {
      case "quote": return "\uD83D\uDCC4";
      case "activity": return "\uD83D\uDCCB";
      default: return "\u2022";
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case "quote": return "border-blue-400";
      case "activity": return "border-amber-400";
      default: return "border-muted";
    }
  };

  return (
    <Card>
      <CardHeader className="bg-slate-800 text-white rounded-t-lg">
        <CardTitle className="text-base">Activity Timeline</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="space-y-0">
          {events.map((event: any, idx: number) => (
            <div key={`${event.type}-${event.id}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full border-2 ${getEventColor(event.type)} flex items-center justify-center text-sm bg-background`}>
                  {getEventIcon(event.type)}
                </div>
                {idx < events.length - 1 && <div className="w-px flex-1 bg-border min-h-[24px]" />}
              </div>
              <div className="pb-4 flex-1">
                <p className="text-sm font-medium">
                  {event.type === "quote"
                    ? `${event.quoteType === "structure" ? "Structure" : event.quoteType === "deck" ? "Deck" : "Eclipse"} Quote: ${event.quoteNumber}`
                    : event.activityType === "email_sent"
                      ? `Email Sent: ${event.emailType || ""}`
                      : event.description || event.activityType
                  }
                </p>
                {event.type === "quote" && (
                  <p className="text-xs text-muted-foreground">Status: {event.status}</p>
                )}
                {event.date && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(event.date).toLocaleDateString()} {new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
