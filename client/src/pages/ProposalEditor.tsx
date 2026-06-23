/**
 * ProposalEditor — Multi-step proposal creation/editing workflow.
 * Steps: 1) Select Client  2) Select Sections  3) Additional Costs  4) Content & Terms  5) Adjustments  6) Review & Send
 *
 * Features:
 * - Auto-populates shared costs from section quotes
 * - Editable terms, scope of works, exclusions before send
 * - Lock on send (status=sent makes fields read-only)
 */
import { useState, useMemo, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ArrowRight, Check, FileText, Send, Loader2, Download, Eye, Lock, AlertTriangle, ExternalLink, ImageIcon, Library, RefreshCw } from "lucide-react";
import { generateProposalPdf, type ProposalPdfData } from "@/lib/proposalConsolidatedPdf";
import SendProposalDialog from "@/components/SendProposalDialog";
import SendForSignatureDialog from "@/components/SendForSignatureDialog";
import { toast } from "sonner";
import {
  PROPOSAL_LIBRARY_CONTENT_LABELS,
  PROPOSAL_LIBRARY_SECTION_LABELS,
  type ProposalLibraryContentType,
  type ProposalLibrarySectionType,
} from "@shared/proposal-library";

const STEPS = ["Client", "Sections", "Costs", "Content", "Payments", "Adjustments", "Review"];

// Progress Payment stages (same as OPQ Dashboard)
const CONTRACT_A_STAGES = [
  { key: "A1", label: "Deposit A \u2013 Contract Execution Stage" },
  { key: "A2", label: "Design, Development and Building Approvals Stage" },
];
const CONTRACT_B_STAGES = [
  { key: "B1", label: "Deposit B \u2013 Materials Ordered Stage" },
  { key: "B2", label: "Earthworks / Foundations / Slab Stage" },
  { key: "B3", label: "First Trades or Materials (on the Building Site) Stage" },
  { key: "B4", label: "Subfloor, Yellow/Red Tongue and/or Deck Stage" },
  { key: "B5", label: "Above Floor Frame Stage" },
  { key: "B6", label: "Roof Stage" },
  { key: "B7", label: "Windows & Doors Stage" },
  { key: "B8", label: "Underground Services & Plumbing Stage" },
  { key: "B9", label: "Electrical Stage" },
  { key: "B10", label: "Flooring Stage" },
  { key: "B11", label: "Other" },
  { key: "B12", label: "Work Substantially Completed (Practical Completion) Stage" },
  { key: "B13", label: "Final Payment (Issue of Certificate of Occupancy) Stage" },
];

interface SectionItem {
  type: "opq" | "deck" | "eclipse" | "security_screen" | "blind";
  quoteId: number;
  label: string;
  description?: string;
  worksPrice: number;
  selected: boolean;
  sharedCosts: { name: string; amount: number; source: string }[];
}

type ProposalLibraryItem = {
  id: number;
  sectionType: ProposalLibrarySectionType;
  contentType: ProposalLibraryContentType;
  title: string;
  body?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  imageWarning?: string | null;
  defaultIncluded: boolean;
  sortOrder: number;
};

// All shared cost field names
const COST_FIELDS = [
  { key: "siteClean", label: "Site Clean" },
  { key: "constructionMgmt", label: "Construction Management" },
  { key: "councilFees", label: "Council Fees (additional)" },
  { key: "homeWarranty", label: "Home Warranty Insurance" },
  { key: "otherCost", label: "Other Cost" },
] as const;

type CostKey = typeof COST_FIELDS[number]["key"];

function normaliseProposalLibraryIds(value: unknown): number[] {
  const raw = typeof value === "string"
    ? (() => {
      try { return JSON.parse(value); } catch { return []; }
    })()
    : value;

  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
}

