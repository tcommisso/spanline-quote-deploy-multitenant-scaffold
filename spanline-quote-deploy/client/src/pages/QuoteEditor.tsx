import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Save, FileDown, Eye, AlertTriangle, User, ClipboardList, Package, StickyNote, DollarSign, MessageSquare, ChevronsUpDown, Menu, Copy } from "lucide-react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavSwipe } from "@/hooks/useSwipeGesture";
import { useLocation } from "wouter";
import { toast } from "sonner";
// ComponentTab removed - components managed via Quote Items tab
import OPQDashboard from "@/components/OPQDashboard";
import SpecSheet from "@/components/SpecSheet";
import QuoteItemsTab from "@/components/QuoteItemsTab";
// SkyluxCalc removed - skylux managed via Quote Items tab
// EclipseCalc removed — Eclipse is now a standalone module at /eclipse-quotes
import { generateProposalPDF, type ProposalQuoteData } from "@/lib/pdfProposal";
// Proposal send removed — use Master Proposal workflow instead
import SignatureStatusBadge from "@/components/SignatureStatusBadge";
import ClientPicker from "@/components/ClientPicker";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { detectRegion } from "@shared/regionDetection";
import QuoteNotesSection from "@/components/QuoteNotesSection";
import LeadSectionNotes from "@/components/LeadSectionNotes";
import CouncilSelect from "@/components/CouncilSelect";
import RegionSelect from "@/components/RegionSelect";
import CommunicationsTab from "@/components/CommunicationsTab";

import ProposalPhotoGallery from "@/components/ProposalPhotoGallery";
import PdfPreviewModal from "@/components/PdfPreviewModal";

const statusOptions = [
  { value: "draft", label: "Draft", class: "bg-muted text-muted-foreground" },
  { value: "sent", label: "Sent", class: "bg-blue-50 text-blue-700" },
  { value: "accepted", label: "Accepted", class: "bg-emerald-50 text-emerald-700" },
  { value: "lost", label: "Lost", class: "bg-red-50 text-red-600" },
];



const tabLabels: Record<string, string> = {
  roof: "Roof", channel: "Channel", beam: "Beam", post: "Post",
  gable: "Gable", cantilever: "Cantilever", carport: "Carport",
  glassroom: "Glassroom", screenroom: "Screenroom",
  lattice: "Lattice", spacemaker: "Spacemaker",
  trades: "Trades", extras: "Extras", windows: "Windows", awnings: "Awnings",
};

/** Derive connection type code from spec sheet fields */
function deriveConnectionCode(quote: any): string | undefined {
  const method = quote.specAttachmentMethod || "";
  if (method === "None" || !method) return undefined;
  if (quote.specFreeStanding === "Yes") return "FSS";
  if (parseInt(quote.specPopupBrackets || "0") > 0) return "POP";
  if (parseInt(quote.specGableBrackets || "0") > 0) return "GBL";
  if (parseInt(quote.specExtendaBrackets || "0") > 0) return "FLY";
  if (quote.specWallFixingBeam || quote.specWallFixingBracket) return "WFX";
  if (parseInt(quote.specFasciaBrackets || "0") > 0) return "BCH";
  return "BCH"; // default for attached structures
}

/** Build a materials list from spec sheet fields for the proposal PDF */
function buildMaterialsList(quote: any): { category: string; product: string; colour?: string }[] {
  const items: { category: string; product: string; colour?: string }[] = [];
  if (quote.specRoofType) items.push({ category: "Roof", product: quote.specRoofType, colour: quote.specRoofTopColour || undefined });
  if (quote.specBeamSize) items.push({ category: "Beams", product: quote.specBeamSize, colour: quote.specBeamColour || undefined });
  if (quote.specPostsType) items.push({ category: "Posts", product: quote.specPostsType, colour: quote.specPostsColour || undefined });
  if (quote.specGutterType) items.push({ category: "Gutter", product: quote.specGutterType, colour: quote.specGutterColour || undefined });
  if (quote.specDownpipeType) items.push({ category: "Downpipe", product: quote.specDownpipeType, colour: quote.specDownpipeColour || undefined });
  if (quote.specWallType) items.push({ category: "Walls", product: quote.specWallType, colour: quote.specWallColour || undefined });
  if (quote.specAttachmentMethod && quote.specAttachmentMethod !== "None") {
    items.push({ category: "Attachment", product: quote.specAttachmentMethod });
  }
  if (quote.specFasciaBrackets && quote.specFasciaBrackets !== "None") {
    items.push({ category: "Fascia Brackets", product: quote.specFasciaBrackets });
  }
  if (quote.specExtendaBrackets && quote.specExtendaBrackets !== "None") {
    items.push({ category: "Extenda Brackets", product: quote.specExtendaBrackets });
  }
  if (quote.specGableBrackets && quote.specGableBrackets !== "None") {
    items.push({ category: "Gable Brackets", product: quote.specGableBrackets });
  }
  return items;
}

