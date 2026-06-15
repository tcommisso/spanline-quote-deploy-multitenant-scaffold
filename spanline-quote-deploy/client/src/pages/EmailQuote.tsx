/**
 * EmailQuote — Compose and send a compiled quote PDF to a lead (client) via email.
 * Generates the unified PDF, shows a preview, and sends via Resend.
 */

import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { loadCompanyDetails } from "@/lib/proposalStore";
import {
  generateUnifiedQuotePDF,
  type UnifiedQuoteData,
  type DeckSection,
  type EclipseSection,
} from "@/lib/unifiedQuotePdf";

export default function EmailQuote() {
  const { leadId } = useParams<{ leadId: string }>();
  const id = parseInt(leadId || "0");

  const { data: lead } = trpc.crm.leads.get.useQuery({ id }, { enabled: id > 0 });
  const { data: opqQuotes } = trpc.quotes.list.useQuery(undefined);
  const { data: deckQuotes } = trpc.deck.quotes.list.useQuery();
  const { data: eclipseQuotes } = trpc.eclipseRoof.quotes.list.useQuery();

  const company = loadCompanyDetails();
  const sendEmail = trpc.email.sendCompiledQuote.useMutation();

  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [coverMessage, setCoverMessage] = useState("");
  const [sending, setSending] = useState(false);

  const clientName = lead ? [lead.contactFirstName, lead.contactLastName].filter(Boolean).join(" ") || "Client" : "";

  useEffect(() => {
    if (lead) {
      setToEmail(lead.contactEmail || "");
      setSubject(`Your Quote - ${clientName}`);
      setCoverMessage(
        `Hi ${clientName},\n\nPlease find attached your compiled quote for the project we discussed.\n\nIf you have any questions or would like to proceed, please don't hesitate to get in touch.\n\nKind regards,\n${company.companyName}`
      );
    }
  }, [lead, company.companyName, clientName]);

  // Filter quotes for this lead
  const clientOpqQuotes = (opqQuotes || []).filter((q: any) => q.clientId === id);
  const clientDeckQuotes = (deckQuotes || []).filter((q: any) => q.clientId === id);
  const clientEclipseQuotes = (eclipseQuotes || []).filter((q: any) => q.clientId === id);

  function buildUnifiedData(): UnifiedQuoteData | null {
    if (!lead) return null;

    let deck: DeckSection | undefined;
    let eclipse: EclipseSection | undefined;

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
      const q = clientEclipseQuotes[0] as any;
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

    const grandTotalExGst = (deck?.totalExGst || 0) + (eclipse?.totalExGst || 0);
    const grandTotalGst = (deck?.gst || 0) + (eclipse?.gst || 0);
    const grandTotalIncGst = (deck?.totalIncGst || 0) + (eclipse?.totalIncGst || 0);

    return {
      client: {
        name: clientName,
        phone: lead.contactPhone || undefined,
        email: lead.contactEmail || undefined,
        address: lead.contactAddress || undefined,
        company: lead.company || undefined,
      },
      opq: clientOpqQuotes.length > 0 ? {
        quoteNumber: (clientOpqQuotes[0] as any).quoteNumber || "OPQ",
        descriptionOfWork: (clientOpqQuotes[0] as any).descriptionOfWork || undefined,
        components: [],
        adjustments: [],
        totalExGst: 0,
        totalIncGst: 0,
        gst: 0,
      } : undefined,
      deck,
      eclipse,
      sitePlanImage: (clientEclipseQuotes[0] as any)?.sitePlanImage || undefined,
      grandTotalExGst,
      grandTotalIncGst,
      grandTotalGst,
    };
  }

  async function handleSend() {
    if (!toEmail) { toast.error("Please enter a recipient email"); return; }
    if (!lead) { toast.error("Lead not found"); return; }

    const data = buildUnifiedData();
    if (!data) { toast.error("No quote data available"); return; }

    setSending(true);
    try {
      // Generate PDF as base64
      const base64 = await generateUnifiedQuotePDF(data, "base64") as string;

      // Send via server
      const result = await sendEmail.mutateAsync({
        clientId: id,
        clientName,
        to: toEmail,
        subject,
        coverMessage,
        pdfBase64: base64,
        fromName: company.companyName || undefined,
      });

      if (result.success) {
        toast.success(`Quote sent to ${toEmail}`);
      } else {
        toast.error(result.error || "Failed to send email");
      }
    } catch (e: any) {
      toast.error("Error: " + e.message);
    } finally {
      setSending(false);
    }
  }

  if (!lead) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Loading lead...
      </div>
    );
  }

  const hasQuotes = clientOpqQuotes.length > 0 || clientDeckQuotes.length > 0 || clientEclipseQuotes.length > 0;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/crm/leads/${id}/preview`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Email Quote</h1>
          <p className="text-sm text-muted-foreground">Send compiled quote to {clientName}</p>
        </div>
      </div>

      {!hasQuotes ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>No quotes linked to this lead. Create quotes first.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Email Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Email Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="to">Recipient Email</Label>
                <Input
                  id="to"
                  type="email"
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  placeholder="client@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Your Quote"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Cover Message</Label>
                <Textarea
                  id="message"
                  value={coverMessage}
                  onChange={(e) => setCoverMessage(e.target.value)}
                  rows={8}
                  placeholder="Enter a message to include in the email body..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Attached Quotes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {clientOpqQuotes.length > 0 && (
                  <p>• {clientOpqQuotes.length} Outdoor Living quote(s)</p>
                )}
                {clientDeckQuotes.length > 0 && (
                  <p>• {clientDeckQuotes.length} Timber Deck quote(s)</p>
                )}
                {clientEclipseQuotes.length > 0 && (
                  <p>• {clientEclipseQuotes.length} Eclipse Opening Roof quote(s)</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                A compiled PDF with all quote sections will be generated and attached.
              </p>
            </CardContent>
          </Card>

          {/* Send Button */}
          <Button
            onClick={handleSend}
            disabled={sending || !toEmail}
            className="w-full"
            size="lg"
          >
            {sending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating & Sending...</>
            ) : (
              <><Send className="h-4 w-4 mr-2" />Send Compiled Quote</>
            )}
          </Button>
        </>
      )}
    </div>
  );
}