export default function ProposalEditor() {
  const [, params] = useRoute("/proposals/edit/:id");
  const [, setLocation] = useLocation();
  const proposalId = params?.id ? parseInt(params.id) : null;
  const isEdit = proposalId !== null && !isNaN(proposalId);

  const [step, setStep] = useState(0);
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [proposalLibraryItemIds, setProposalLibraryItemIds] = useState<number[]>([]);
  const [proposalLibrarySelectionInitialised, setProposalLibrarySelectionInitialised] = useState(false);

  // Additional costs — all 15 fields
  const [costs, setCosts] = useState<Record<CostKey, string>>(() => {
    const init: Record<string, string> = {};
    COST_FIELDS.forEach(f => { init[f.key] = ""; });
    return init as Record<CostKey, string>;
  });
  // Legacy otherCostLabel/otherCostAmount removed - now uses costs.otherCost via COST_FIELDS

  // Adjustments
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [markupPercent, setMarkupPercent] = useState("");
  const [markupAmount, setMarkupAmount] = useState("");
  const [depositPercent, setDepositPercent] = useState("");
  const [depositAmount, setDepositAmount] = useState("");

  // Editable content
  const [coverMessage, setCoverMessage] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [scopeOfWorks, setScopeOfWorks] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [validityDays, setValidityDays] = useState(30);
  const [notes, setNotes] = useState("");

  // Progress Payments
  const [payments, setPayments] = useState<Record<string, { percent: string; amount: string }>>({});

  // Lock state
  const [isLocked, setIsLocked] = useState(false);

  // Queries
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(clientSearch), 300);
    return () => clearTimeout(timer);
  }, [clientSearch]);
  const { data: leadsData } = trpc.crm.leads.list.useQuery(
    { search: debouncedSearch || undefined, limit: 50 },
  );
  const { data: clientQuotes, isLoading: loadingQuotes } = trpc.proposals.clientQuotes.useQuery(
    { clientId: clientId! },
    { enabled: !!clientId }
  );
  const { data: existingProposal } = trpc.proposals.get.useQuery(
    { id: proposalId! },
    { enabled: isEdit }
  );
  const { data: proposalLibraryItems = [], isLoading: loadingProposalLibrary } = trpc.proposalLibrary.list.useQuery(
    { activeOnly: true }
  );

  const createMutation = trpc.proposals.create.useMutation();
  const updateMutation = trpc.proposals.update.useMutation();
  const markSentMutation = trpc.proposals.markSent.useMutation();

  // Load existing proposal data
  useEffect(() => {
    if (existingProposal && isEdit) {
      setClientId(existingProposal.clientId);
      // Load all cost fields
      const loadedCosts: Record<string, string> = {};
      COST_FIELDS.forEach(f => {
        loadedCosts[f.key] = (existingProposal as any)[f.key] || "";
      });
      // Map legacy otherCostAmount to new otherCost field
      if (!loadedCosts.otherCost && existingProposal.otherCostAmount && parseFloat(existingProposal.otherCostAmount) > 0) {
        loadedCosts.otherCost = existingProposal.otherCostAmount;
      }
      setCosts(loadedCosts as Record<CostKey, string>);
      setDiscountPercent(existingProposal.discountPercent || "");
      setDiscountAmount(existingProposal.discountAmount || "");
      setMarkupPercent(existingProposal.markupPercent || "");
      setMarkupAmount(existingProposal.markupAmount || "");
      setDepositPercent(existingProposal.depositPercent || "");
      setDepositAmount(existingProposal.depositAmount || "");
      setCoverMessage(existingProposal.coverMessage || "");
      setTermsAndConditions(existingProposal.termsAndConditions || "");
      setScopeOfWorks(existingProposal.scopeOfWorks || "");
      setExclusions(existingProposal.exclusions || "");
      setValidityDays(existingProposal.validityDays || 30);
      setNotes(existingProposal.notes || "");
      // Load progress payments
      if (existingProposal.progressPayments && typeof existingProposal.progressPayments === "object") {
        const loaded: Record<string, { percent: string; amount: string }> = {};
        Object.entries(existingProposal.progressPayments as Record<string, any>).forEach(([key, val]) => {
          if (typeof val === "object" && val !== null) {
            loaded[key] = { percent: val.percent || "", amount: val.amount || "" };
          } else {
            loaded[key] = { percent: "", amount: String(val || "") };
          }
        });
        setPayments(loaded);
      }
      // Lock if already sent
      if (existingProposal.status === "sent" || existingProposal.status === "accepted") {
        setIsLocked(true);
      }
    }
  }, [existingProposal, isEdit]);

  // Load sections when client quotes arrive
  useEffect(() => {
    if (clientQuotes) {
      const allQuotes = [
        ...clientQuotes.opq.map((q: any) => ({ ...q, sharedCosts: q.sharedCosts || [] })),
        ...clientQuotes.deck.map((q: any) => ({ ...q, sharedCosts: q.sharedCosts || [] })),
        ...clientQuotes.eclipse.map((q: any) => ({ ...q, sharedCosts: q.sharedCosts || [] })),
        ...(clientQuotes.securityScreens || []).map((q: any) => ({ ...q, sharedCosts: q.sharedCosts || [] })),
        ...(clientQuotes.blinds || []).map((q: any) => ({ ...q, sharedCosts: q.sharedCosts || [] })),
      ];
      const existingSections = (existingProposal?.sections || []) as { type: string; quoteId: number }[];
      setSections(allQuotes.map((q: any) => ({
        type: q.type,
        quoteId: q.id,
        label: q.label,
        worksPrice: q.worksPrice,
        sharedCosts: q.sharedCosts,
        selected: isEdit
          ? existingSections.some(s => s.type === q.type && s.quoteId === q.id)
          : true,
      })));
    }
  }, [clientQuotes, existingProposal, isEdit]);

  // Auto-populate costs from selected sections' sharedCosts (only if costs are empty)
  const [hasAutoPopulated, setHasAutoPopulated] = useState(false);
  useEffect(() => {
    if (hasAutoPopulated || isEdit) return;
    const selectedSecs = sections.filter(s => s.selected);
    if (selectedSecs.length === 0) return;

    // Aggregate shared costs by name (take the max from each source)
    const aggregated: Record<string, number> = {};
    for (const sec of selectedSecs) {
      for (const cost of sec.sharedCosts) {
        const key = cost.name as string;
        aggregated[key] = (aggregated[key] || 0) + cost.amount;
      }
    }

    // Only populate if all costs are empty
    const allEmpty = COST_FIELDS.every(f => !costs[f.key]);
    if (allEmpty && Object.keys(aggregated).length > 0) {
      const newCosts = { ...costs };
      for (const [key, amount] of Object.entries(aggregated)) {
        if (key in newCosts && amount > 0) {
          (newCosts as any)[key] = amount.toFixed(2);
        }
      }
      setCosts(newCosts);
      setHasAutoPopulated(true);
    }
  }, [sections, costs, hasAutoPopulated, isEdit]);

  const filteredLeads = useMemo(() => {
    return leadsData?.leads || [];
  }, [leadsData]);

  const { data: selectedClientData } = trpc.crm.leads.get.useQuery(
    { id: clientId! },
    { enabled: !!clientId }
  );
  const selectedClient = selectedClientData || null;

  // ─── Computed Totals ────────────────────────────────────────────────────────
  const selectedSections = sections.filter(s => s.selected);
  const sectionsSubtotal = selectedSections.reduce((sum, s) => sum + s.worksPrice, 0);
  const typedProposalLibraryItems = proposalLibraryItems as ProposalLibraryItem[];
  const selectedSectionTypes = useMemo(() => {
    return new Set(selectedSections.map((section) => section.type as ProposalLibrarySectionType));
  }, [selectedSections]);
  const applicableProposalLibraryItems = useMemo(() => {
    return typedProposalLibraryItems.filter((item) =>
      item.sectionType === "all" || selectedSectionTypes.has(item.sectionType)
    );
  }, [selectedSectionTypes, typedProposalLibraryItems]);
  const selectedProposalLibraryItems = useMemo(() => {
    const selectedIds = new Set(proposalLibraryItemIds);
    return applicableProposalLibraryItems.filter((item) => selectedIds.has(item.id));
  }, [applicableProposalLibraryItems, proposalLibraryItemIds]);

  useEffect(() => {
    if (proposalLibrarySelectionInitialised) return;
    if (selectedSections.length === 0 || typedProposalLibraryItems.length === 0) return;

    const applicableIds = new Set(applicableProposalLibraryItems.map((item) => item.id));
    const savedRaw = (existingProposal as any)?.proposalLibraryItemIds;
    const hasSavedSelection = savedRaw !== null && savedRaw !== undefined && !(typeof savedRaw === "string" && savedRaw.trim() === "");
    const savedIds = normaliseProposalLibraryIds(savedRaw)
      .filter((id) => applicableIds.has(id));
    const defaultIds = applicableProposalLibraryItems
      .filter((item) => item.defaultIncluded)
      .map((item) => item.id);

    setProposalLibraryItemIds(isEdit && hasSavedSelection ? savedIds : defaultIds);
    setProposalLibrarySelectionInitialised(true);
  }, [
    applicableProposalLibraryItems,
    existingProposal,
    isEdit,
    proposalLibrarySelectionInitialised,
    selectedSections.length,
    typedProposalLibraryItems.length,
  ]);

  const additionalCostsTotal = useMemo(() => {
    let total = 0;
    COST_FIELDS.forEach(f => { total += parseFloat(costs[f.key] || "0"); });
    return total;
  }, [costs]);

  const subtotalBeforeAdjustments = sectionsSubtotal + additionalCostsTotal;

  let adjustmentAmount = 0;
  if (discountPercent) {
    adjustmentAmount = -(subtotalBeforeAdjustments * parseFloat(discountPercent) / 100);
  } else if (discountAmount) {
    adjustmentAmount = -parseFloat(discountAmount);
  } else if (markupPercent) {
    adjustmentAmount = subtotalBeforeAdjustments * parseFloat(markupPercent) / 100;
  } else if (markupAmount) {
    adjustmentAmount = parseFloat(markupAmount);
  }

  const grandTotalExGst = subtotalBeforeAdjustments + adjustmentAmount;
  const gstAmount = grandTotalExGst * 0.1;
  const grandTotalIncGst = grandTotalExGst + gstAmount;

  let depositTotal = 0;
  // Auto-populate from Payments tab A1 (Deposit A – Contract Execution Stage)
  const a1Percent = payments["A1"]?.percent || depositPercent;
  const a1Amount = payments["A1"]?.amount || depositAmount;
  if (a1Percent) {
    depositTotal = grandTotalIncGst * parseFloat(a1Percent) / 100;
  } else if (a1Amount) {
    depositTotal = parseFloat(a1Amount);
  }

  const fmt = (val: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(val);

  // ─── Save / Create ──────────────────────────────────────────────────────────
  async function handleSave() {
    if (isLocked) {
      toast.error("This proposal is locked (already sent). Create a revision to make changes.");
      return;
    }
    const sectionData = selectedSections.map(s => ({
      type: s.type,
      quoteId: s.quoteId,
      label: s.label,
      worksPrice: s.worksPrice,
    }));

    const payload: any = {
      sections: sectionData,
      ...costs,
      discountPercent,
      discountAmount,
      markupPercent,
      markupAmount,
      depositPercent: payments["A1"]?.percent || depositPercent,
      depositAmount: payments["A1"]?.amount || depositAmount,
      coverMessage,
      termsAndConditions,
      scopeOfWorks,
      exclusions,
      validityDays,
      notes,
      proposalLibraryItemIds,
      progressPayments: Object.keys(payments).filter(k => payments[k]?.percent || payments[k]?.amount).length > 0
        ? Object.fromEntries(Object.entries(payments).filter(([, v]) => v.percent || v.amount))
        : null,
      sectionsSubtotalExGst: sectionsSubtotal.toFixed(2),
      additionalCostsTotal: additionalCostsTotal.toFixed(2),
      adjustmentAmount: adjustmentAmount.toFixed(2),
      grandTotalExGst: grandTotalExGst.toFixed(2),
      gstAmount: gstAmount.toFixed(2),
      grandTotalIncGst: grandTotalIncGst.toFixed(2),
    };

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: proposalId!, ...payload });
        toast.success("Proposal updated");
      } else {
        if (!clientId) return toast.error("Select a client first");
        const result = await createMutation.mutateAsync({ clientId, ...payload });
        toast.success(`Proposal ${result.proposalNumber} created`);
        setLocation(`/proposals/edit/${result.id}`);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to save proposal");
    }
  }

  // ─── Step Content ───────────────────────────────────────────────────────────
  function renderStep() {
    switch (step) {
      case 0: return renderClientStep();
      case 1: return renderSectionsStep();
      case 2: return renderCostsStep();
      case 3: return renderContentStep();
      case 4: return renderPaymentsStep();
      case 5: return renderAdjustmentsStep();
      case 6: return renderReviewStep();
      default: return null;
    }
  }

  function renderClientStep() {
    return (
      <div className="space-y-4">
        <div>
          <Label>Search Client</Label>
          <Input
            placeholder="Search by name, company, or email..."
            value={clientSearch}
            onChange={e => setClientSearch(e.target.value)}
            disabled={isLocked}
          />
        </div>
        {selectedClient && (
          <Card className="border-primary">
            <CardContent className="pt-4">
              <p className="font-semibold">
                {[selectedClient.contactFirstName, selectedClient.contactLastName].filter(Boolean).join(" ")}
              </p>
              {selectedClient.company && <p className="text-sm text-muted-foreground">{selectedClient.company}</p>}
              {selectedClient.contactEmail && <p className="text-sm">{selectedClient.contactEmail}</p>}
            </CardContent>
          </Card>
        )}
        {!isLocked && (
          <div className="max-h-64 overflow-y-auto border rounded-md">
            {filteredLeads.map((lead: any) => (
              <button
                key={lead.id}
                onClick={() => setClientId(lead.id)}
                className={`w-full text-left px-3 py-2 hover:bg-accent border-b last:border-b-0 ${clientId === lead.id ? "bg-accent" : ""}`}
              >
                <p className="font-medium text-sm">
                  {[lead.contactFirstName, lead.contactLastName].filter(Boolean).join(" ") || "Unnamed"}
                </p>
                <p className="text-xs text-muted-foreground">{lead.company || lead.contactEmail || ""}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderSectionsStep() {
    if (loadingQuotes) return <div className="flex items-center gap-2"><Loader2 className="animate-spin h-4 w-4" /> Loading quotes...</div>;
    if (sections.length === 0) return <p className="text-muted-foreground">No active quotes found for this client.</p>;

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Select which quote sections to include in this proposal:</p>
        {sections.map((s, i) => (
          <div key={`${s.type}-${s.quoteId}`} className="flex items-center gap-3 p-3 border rounded-md">
            <Checkbox
              checked={s.selected}
              disabled={isLocked}
              onCheckedChange={(checked) => {
                const updated = [...sections];
                updated[i] = { ...updated[i], selected: !!checked };
                setSections(updated);
              }}
            />
            <div className="flex-1">
              <p className="text-sm font-medium">{s.label}</p>
              <div className="flex gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {s.type === "opq" ? "Structure" : s.type === "deck" ? "Deck" : s.type === "eclipse" ? "Eclipse" : s.type === "blind" ? "Blinds" : "Security Screens"}
                </Badge>
                {s.sharedCosts.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    +{s.sharedCosts.length} shared costs
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-sm font-semibold">{fmt(s.worksPrice)}</p>
          </div>
        ))}
        <Separator />
        <div className="flex justify-between font-semibold">
          <span>Sections Subtotal (ex GST)</span>
          <span>{fmt(sectionsSubtotal)}</span>
        </div>
      </div>
    );
  }

  function renderCostsStep() {
    // Show which costs were auto-populated
    const populatedCosts = COST_FIELDS.filter(f => parseFloat(costs[f.key] || "0") > 0);

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Shared additional costs (applied once across all sections, not duplicated):
        </p>
        {!isEdit && populatedCosts.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md p-3">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <AlertTriangle className="inline h-3 w-3 mr-1" />
              Costs auto-populated from selected sections. Review and adjust as needed.
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          {COST_FIELDS.map(f => (
            <div key={f.key}>
              <Label>{f.label}</Label>
              <Input
                type="number"
                value={costs[f.key]}
                onChange={e => setCosts({ ...costs, [f.key]: e.target.value })}
                placeholder="0.00"
                disabled={isLocked}
              />
            </div>
          ))}

        </div>
        <Separator />
        <div className="flex justify-between text-sm">
          <span>Sections Subtotal</span>
          <span>{fmt(sectionsSubtotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Additional Costs</span>
          <span>{fmt(additionalCostsTotal)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Subtotal (ex GST)</span>
          <span>{fmt(subtotalBeforeAdjustments)}</span>
        </div>
      </div>
    );
  }

  function renderContentStep() {
    const itemsBySection = applicableProposalLibraryItems.reduce((acc, item) => {
      const key = item.sectionType;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {} as Record<ProposalLibrarySectionType, ProposalLibraryItem[]>);
    const sectionOrder = Object.keys(itemsBySection) as ProposalLibrarySectionType[];
    const selectedIdSet = new Set(proposalLibraryItemIds);
    const setDefaultContent = () => {
      setProposalLibraryItemIds(applicableProposalLibraryItems.filter((item) => item.defaultIncluded).map((item) => item.id));
      setProposalLibrarySelectionInitialised(true);
    };
    const clearContent = () => {
      setProposalLibraryItemIds([]);
      setProposalLibrarySelectionInitialised(true);
    };
    const toggleContentItem = (id: number, checked: boolean) => {
      setProposalLibraryItemIds((current) => {
        if (checked) return Array.from(new Set([...current, id]));
        return current.filter((itemId) => itemId !== id);
      });
      setProposalLibrarySelectionInitialised(true);
    };

    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Edit the proposal content below. These will appear in the client-facing PDF.
        </p>
        <div>
          <Label>Cover Message</Label>
          <Textarea
            value={coverMessage}
            onChange={e => setCoverMessage(e.target.value)}
            placeholder="Thank you for the opportunity to provide this proposal for your project..."
            rows={4}
            disabled={isLocked}
          />
          <p className="text-xs text-muted-foreground mt-1">Appears on the cover page below client details.</p>
        </div>
        <div>
          <Label>Scope of Works</Label>
          <Textarea
            value={scopeOfWorks}
            onChange={e => setScopeOfWorks(e.target.value)}
            placeholder="Supply and install the following works as per the attached specifications..."
            rows={4}
            disabled={isLocked}
          />
          <p className="text-xs text-muted-foreground mt-1">Detailed description of what's included. If left blank, section labels will be used.</p>
        </div>
        <div>
          <Label>Exclusions</Label>
          <Textarea
            value={exclusions}
            onChange={e => setExclusions(e.target.value)}
            placeholder="The following items are excluded from this proposal:&#10;- Site preparation beyond standard access&#10;- Painting or finishing of existing structures"
            rows={4}
            disabled={isLocked}
          />
          <p className="text-xs text-muted-foreground mt-1">What is NOT included. Appears before terms.</p>
        </div>
        <div>
          <Label>Terms & Conditions</Label>
          <Textarea
            value={termsAndConditions}
            onChange={e => setTermsAndConditions(e.target.value)}
            placeholder="Leave blank to use default terms. Enter custom terms to override."
            rows={6}
            disabled={isLocked}
          />
          <p className="text-xs text-muted-foreground mt-1">Custom terms override the default. Leave blank for standard terms.</p>
        </div>
        <Separator />
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label className="flex items-center gap-2 text-base font-semibold">
                <Library className="h-4 w-4" />
                Proposal Library Content
              </Label>
              <p className="text-xs text-muted-foreground">
                {selectedProposalLibraryItems.length} of {applicableProposalLibraryItems.length} available item{applicableProposalLibraryItems.length === 1 ? "" : "s"} selected
              </p>
            </div>
            {!isLocked && applicableProposalLibraryItems.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={setDefaultContent} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Defaults
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearContent}>
                  Clear
                </Button>
              </div>
            )}
          </div>

          {loadingProposalLibrary ? (
            <div className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading proposal content...
            </div>
          ) : applicableProposalLibraryItems.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              No Proposal Library content matches the selected quote sections.
            </div>
          ) : (
            <div className="space-y-4">
              {sectionOrder.map((sectionType) => (
                <div key={sectionType} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{PROPOSAL_LIBRARY_SECTION_LABELS[sectionType]}</Badge>
                    <span className="text-xs text-muted-foreground">{itemsBySection[sectionType].length} item{itemsBySection[sectionType].length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="grid gap-2">
                    {itemsBySection[sectionType].map((item) => {
                      const checked = selectedIdSet.has(item.id);
                      return (
                        <div
                          key={item.id}
                          className={`rounded-md border p-3 transition-colors ${checked ? "border-primary/60 bg-primary/5" : "bg-background"}`}
                        >
                          <div className="flex gap-3">
                            <Checkbox
                              checked={checked}
                              disabled={isLocked}
                              onCheckedChange={(value) => toggleContentItem(item.id, value === true)}
                              className="mt-1"
                            />
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.imageAlt || item.title}
                                className="h-16 w-20 shrink-0 rounded border bg-white object-cover"
                              />
                            ) : (
                              <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded border bg-muted text-muted-foreground">
                                <ImageIcon className="h-5 w-5" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-start gap-2">
                                <p className="font-medium leading-tight">{item.title}</p>
                                <Badge variant="outline" className="text-[10px]">
                                  {PROPOSAL_LIBRARY_CONTENT_LABELS[item.contentType]}
                                </Badge>
                                {item.defaultIncluded && <Badge variant="secondary" className="text-[10px]">Default</Badge>}
                              </div>
                              {item.body && (
                                <p className="line-clamp-2 text-xs text-muted-foreground whitespace-pre-line">{item.body}</p>
                              )}
                              {item.imageWarning && (
                                <p className="text-xs text-amber-600">{item.imageWarning}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderPaymentsStep() {
    const updatePayment = (key: string, field: "percent" | "amount", value: string) => {
      setPayments(prev => {
        const current = prev[key] || { percent: "", amount: "" };
        const updated = { ...current, [field]: value };
        // Auto-calculate amount from percent if percent changes
        if (field === "percent" && value) {
          const pct = parseFloat(value);
          if (!isNaN(pct) && grandTotalIncGst > 0) {
            updated.amount = (grandTotalIncGst * pct / 100).toFixed(2);
          }
        }
        return { ...prev, [key]: updated };
      });
    };

    const contractATotal = CONTRACT_A_STAGES.reduce((sum, s) => sum + parseFloat(payments[s.key]?.amount || "0"), 0);
    const contractBTotal = CONTRACT_B_STAGES.reduce((sum, s) => sum + parseFloat(payments[s.key]?.amount || "0"), 0);
    const contractAPercent = CONTRACT_A_STAGES.reduce((sum, s) => sum + parseFloat(payments[s.key]?.percent || "0"), 0);
    const contractBPercent = CONTRACT_B_STAGES.reduce((sum, s) => sum + parseFloat(payments[s.key]?.percent || "0"), 0);
    const allTotal = contractATotal + contractBTotal;
    const allPercent = contractAPercent + contractBPercent;

    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Define the progress payment schedule. Enter % to auto-calculate amounts based on the total (inc GST): {fmt(grandTotalIncGst)}.
        </p>

        {/* Contract A */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Contract A \u2013 Design & Approvals</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 font-medium text-muted-foreground w-10">Stage</th>
                <th className="text-left py-2 font-medium text-muted-foreground">Description</th>
                <th className="text-right py-2 font-medium text-muted-foreground w-20">%</th>
                <th className="text-right py-2 font-medium text-muted-foreground w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {CONTRACT_A_STAGES.map(stage => (
                <tr key={stage.key} className="border-b border-border/30">
                  <td className="py-2 font-mono text-muted-foreground">{stage.key}</td>
                  <td className="py-2">{stage.label}</td>
                  <td className="py-2 text-right">
                    <Input
                      type="number"
                      step="0.1"
                      value={payments[stage.key]?.percent || ""}
                      onChange={(e) => updatePayment(stage.key, "percent", e.target.value)}
                      className="h-7 text-xs w-16 ml-auto text-right"
                      placeholder="0"
                      disabled={isLocked}
                    />
                  </td>
                  <td className="py-2 text-right">
                    <Input
                      type="number"
                      step="0.01"
                      value={payments[stage.key]?.amount || ""}
                      onChange={(e) => updatePayment(stage.key, "amount", e.target.value)}
                      className="h-7 text-xs w-24 ml-auto text-right"
                      placeholder="$0.00"
                      disabled={isLocked}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-medium">
                <td colSpan={2} className="py-2">Total Contract A</td>
                <td className="py-2 text-right font-mono">{contractAPercent.toFixed(1)}%</td>
                <td className="py-2 text-right font-mono">{fmt(contractATotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Contract B */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Contract B \u2013 Construction</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 font-medium text-muted-foreground w-10">Stage</th>
                <th className="text-left py-2 font-medium text-muted-foreground">Description</th>
                <th className="text-right py-2 font-medium text-muted-foreground w-20">%</th>
                <th className="text-right py-2 font-medium text-muted-foreground w-28">Amount</th>
              </tr>
            </thead>
            <tbody>
              {CONTRACT_B_STAGES.map(stage => (
                <tr key={stage.key} className="border-b border-border/30">
                  <td className="py-2 font-mono text-muted-foreground">{stage.key}</td>
                  <td className="py-2">{stage.label}</td>
                  <td className="py-2 text-right">
                    <Input
                      type="number"
                      step="0.1"
                      value={payments[stage.key]?.percent || ""}
                      onChange={(e) => updatePayment(stage.key, "percent", e.target.value)}
                      className="h-7 text-xs w-16 ml-auto text-right"
                      placeholder="0"
                      disabled={isLocked}
                    />
                  </td>
                  <td className="py-2 text-right">
                    <Input
                      type="number"
                      step="0.01"
                      value={payments[stage.key]?.amount || ""}
                      onChange={(e) => updatePayment(stage.key, "amount", e.target.value)}
                      className="h-7 text-xs w-24 ml-auto text-right"
                      placeholder="$0.00"
                      disabled={isLocked}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-medium">
                <td colSpan={2} className="py-2">Total Contract B</td>
                <td className="py-2 text-right font-mono">{contractBPercent.toFixed(1)}%</td>
                <td className="py-2 text-right font-mono">{fmt(contractBTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Grand Total */}
        <Separator />
        <div className="flex justify-between font-semibold text-sm">
          <span>Total Progress Payments</span>
          <span>{allPercent.toFixed(1)}% \u2014 {fmt(allTotal)}</span>
        </div>
        {Math.abs(allPercent - 100) > 0.1 && allPercent > 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-600">
            <AlertTriangle className="h-3 w-3" />
            <span>Total does not equal 100% (currently {allPercent.toFixed(1)}%)</span>
          </div>
        )}
      </div>
    );
  }

  function renderAdjustmentsStep() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Apply a discount or markup to the subtotal. Only one adjustment type applies at a time.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Discount %</Label>
            <Input
              type="number"
              value={discountPercent}
              onChange={e => { setDiscountPercent(e.target.value); setDiscountAmount(""); setMarkupPercent(""); setMarkupAmount(""); }}
              placeholder="e.g. 5"
              disabled={isLocked}
            />
          </div>
          <div>
            <Label>Discount $</Label>
            <Input
              type="number"
              value={discountAmount}
              onChange={e => { setDiscountAmount(e.target.value); setDiscountPercent(""); setMarkupPercent(""); setMarkupAmount(""); }}
              placeholder="e.g. 500"
              disabled={isLocked}
            />
          </div>
          <div>
            <Label>Markup %</Label>
            <Input
              type="number"
              value={markupPercent}
              onChange={e => { setMarkupPercent(e.target.value); setMarkupAmount(""); setDiscountPercent(""); setDiscountAmount(""); }}
              placeholder="e.g. 10"
              disabled={isLocked}
            />
          </div>
          <div>
            <Label>Markup $</Label>
            <Input
              type="number"
              value={markupAmount}
              onChange={e => { setMarkupAmount(e.target.value); setMarkupPercent(""); setDiscountPercent(""); setDiscountAmount(""); }}
              placeholder="e.g. 1000"
              disabled={isLocked}
            />
          </div>
        </div>
        <Separator />
        <div>
          <div className="flex items-center justify-between">
            <Label>Deposit Required</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-primary gap-1"
              onClick={() => setStep(4)}
            >
              <ExternalLink className="h-3 w-3" />
              Edit in Payments
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Auto-populated from Payments tab → A1 (Deposit A – Contract Execution Stage)</p>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground">%</span>
              <Input
                type="number"
                value={payments["A1"]?.percent || depositPercent || ""}
                readOnly
                className="bg-muted/50 cursor-not-allowed h-8 text-sm"
                placeholder="Set in Payments tab"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground">$ Amount</span>
              <Input
                type="number"
                value={payments["A1"]?.amount || depositAmount || ""}
                readOnly
                className="bg-muted/50 cursor-not-allowed h-8 text-sm"
                placeholder="Set in Payments tab"
              />
            </div>
          </div>
          {!payments["A1"]?.percent && !payments["A1"]?.amount && !depositPercent && !depositAmount && (
            <p className="text-xs text-amber-600 mt-1">No deposit set. Go to Payments step and fill in A1.</p>
          )}
        </div>
        <Separator />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Validity (days)</Label>
            <Input type="number" value={validityDays} onChange={e => setValidityDays(parseInt(e.target.value) || 30)} disabled={isLocked} />
          </div>
          <div>
            <Label>Internal Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal only — not shown on PDF" />
          </div>
        </div>
      </div>
    );
  }

  function renderReviewStep() {
    const clientName = selectedClient
      ? [selectedClient.contactFirstName, selectedClient.contactLastName].filter(Boolean).join(" ")
      : "—";

    return (
      <div className="space-y-4">
        {isLocked && (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-600" />
            <p className="text-sm text-amber-700 dark:text-amber-300">
              This proposal has been sent and is locked. To make changes, create a new revision.
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Client</p>
            <p className="font-semibold">{clientName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Validity</p>
            <p className="font-semibold">{validityDays} days</p>
          </div>
        </div>

        <Separator />
        <h4 className="font-semibold text-sm">Sections</h4>
        {selectedSections.map(s => (
          <div key={`${s.type}-${s.quoteId}`} className="flex justify-between text-sm">
            <span>{s.label}</span>
            <span>{fmt(s.worksPrice)}</span>
          </div>
        ))}

        {additionalCostsTotal > 0 && (
          <>
            <Separator />
            <h4 className="font-semibold text-sm">Additional Costs</h4>
            {COST_FIELDS.filter(f => parseFloat(costs[f.key] || "0") > 0).map(f => (
              <div key={f.key} className="flex justify-between text-sm">
                <span>{f.label}</span>
                <span>{fmt(parseFloat(costs[f.key]))}</span>
              </div>
            ))}

          </>
        )}

        <Separator />
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal (ex GST)</span><span>{fmt(subtotalBeforeAdjustments)}</span></div>
          {adjustmentAmount !== 0 && (
            <div className="flex justify-between text-orange-600">
              <span>{adjustmentAmount < 0 ? "Discount" : "Markup"}</span>
              <span>{adjustmentAmount < 0 ? "-" : "+"}{fmt(Math.abs(adjustmentAmount))}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold"><span>Total (ex GST)</span><span>{fmt(grandTotalExGst)}</span></div>
          <div className="flex justify-between"><span>GST</span><span>{fmt(gstAmount)}</span></div>
          <div className="flex justify-between font-bold text-base"><span>Total (inc GST)</span><span>{fmt(grandTotalIncGst)}</span></div>
          {depositTotal > 0 && (
            <div className="flex justify-between text-blue-600 pt-2">
              <span>Deposit Required</span>
              <span>{fmt(depositTotal)}</span>
            </div>
          )}
        </div>

        {/* Content preview */}
        {(coverMessage || scopeOfWorks || exclusions || termsAndConditions || selectedProposalLibraryItems.length > 0) && (
          <>
            <Separator />
            <h4 className="font-semibold text-sm">Content Preview</h4>
            {coverMessage && <div className="text-xs text-muted-foreground"><span className="font-medium">Cover:</span> {coverMessage.slice(0, 100)}...</div>}
            {scopeOfWorks && <div className="text-xs text-muted-foreground"><span className="font-medium">Scope:</span> {scopeOfWorks.slice(0, 100)}...</div>}
            {exclusions && <div className="text-xs text-muted-foreground"><span className="font-medium">Exclusions:</span> {exclusions.slice(0, 100)}...</div>}
            {termsAndConditions && <div className="text-xs text-muted-foreground"><span className="font-medium">Custom Terms:</span> Yes ({termsAndConditions.length} chars)</div>}
            {selectedProposalLibraryItems.length > 0 && <div className="text-xs text-muted-foreground"><span className="font-medium">Proposal Library:</span> {selectedProposalLibraryItems.length} selected item{selectedProposalLibraryItems.length === 1 ? "" : "s"}</div>}
          </>
        )}
      </div>
    );
  }

  // ─── PDF Generation ─────────────────────────────────────────────────────────
  const [showSendDialog, setShowSendDialog] = useState(false);

  function buildPdfData(): ProposalPdfData {
    const clientName = selectedClient
      ? [selectedClient.contactFirstName, selectedClient.contactLastName].filter(Boolean).join(" ")
      : "Client";
    return {
      proposalNumber: existingProposal?.proposalNumber || "DRAFT",
      clientName,
      clientEmail: selectedClient?.contactEmail || undefined,
      clientPhone: selectedClient?.contactPhone || undefined,
      clientAddress: selectedClient?.contactAddress || undefined,
      clientCompany: selectedClient?.company || undefined,
      preparedByName: "Spanline Team",
      createdAt: existingProposal?.createdAt ? String(existingProposal.createdAt) : new Date().toISOString(),
      validityDays,
      coverMessage: coverMessage || undefined,
      scopeOfWorks: scopeOfWorks || undefined,
      exclusions: exclusions || undefined,
      termsAndConditions: termsAndConditions || undefined,
      sections: selectedSections.map(s => ({
        type: s.type,
        quoteId: s.quoteId,
        label: s.label,
        worksPrice: s.worksPrice,
        description: s.description,
      })),
      // All cost fields
      siteClean: costs.siteClean || undefined,
      constructionMgmt: costs.constructionMgmt || undefined,
      councilFees: costs.councilFees || undefined,
      homeWarranty: costs.homeWarranty || undefined,
      otherCost: costs.otherCost || undefined,
      // Adjustments
      discountPercent: discountPercent || undefined,
      discountAmount: discountAmount || undefined,
      markupPercent: markupPercent || undefined,
      markupAmount: markupAmount || undefined,
      // Computed totals
      sectionsSubtotalExGst: sectionsSubtotal,
      additionalCostsTotal,
      adjustmentAmount,
      grandTotalExGst,
      gstAmount,
      grandTotalIncGst,
      depositPercent: (payments["A1"]?.percent || depositPercent) || undefined,
      depositAmount: (payments["A1"]?.amount || depositAmount) || undefined,
      depositTotal,
      progressPayments: Object.keys(payments).filter(k => payments[k]?.percent || payments[k]?.amount).length > 0
        ? Object.fromEntries(Object.entries(payments).filter(([, v]) => v.percent || v.amount))
        : undefined,
      proposalLibraryContent: selectedProposalLibraryItems.map((item) => ({
        id: item.id,
        sectionType: item.sectionType,
        contentType: item.contentType,
        title: item.title,
        body: item.body || undefined,
        imageUrl: item.imageUrl || undefined,
        imageAlt: item.imageAlt || undefined,
      })),
    };
  }

  async function handlePreviewPdf() {
    try {
      await generateProposalPdf(buildPdfData(), "preview");
    } catch (e: any) {
      toast.error("Failed to generate PDF: " + (e.message || "Unknown error"));
    }
  }

  async function handleDownloadPdf() {
    try {
      await generateProposalPdf(buildPdfData(), "download");
      toast.success("PDF downloaded");
    } catch (e: any) {
      toast.error("Failed to generate PDF: " + (e.message || "Unknown error"));
    }
  }

  async function handleGeneratePdfBase64(): Promise<string | undefined> {
    try {
      const result = await generateProposalPdf(buildPdfData(), "base64");
      return result as string;
    } catch (e: any) {
      toast.error("Failed to generate PDF");
      return undefined;
    }
  }

  async function handleSendProposal() {
    if (!isEdit) {
      toast.error("Save the proposal first before sending");
      return;
    }
    // Auto-save before send
    await handleSave();
    setShowSendDialog(true);
  }

  // ─── Navigation ─────────────────────────────────────────────────────────────
  const canNext = step === 0 ? !!clientId : true;

  return (
    <div className="container max-w-3xl py-6">
      <Button variant="ghost" size="sm" onClick={() => setLocation("/proposals")} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Proposals
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {isEdit ? `Edit Proposal ${existingProposal?.proposalNumber || ""}` : "New Proposal"}
            {isLocked && <Badge variant="secondary" className="ml-2"><Lock className="h-3 w-3 mr-1" /> Locked</Badge>}
          </CardTitle>
          {/* Step indicator */}
          <div className="flex gap-1 mt-3">
            {STEPS.map((s, i) => (
              <div key={s} className="flex-1 cursor-pointer" onClick={() => setStep(i)}>
                <div className={`h-1 rounded ${i <= step ? "bg-primary" : "bg-muted"}`} />
                <p className={`text-xs mt-1 ${i === step ? "font-semibold" : "text-muted-foreground"}`}>{s}</p>
              </div>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {renderStep()}

          <div className="flex justify-between mt-6 pt-4 border-t">
            <Button variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
            <div className="flex gap-2">
              {step === STEPS.length - 1 ? (
                <>
                  <Button variant="outline" onClick={handlePreviewPdf}>
                    <Eye className="h-4 w-4 mr-1" /> Preview PDF
                  </Button>
                  <Button variant="outline" onClick={handleDownloadPdf}>
                    <Download className="h-4 w-4 mr-1" /> Download
                  </Button>
                  {!isLocked && (
                    <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
                      <Check className="h-4 w-4 mr-1" />
                      {isEdit ? "Update" : "Create"} Proposal
                    </Button>
                  )}
                  {isEdit && !isLocked && (
                    <Button variant="default" onClick={handleSendProposal}>
                      <Send className="h-4 w-4 mr-1" /> Send Email
                    </Button>
                  )}
                  {isEdit && !isLocked && (
                    <SendForSignatureDialog
                      quoteId={proposalId!}
                      clientName={selectedClient ? [selectedClient.contactFirstName, selectedClient.contactLastName].filter(Boolean).join(" ") : "Client"}
                      clientEmail={selectedClient?.contactEmail || undefined}
                      quoteNumber={existingProposal?.proposalNumber || ""}
                      onGeneratePdf={async () => {
                        const base64 = await handleGeneratePdfBase64();
                        if (base64) return { pdfBase64: base64, totalPages: 3 };
                        return undefined;
                      }}
                      disabled={false}
                      onSent={async (sentTo) => {
                        try {
                          await markSentMutation.mutateAsync({ id: proposalId!, sentTo });
                          setIsLocked(true);
                          toast.success("Proposal marked as sent and locked");
                        } catch (e) {
                          console.error("Failed to mark proposal as sent:", e);
                        }
                      }}
                    />
                  )}
                </>
              ) : (
                <Button onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))} disabled={!canNext}>
                  Next <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {showSendDialog && isEdit && selectedClient && (
        <SendProposalDialog
          quoteId={proposalId!}
          clientName={[selectedClient.contactFirstName, selectedClient.contactLastName].filter(Boolean).join(" ")}
          clientEmail={selectedClient.contactEmail || undefined}
          quoteNumber={existingProposal?.proposalNumber || ""}
          onGeneratePdf={handleGeneratePdfBase64}
          disabled={false}
          onSent={async (sentTo) => {
            try {
              await markSentMutation.mutateAsync({ id: proposalId!, sentTo });
              setIsLocked(true);
              toast.success("Proposal marked as sent and locked");
            } catch (e) {
              console.error("Failed to mark proposal as sent:", e);
            }
          }}
        />
      )}
    </div>
  );
}
