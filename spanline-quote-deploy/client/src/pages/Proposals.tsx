/**
 * Proposals — Central hub for managing client proposals.
 * Allows viewing, generating, previewing, downloading, and emailing
 * combined proposals (Structure + Deck + Eclipse) per lead (client).
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Eye, Download, Mail, MoreVertical, FileText, Users } from "lucide-react";
import { toast } from "sonner";
import {
  generateUnifiedQuotePDF,
  type UnifiedQuoteData,
  type OPQSection,
  type DeckSection,
  type EclipseSection,
} from "@/lib/unifiedQuotePdf";

export default function Proposals() {
  const [search, setSearch] = useState("");
  const [generating, setGenerating] = useState<number | null>(null);

  // Fetch all CRM leads (clients) and quotes
  const { data: leadsData } = trpc.crm.leads.list.useQuery({});
  const { data: opqQuotes } = trpc.quotes.list.useQuery(undefined);
  const { data: deckQuotes } = trpc.deck.quotes.list.useQuery();
  const { data: eclipseQuotes } = trpc.eclipseRoof.quotes.list.useQuery();

  // Build lead proposal summaries
  const proposalClients = useMemo(() => {
    const leads = leadsData?.leads;
    if (!leads) return [];
    return leads
      .map((lead: any) => {
        const opq = (opqQuotes || []).filter((q: any) => q.clientId === lead.id);
        const deck = (deckQuotes || []).filter((q: any) => q.clientId === lead.id);
        const eclipse = (eclipseQuotes || []).filter((q: any) => q.clientId === lead.id);
        const totalQuotes = opq.length + deck.length + eclipse.length;
        if (totalQuotes === 0) return null;

        const totalValue =
          deck.reduce((s: number, q: any) => s + parseFloat(q.sellPriceIncGst || "0"), 0) +
          eclipse.reduce((s: number, q: any) => s + parseFloat(q.totalRRPInc || "0"), 0);

        const name = [lead.contactFirstName, lead.contactLastName].filter(Boolean).join(" ") || "Unnamed";

        return {
          id: lead.id,
          name,
          phone: lead.contactPhone,
          email: lead.contactEmail,
          address: lead.contactAddress,
          company: lead.company,
          opqCount: opq.length,
          deckCount: deck.length,
          eclipseCount: eclipse.length,
          totalQuotes,
          totalValue,
          opqQuotes: opq,
          deckQuotes: deck,
          eclipseQuotes: eclipse,
        };
      })
      .filter(Boolean)
      .filter((c: any) =>
        !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.company || "").toLowerCase().includes(search.toLowerCase())
      );
  }, [leadsData, opqQuotes, deckQuotes, eclipseQuotes, search]);

  const fmt = (val: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(val);

  function buildUnifiedData(client: any): UnifiedQuoteData | null {
    let opq: OPQSection | undefined;
    let deck: DeckSection | undefined;
    let eclipse: EclipseSection | undefined;

    if (client.opqQuotes.length > 0) {
      const q = client.opqQuotes[0];
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

    if (client.deckQuotes.length > 0) {
      const q = client.deckQuotes[0];
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

    if (client.eclipseQuotes.length > 0) {
      const q = client.eclipseQuotes[0];
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
        name: client.name,
        phone: client.phone || undefined,
        email: client.email || undefined,
        address: client.address || undefined,
        company: client.company || undefined,
      },
      opq,
      deck,
      eclipse,
      sitePlanImage: client.eclipseQuotes[0]?.sitePlanImage || undefined,
      grandTotalExGst,
      grandTotalIncGst,
      grandTotalGst,
    };
  }

  async function handlePreview(client: any) {
    const data = buildUnifiedData(client);
    if (!data) { toast.error("No quote data"); return; }
    setGenerating(client.id);
    try {
      await generateUnifiedQuotePDF(data, "preview");
    } catch (e: any) {
      toast.error("Failed: " + e.message);
    } finally {
      setGenerating(null);
    }
  }

  async function handleDownload(client: any) {
    const data = buildUnifiedData(client);
    if (!data) { toast.error("No quote data"); return; }
    setGenerating(client.id);
    try {
      await generateUnifiedQuotePDF(data, "download");
      toast.success("PDF downloaded");
    } catch (e: any) {
      toast.error("Failed: " + e.message);
    } finally {
      setGenerating(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Proposals</h1>
          <p className="text-sm text-muted-foreground">
            Generate, preview, download, and email combined client proposals
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Client Proposal Cards */}
      {proposalClients.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No proposals available</p>
            <p className="text-sm mt-1">
              Leads with linked quotes will appear here. Create quotes and assign a lead to get started.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {proposalClients.map((client: any) => (
          <Card key={client.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{client.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      {client.opqCount > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {client.opqCount} Structure
                        </Badge>
                      )}
                      {client.deckCount > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {client.deckCount} Deck
                        </Badge>
                      )}
                      {client.eclipseCount > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {client.eclipseCount} Eclipse
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {client.totalValue > 0 && (
                    <div className="text-right mr-4">
                      <p className="text-sm font-bold">{fmt(client.totalValue)}</p>
                      <p className="text-xs text-muted-foreground">inc GST</p>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePreview(client)}
                    disabled={generating === client.id}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Preview
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => handleDownload(client)}
                    disabled={generating === client.id}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <Link href={`/crm/leads/${client.id}/email`}>
                        <DropdownMenuItem>
                          <Mail className="h-4 w-4 mr-2" />
                          Email to Client
                        </DropdownMenuItem>
                      </Link>
                      <Link href={`/crm/leads/${client.id}/preview`}>
                        <DropdownMenuItem>
                          <FileText className="h-4 w-4 mr-2" />
                          Full Quote View
                        </DropdownMenuItem>
                      </Link>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