export default function QuoteEditor({ id }: { id: number }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: quote, isLoading } = trpc.quotes.get.useQuery({ id });
  const { data: components } = trpc.components.getByQuote.useQuery({ quoteId: id });

  const updateMutation = trpc.quotes.update.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const calculateTravelMutation = trpc.quotes.calculateTravel.useMutation({
    onSuccess: (data) => {
      toast.success(`Travel: ${data.distanceKm}km from ${data.branchName} - Band ${data.bandKey} = $${data.allowance}`);
      utils.quotes.get.invalidate({ id });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const [showRecalcConfirm, setShowRecalcConfirm] = useState(false);
  const [pendingAddress, setPendingAddress] = useState<string | null>(null);


  const marginCheckMutation = trpc.assistant.checkMargin.useMutation();
  const duplicateMutation = trpc.quotes.duplicate.useMutation({
    onSuccess: (data) => {
      toast.success(`Quote duplicated as ${data.quoteNumber}`);
      setLocation(`/quotes/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });
  const { data: branchesList } = trpc.branches.list.useQuery();
  const { data: skyluxEntries } = trpc.skylux.getByQuote.useQuery({ quoteId: id });
  // Legacy eclipse entries still queried for backward-compatible OPQ/proposal totals
  const { data: eclipseEntries } = trpc.eclipse.getByQuote.useQuery({ quoteId: id });
  const { data: financialBreakdown } = trpc.quotes.getFinancialBreakdown.useQuery({ id });

  const [activeSection, setActiveSection] = useState("details");
  const [openSections, setOpenSections] = useState<string[]>(["details"]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Swipe gesture: swipe right from left edge to open mobile nav
  useNavSwipe(mobileNavOpen, setMobileNavOpen);

  // Local form state
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [region, setRegion] = useState("Canberra");
  const [localCouncil, setLocalCouncil] = useState("");
  const [status, setStatus] = useState("draft");
  const [validUntil, setValidUntil] = useState("");
  const [outcomeReason, setOutcomeReason] = useState("");
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const { data: winLossConfig } = trpc.globalSettings.get.useQuery({ key: "winLossReasons" }, { staleTime: 300_000 });
  const wonReasonOptions = (winLossConfig as any)?.won || ["Best price", "Product quality", "Design/style", "Relationship/trust", "Timing", "Other"];
  const lostReasonOptions = (winLossConfig as any)?.lost || ["Too expensive", "Went with competitor", "Project cancelled", "Design not suitable", "Timing/delays", "Changed mind", "Other"];
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const [notes, setNotes] = useState("");

  // Adjustments are now managed in Job Financials tab (OPQDashboard)

  const [proposalGenerating, setProposalGenerating] = useState(false);
  const [connectionCodeOverride, setConnectionCodeOverride] = useState<string>("auto");
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState<Blob | null>(null);
  const [pdfPreviewFilename, setPdfPreviewFilename] = useState("");

  const handleGenerateProposal = useCallback(async (mode: "download" | "preview" | "base64" = "download"): Promise<string | { pdfBase64: string; totalPages: number } | { blob: Blob; filename: string } | undefined> => {
    if (!quote || !components) return;
    setProposalGenerating(true);
    try {
      // Compute totals (mirrors OPQ Dashboard logic)
      const compTotals = (components || []).map(comp => {
        const items = (comp.lineItems as any[]) || [];
        const sell = items.reduce((s: number, i: any) => s + (i.qty || 0) * (i.sellRate || 0), 0);
        return { tabName: comp.tabName, included: comp.included, sell };
      });
      const skyluxSell = (skyluxEntries || []).filter(s => s.included).reduce((sum, s) => sum + parseFloat(s.sellPrice || "0"), 0);
      const eclipseSell = (eclipseEntries || []).filter(e => e.included).reduce((sum, e) => sum + parseFloat(e.totalSell || "0"), 0);
      const componentsSell = compTotals.filter(c => c.included).reduce((s, c) => s + c.sell, 0);
      const subtotalSell = componentsSell + skyluxSell + eclipseSell;

      const delivery = quote.includeDelivery ? parseFloat(quote.deliveryAmount || "0") : 0;
      const travel = quote.includeTravelAllowance ? parseFloat(quote.travelAllowance || "0") : 0;
      const smallJob = quote.includeSmallJobSurcharge ? parseFloat(quote.smallJobSurcharge || "0") : 0;
      const constMgmt = quote.includeConstructionMgmt ? parseFloat(quote.constructionMgmtAmount || "0") : 0;
      const complexity = parseFloat(quote.complexityLoading || "0") / 100;
      const discount = parseFloat(quote.discountPercent || "0") / 100;
      const council = parseFloat(quote.councilFees || "0");
      const warranty = parseFloat(quote.homeWarranty || "0");

      const adjustedSell = subtotalSell + delivery + travel + smallJob + constMgmt;
      const afterComplexity = adjustedSell * (1 + complexity);
      const afterDiscount = afterComplexity * (1 - discount);
      const grandTotalExGst = afterDiscount + council + warranty;
      const gst = grandTotalExGst * 0.1;
      const grandTotalIncGst = grandTotalExGst + gst;

      // Component summary for pricing table
      const componentSummary = compTotals.filter(c => c.included && c.sell > 0).map(c => ({
        name: tabLabels[c.tabName] || c.tabName,
        amount: c.sell,
      }));
      if (skyluxSell > 0) componentSummary.push({ name: "Skylux", amount: skyluxSell });
      if (eclipseSell > 0) componentSummary.push({ name: "Eclipse Louvre", amount: eclipseSell });

      // Adjustments list
      const adjustments: { name: string; amount: number }[] = [];
      if (delivery > 0) adjustments.push({ name: "Delivery", amount: delivery });
      if (travel > 0) adjustments.push({ name: "Travel Allowance", amount: travel });
      if (smallJob > 0) adjustments.push({ name: "Small Job Surcharge", amount: smallJob });
      if (constMgmt > 0) adjustments.push({ name: "Construction Management", amount: constMgmt });
      if (complexity > 0) adjustments.push({ name: `Complexity Loading (${(complexity * 100).toFixed(0)}%)`, amount: adjustedSell * complexity });
      if (discount > 0) adjustments.push({ name: `Discount (${(discount * 100).toFixed(0)}%)`, amount: -afterComplexity * discount });
      if (council > 0) adjustments.push({ name: "Council Fees", amount: council });
      if (warranty > 0) adjustments.push({ name: "Home Warranty", amount: warranty });

      // Find the branch for this quote (from travelBranchName or first branch)
      const quoteBranch = branchesList?.find((b: any) => b.name === (quote as any).travelBranchName) || branchesList?.[0];
      const branchDetails = quoteBranch ? {
        name: quoteBranch.name,
        address: quoteBranch.address || "",
        phone: quoteBranch.phone || undefined,
        email: quoteBranch.email || undefined,
      } : undefined;

      const proposalData: ProposalQuoteData = {
        quoteNumber: quote.quoteNumber,
        clientName: clientName || "Client",
        clientPhone,
        clientEmail,
        siteAddress,
        suburb,
        region,
        descriptionOfWork: quote.descriptionOfWork || "",
        branchDetails,
        specRoofType: quote.specRoofType || undefined,
        specWidth: quote.specWidth || undefined,
        specLength: quote.specLength || undefined,
        specFloorHeight: quote.specFloorHeight || undefined,
        specRoofTopColour: quote.specRoofTopColour || undefined,
        specRoofBottomColour: quote.specRoofBottomColour || undefined,
        specPostsColour: quote.specPostsColour || undefined,
        specBeamColour: quote.specBeamColour || undefined,
        grandTotalExGst,
        grandTotalIncGst,
        gst,
        componentSummary,
        adjustments,
        progressPayments: quote.specProgressPayments ? (quote.specProgressPayments as Record<string, string>) : undefined,
        specProjection: (quote as any).specProjection || quote.specLength || undefined,
        specHouseEave: quote.specHouseEave || undefined,
        specJobEave: quote.specJobEave || undefined,
        specFloorToGround: quote.specFloorToGround || undefined,
        specRoofShape: quote.specRoofShape || undefined,
        specFall: quote.specFall || undefined,
        specPostsNumber: quote.specPostsNumber || undefined,
        specPostsType: quote.specPostsType || undefined,
        specSetbackFront: (quote as any).specSetbackFront || undefined,
        specSetbackRear: (quote as any).specSetbackRear || undefined,
        specSetbackLeft: (quote as any).specSetbackLeft || undefined,
        specSetbackRight: (quote as any).specSetbackRight || undefined,
        specSetbackColor: (quote as any).specSetbackColor || undefined,
        specHouseWalls: (quote as any).specHouseWalls || undefined,
        postPositions: (quote as any).specPostPositions ? ((quote as any).specPostPositions as string).split(",").filter(Boolean) : undefined,
        sitePlan: (quote as any).sitePlanData ? {
          ...JSON.parse((quote as any).sitePlanData as string),
          satelliteDataUrl: (quote as any).satelliteImageUrl || undefined,
          structureOffsetX: (quote as any).specStructurePosX ? parseFloat((quote as any).specStructurePosX) : undefined,
          structureOffsetY: (quote as any).specStructurePosY ? parseFloat((quote as any).specStructurePosY) : undefined,
          structureRotation: (quote as any).specStructureRotation ? parseFloat((quote as any).specStructureRotation) : undefined,
        } : undefined,
        financialBreakdown: financialBreakdown ? {
          complexity: financialBreakdown.complexity,
          constructionMgmt: financialBreakdown.constructionMgmt,
          delivery: financialBreakdown.delivery,
          smallJob: financialBreakdown.smallJob,
        } : undefined,
        // Materials table
        materialsList: buildMaterialsList(quote),
        connectionType: (quote as any).specAttachmentMethod || undefined,
        connectionImageUrl: await (async () => {
          const code = connectionCodeOverride !== "auto" ? connectionCodeOverride : deriveConnectionCode(quote);
          if (!code) return undefined;
          try {
            const images = await utils.planConverter.getProductImagesByCode.fetch({ code });
            return images?.[0]?.imageUrl || undefined;
          } catch { return undefined; }
        })(),
        // Photo gallery - pull from quote's attached photos
        photos: (quote as any).proposalPhotos || undefined,
      };

      const result = await generateProposalPDF(proposalData, mode);
      if (mode === "download") toast.success("Proposal PDF generated");
      return result;
    } catch (err: any) {
      console.error("Proposal generation failed:", err);
      toast.error("Failed to generate proposal: " + (err.message || "Unknown error"));
    } finally {
      setProposalGenerating(false);
    }
  }, [quote, components, skyluxEntries, eclipseEntries, clientName, clientPhone, clientEmail, siteAddress, suburb, region, financialBreakdown, utils, connectionCodeOverride]);

  // Track whether we've done the initial population from the server
  const [initialPopulated, setInitialPopulated] = useState(false);

  useEffect(() => {
    if (quote && !initialPopulated) {
      setClientId((quote as any).clientId || null);
      setClientName(quote.clientName || "");
      setClientPhone(quote.clientPhone || "");
      setClientEmail(quote.clientEmail || "");
      setSiteAddress(quote.siteAddress || "");
      setSuburb(quote.suburb || "");
      setRegion(quote.region || "Canberra");
      setLocalCouncil(quote.localCouncil || "");
      setStatus(quote.status || "draft");
      setValidUntil((quote as any).validUntil ? new Date((quote as any).validUntil).toISOString().slice(0, 10) : "");
      setOutcomeReason((quote as any).outcomeReason || "");
      setNotes(quote.notes || "");
      setInitialPopulated(true);
    }
  }, [quote, initialPopulated]);

  const handleSave = useCallback(() => {
    updateMutation.mutate(
      {
        id,
        clientId: clientId || undefined,
        clientName, clientPhone, clientEmail, siteAddress, suburb, region, localCouncil,
        status: status as any,
        notes,
        validUntil: validUntil || null,
        outcomeReason: outcomeReason || null,
      },
      { onSuccess: () => toast.success("Quote saved") }
    );
  }, [id, clientId, clientName, clientPhone, clientEmail, siteAddress, suburb, region, localCouncil, status, notes, validUntil, outcomeReason, updateMutation]);

  // Auto-save with 2s debounce after initial population
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => {
    if (!initialPopulated) return; // Don't auto-save before initial load
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      setAutoSaveStatus("saving");
      updateMutation.mutate(
        {
          id,
          clientId: clientId || undefined,
          clientName, clientPhone, clientEmail, siteAddress, suburb, region, localCouncil,
          status: status as any,
          notes,
          validUntil: validUntil || null,
          outcomeReason: outcomeReason || null,
        },
        {
          onSuccess: () => {
            setAutoSaveStatus("saved");
            setTimeout(() => setAutoSaveStatus("idle"), 2000);
          },
          onError: () => setAutoSaveStatus("idle"),
        }
      );
    }, 9000);
    return () => { if (autoSaveRef.current) clearTimeout(autoSaveRef.current); };
  }, [clientId, clientName, clientPhone, clientEmail, siteAddress, suburb, region, localCouncil, status, notes, validUntil, outcomeReason]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Quote not found</p>
        <Button variant="outline" onClick={() => setLocation("/quotes")} className="mt-4">Back to Quotes</Button>
      </div>
    );
  }

  const statusCfg = statusOptions.find(s => s.value === status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        {/* Row 1: Back + Quote Number + Status + Save */}
        <div className="flex items-center gap-2 sm:gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/quotes")} className="gap-1 sm:gap-2 px-2 sm:px-3 shrink-0">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight whitespace-nowrap">{quote.quoteNumber}</h1>
              <Badge variant="outline" className={`text-[11px] shrink-0 ${statusCfg?.class || ""}`}>
                {statusCfg?.label || status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground truncate">{clientName || "Untitled"}</p>
          </div>
          {/* Save button + auto-save status */}
          <div className="flex items-center gap-2 shrink-0">
            {autoSaveStatus === "saving" && (
              <span className="text-[11px] text-muted-foreground animate-pulse">Saving...</span>
            )}
            {autoSaveStatus === "saved" && (
              <span className="text-[11px] text-emerald-600">Saved</span>
            )}
            <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{updateMutation.isPending ? "Saving..." : "Save"}</span>
            </Button>
          </div>
        </div>
        {/* Row 1b: Signature status (separate row to avoid overflow) */}
        <SignatureStatusBadge quoteId={id} />
        {/* Row 2: Action buttons - scrollable on mobile */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-none">
          {/* Connection code override for PDF generation */}
          <Select value={connectionCodeOverride} onValueChange={setConnectionCodeOverride}>
            <SelectTrigger className="h-8 w-[110px] shrink-0 text-xs">
              <SelectValue placeholder="Connection" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto Detect</SelectItem>
              <SelectItem value="FLY">FLY (Fly-over)</SelectItem>
              <SelectItem value="BCH">BCH (Fascia)</SelectItem>
              <SelectItem value="WFX">WFX (Wall Fix)</SelectItem>
              <SelectItem value="GBL">GBL (Gable)</SelectItem>
              <SelectItem value="FSS">FSS (Free-standing)</SelectItem>
              <SelectItem value="POP">POP (Pop-up)</SelectItem>
            </SelectContent>
          </Select>
          {(user?.role === "admin" || user?.role === "super_admin") && (
            <>
              <Button variant="outline" size="sm" onClick={async () => {
                const result = await handleGenerateProposal("preview");
                if (result && typeof result === "object" && "blob" in result) {
                  setPdfPreviewBlob(result.blob);
                  setPdfPreviewFilename(result.filename);
                  setPdfPreviewOpen(true);
                }
              }} disabled={proposalGenerating} className="gap-1.5 shrink-0 text-xs sm:text-sm">
                <Eye className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Preview Management PDF</span>
                <span className="sm:hidden">Preview</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleGenerateProposal("download")} disabled={proposalGenerating} className="gap-1.5 shrink-0 text-xs sm:text-sm">
                <FileDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{proposalGenerating ? "Generating..." : "Download Management PDF"}</span>
                <span className="sm:hidden">PDF</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => marginCheckMutation.mutate({ quoteId: id })} className="gap-1.5 shrink-0 text-xs sm:text-sm">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Check Margin</span>
                <span className="sm:hidden">Margin</span>
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => duplicateMutation.mutate({ id })} disabled={duplicateMutation.isPending} className="gap-1.5 shrink-0 text-xs sm:text-sm">
            <Copy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{duplicateMutation.isPending ? "Duplicating..." : "Duplicate"}</span>
            <span className="sm:hidden">Clone</span>
          </Button>
        </div>
      </div>

      {/* Margin warnings */}
      {marginCheckMutation.data?.warnings && marginCheckMutation.data.warnings.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-warning-foreground">Margin Warnings</p>
                {marginCheckMutation.data.warnings.map((w: string, i: number) => (
                  <p key={i} className="text-xs text-muted-foreground">{w}</p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mobile Hamburger Nav */}
      <div className="lg:hidden sticky top-0 z-20 bg-background/95 backdrop-blur border-b mb-4 -mx-4 px-4 py-2 flex items-center gap-2">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 w-8 p-0">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-4">
            <div className="space-y-1 mt-4">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-2 px-2">Sections</p>
              <div className="flex gap-1 px-2 mb-2">
                <button
                  onClick={() => setOpenSections(["details", "spec", "quote_items", "notes", "opq", "comms"])}
                  className="flex-1 text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 text-muted-foreground transition-colors"
                >
                  Expand All
                </button>
                <button
                  onClick={() => setOpenSections([])}
                  className="flex-1 text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 text-muted-foreground transition-colors"
                >
                  Collapse All
                </button>
              </div>
              {[
                { id: "details", label: "Details", icon: User },
                { id: "spec", label: "Spec Sheet", icon: ClipboardList },
                { id: "quote_items", label: "Quote Items", icon: Package },
                { id: "notes", label: "Notes", icon: StickyNote },
                { id: "opq", label: "Job Financials", icon: DollarSign },
                ...(clientId && clientPhone ? [{ id: "comms", label: "Communications", icon: MessageSquare }] : []),

              ].map(section => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => {
                      setActiveSection(section.id);
                      if (section.id === "spec") {
                        // Collapse Client Details and Status when entering Spec Sheet
                        setOpenSections(prev => {
                          const without = prev.filter(s => s !== "details");
                          return without.includes("spec") ? without : [...without, "spec"];
                        });
                      } else if (!openSections.includes(section.id)) {
                        setOpenSections(prev => [...prev, section.id]);
                      }
                      setMobileNavOpen(false);
                      setTimeout(() => {
                        const el = document.getElementById(`quote-section-${section.id}`);
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 300);
                    }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left ${
                      isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60 text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span>{section.label}</span>
                  </button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
        <span className="text-sm font-medium text-muted-foreground">Sections</span>
      </div>

      {/* Side Accordion Layout */}
      <div className="flex gap-6">
        {/* ─── Sticky Sidebar Nav ─── */}
        <nav className="hidden lg:block w-48 flex-shrink-0">
          <div className="sticky top-4 space-y-0.5 max-h-[calc(100vh-6rem)] overflow-y-auto">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider mb-2 px-2">Sections</p>
            <div className="flex gap-1 px-2 mb-2">
              <button
                onClick={() => setOpenSections(["details", "spec", "quote_items", "notes", "opq", "comms"])}
                className="flex-1 text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 text-muted-foreground transition-colors"
              >
                Expand All
              </button>
              <button
                onClick={() => setOpenSections([])}
                className="flex-1 text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted/60 text-muted-foreground transition-colors"
              >
                Collapse All
              </button>
            </div>
            {[
              { id: "details", label: "Details", icon: User },
              { id: "spec", label: "Spec Sheet", icon: ClipboardList },
              { id: "quote_items", label: "Quote Items", icon: Package },
              { id: "notes", label: "Notes", icon: StickyNote },
              { id: "opq", label: "Job Financials", icon: DollarSign },
              ...(clientId && clientPhone ? [{ id: "comms", label: "Communications", icon: MessageSquare }] : []),
            ].map(section => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => {
                    setActiveSection(section.id);
                    if (section.id === "spec") {
                      // Collapse Client Details and Status when entering Spec Sheet
                      setOpenSections(prev => {
                        const without = prev.filter(s => s !== "details");
                        return without.includes("spec") ? without : [...without, "spec"];
                      });
                    } else if (!openSections.includes(section.id)) {
                      setOpenSections(prev => [...prev, section.id]);
                    }
                    const el = document.getElementById(`quote-section-${section.id}`);
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors text-left ${
                    isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/60 text-muted-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* ─── Main Content (Accordion) ─── */}
        <div className="flex-1 min-w-0">
          <Accordion type="multiple" value={openSections} onValueChange={setOpenSections} className="space-y-3">
            {/* Details */}
            <AccordionItem value="details" id="quote-section-details" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Details</AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 gap-6">
                  {/* Client Details */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="text-sm font-medium">Client Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ClientPicker
                        selectedClientId={clientId}
                        onClientSelect={(client) => {
                          setClientId(client.id);
                          setClientName(client.name);
                          setClientPhone(client.phone || "");
                          setClientEmail(client.email || "");
                          setSiteAddress(client.address || "");
                          if (client.suburb) setSuburb(client.suburb);
                        }}
                        onClientClear={() => setClientId(null)}
                        clientName={clientName}
                        clientEmail={clientEmail}
                        clientPhone={clientPhone}
                        clientAddress={siteAddress}
                      />
                      <div className="space-y-2">
                        <Label className="text-xs">Site Address</Label>
                        <AddressAutocomplete
                          value={siteAddress}
                          onChange={setSiteAddress}
                          onAddressSelect={(addr) => {
                            const street = addr.unitNumber
                              ? `${addr.unitNumber}/${addr.streetAddress}`
                              : (addr.streetAddress || addr.fullAddress);
                            if (addr.suburb) setSuburb(addr.suburb);
                            const detected = detectRegion(addr.postcode, addr.suburb, addr.state);
                            if (detected) setRegion(detected);

                            if (quote?.travelDistanceKm && street !== siteAddress) {
                              setPendingAddress(street);
                              setShowRecalcConfirm(true);
                            } else {
                              setSiteAddress(street);
                              setTimeout(() => {
                                calculateTravelMutation.mutate({ quoteId: id });
                              }, 1500);
                            }
                          }}
                          placeholder="Start typing site address..."
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-xs">Region</Label>
                          <RegionSelect value={region} onChange={setRegion} />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Local Council</Label>
                          <CouncilSelect value={localCouncil} onChange={setLocalCouncil} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Quote Status & Notes */}
                  <div className="space-y-6">
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="text-sm font-medium">Status & Internal Notes</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Status</Label>
                          <Select value={status} onValueChange={(v) => {
                            if (v === "accepted" || v === "lost") {
                              setPendingStatus(v);
                              setShowReasonDialog(true);
                            } else {
                              setStatus(v);
                              setOutcomeReason("");
                            }
                          }}>
                            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {statusOptions.map(s => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {outcomeReason && (
                            <p className="text-xs text-muted-foreground">Reason: {outcomeReason}</p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Valid Until</Label>
                          <Input
                            type="date"
                            className="h-9 text-sm"
                            value={validUntil}
                            onChange={(e) => setValidUntil(e.target.value)}
                          />
                          {validUntil && (() => {
                            const daysLeft = Math.ceil((new Date(validUntil).getTime() - Date.now()) / (1000*60*60*24));
                            if (daysLeft < 0) return <p className="text-xs text-red-500">Expired {Math.abs(daysLeft)} days ago</p>;
                            if (daysLeft <= 7) return <p className="text-xs text-orange-500">{daysLeft} days remaining</p>;
                            return <p className="text-xs text-muted-foreground">{daysLeft} days remaining</p>;
                          })()}
                        </div>

                        {clientId && (
                          <LeadSectionNotes leadId={clientId} section="spec_internal" title="Internal Notes" />
                        )}
                        {!clientId && (
                          <div className="space-y-2">
                            <Label className="text-xs">Internal Notes</Label>
                            <Textarea
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              rows={3}
                              className="text-sm resize-none"
                              placeholder="Internal notes (not shown on quote)..."
                            />
                            <p className="text-xs text-muted-foreground">Link a lead to enable multi-note with timestamps</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Spec Sheet */}
            <AccordionItem value="spec" id="quote-section-spec" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Spec Sheet</AccordionTrigger>
              <AccordionContent>
                <SpecSheet quoteId={id} />
              </AccordionContent>
            </AccordionItem>

            {/* Quote Items */}
            <AccordionItem value="quote_items" id="quote-section-quote_items" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Quote Items</AccordionTrigger>
              <AccordionContent>
                <QuoteItemsTab quoteId={id} />
              </AccordionContent>
            </AccordionItem>

            {/* Notes */}
            <AccordionItem value="notes" id="quote-section-notes" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Notes</AccordionTrigger>
              <AccordionContent>
                <QuoteNotesSection quoteId={id} quoteType="structure" />
              </AccordionContent>
            </AccordionItem>

            {/* Proposal Photos */}
            <AccordionItem value="photos" id="quote-section-photos" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Proposal Photos</AccordionTrigger>
              <AccordionContent>
                <ProposalPhotoGallery quoteId={id} photos={(quote as any)?.proposalPhotos || []} />
              </AccordionContent>
            </AccordionItem>

            {/* Job Financials */}
            <AccordionItem value="opq" id="quote-section-opq" className="border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-medium">Job Financials</AccordionTrigger>
              <AccordionContent>
                <OPQDashboard quoteId={id} />
              </AccordionContent>
            </AccordionItem>

            {/* Communications */}
            {clientId && clientPhone && (
              <AccordionItem value="comms" id="quote-section-comms" className="border rounded-lg px-4">
                <AccordionTrigger className="text-sm font-medium">Communications</AccordionTrigger>
                <AccordionContent>
                  <CommunicationsTab leadId={clientId} leadPhone={clientPhone} leadName={clientName} />
                </AccordionContent>
              </AccordionItem>
            )}


          </Accordion>
        </div>
      </div>

      {/* Recalculation confirmation dialog */}
      <AlertDialog open={showRecalcConfirm} onOpenChange={setShowRecalcConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalculate Travel Allowance?</AlertDialogTitle>
            <AlertDialogDescription>
              The site address has changed. Would you like to recalculate the travel allowance based on the new address?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              // Apply address change without recalculating
              if (pendingAddress) setSiteAddress(pendingAddress);
              setPendingAddress(null);
            }}>Keep Current</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (pendingAddress) {
                setSiteAddress(pendingAddress);
                // Trigger recalculation after address is saved
                setTimeout(() => {
                  calculateTravelMutation.mutate({ quoteId: id });
                }, 1500);
              }
              setPendingAddress(null);
            }}>Recalculate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Win/Loss Reason Dialog */}
      <AlertDialog open={showReasonDialog} onOpenChange={(open) => {
        if (!open) {
          setShowReasonDialog(false);
          setPendingStatus(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingStatus === "accepted" ? "Quote Won" : "Quote Lost"} — Reason
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingStatus === "accepted"
                ? "What was the primary reason the client accepted this quote?"
                : "What was the primary reason the client did not proceed?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 space-y-2">
            {(pendingStatus === "accepted" ? wonReasonOptions : lostReasonOptions
            ).map((reason: string) => (
              <label key={reason} className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="outcomeReason"
                  value={reason}
                  checked={outcomeReason === reason}
                  onChange={(e) => setOutcomeReason(e.target.value)}
                  className="accent-primary"
                />
                {reason}
              </label>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setPendingStatus(null);
              setOutcomeReason("");
            }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (pendingStatus) setStatus(pendingStatus);
              setShowReasonDialog(false);
              setPendingStatus(null);
            }}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PDF Preview Modal */}
      <PdfPreviewModal
        open={pdfPreviewOpen}
        onClose={() => { setPdfPreviewOpen(false); setPdfPreviewBlob(null); }}
        blob={pdfPreviewBlob}
        filename={pdfPreviewFilename}
      />
    </div>
  );
}


