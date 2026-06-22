import { useState, useEffect, useRef, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation, useParams, Link } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Save, Star, Trash2, Plus, ExternalLink, Mail, UserCheck, Send, Pin, CheckCircle2, Circle, MessageSquare, Archive, ArchiveRestore, Loader2, GitMerge, Phone, AtSign, Search, UserCog, AlertTriangle, Pencil, RefreshCw, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { isAdminRole } from "@shared/const";
import { useAuth } from "@/_core/hooks/useAuth";
import AddressAutocomplete, { type AddressResult } from "@/components/AddressAutocomplete";
import { MapView } from "@/components/Map";
import CouncilSelect from "@/components/CouncilSelect";
import { detectRegion } from "@shared/regionDetection";
import DesignAdvisorSelect from "@/components/DesignAdvisorSelect";
import LeadSectionNotes from "@/components/LeadSectionNotes";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import CommunicationsTab from "@/components/CommunicationsTab";
import ClientActivityTab from "@/components/ClientActivityTab";
import ProjectTeamFields from "@/components/construction/ProjectTeamFields";
import { useLeadStatusOptions, useProductTypeOptions, useLeadSourceOptions, useOutcomeOptions, useAppointmentTypeOptions, useBuildingAuthorityOptions, useCouncilLetterTypeOptions } from "@/hooks/useCrmDropdowns";

// Fallback arrays used only while dynamic options load
const FALLBACK_STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "assigned", label: "Assigned" },
  { value: "appointment_set", label: "Appointment Set" },
  { value: "quoted", label: "Quoted" },
  { value: "contract", label: "Contract" },
  { value: "building_authority", label: "Approvals" },
  { value: "construction", label: "Construction" },
  { value: "completed", label: "Completed" },
  { value: "won", label: "Won / Client" },
  { value: "cancelled", label: "Cancelled" },
];
const FALLBACK_PRODUCT_TYPES = [
  "Outdoor Living", "Patio", "Carport", "Deck", "Eclipse Roof",
  "Glassroom", "Screenroom", "Lattice", "Spacemaker", "Awning"
];
const FALLBACK_LEAD_SOURCES = [
  "Website", "Phone", "Referral", "Display Home", "Home Show",
  "Social Media", "Print Ad", "Door Knock", "Repeat Client", "Other"
];
const FALLBACK_OUTCOMES = [
  "Sale", "No Sale - Price", "No Sale - Design", "No Sale - Timing",
  "No Sale - Competitor", "No Sale - Changed Mind", "No Sale - Other", "Pending"
];

function toDateInputValue(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

const AU_STATE_ALIASES: Record<string, string> = {
  act: "ACT",
  "australian capital territory": "ACT",
  nsw: "NSW",
  "new south wales": "NSW",
  vic: "VIC",
  victoria: "VIC",
  qld: "QLD",
  queensland: "QLD",
  sa: "SA",
  "south australia": "SA",
  wa: "WA",
  "western australia": "WA",
  tas: "TAS",
  tasmania: "TAS",
  nt: "NT",
  "northern territory": "NT",
};

const ACT_DISTRICT_NAMES = new Set([
  "belconnen",
  "canberra",
  "gungahlin",
  "molonglo valley",
  "tuggeranong",
  "weston creek",
  "woden",
  "woden valley",
]);

function cleanAddressToken(value?: string | null) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normaliseAuState(value?: string | null) {
  const token = cleanAddressToken(value).toLowerCase();
  return AU_STATE_ALIASES[token] || cleanAddressToken(value).toUpperCase();
}

function inferStateFromPostcode(postcode?: string | null) {
  const pc = Number(String(postcode || "").match(/\b\d{4}\b/)?.[0] || "");
  if (!pc) return "";
  if (pc >= 2600 && pc <= 2619) return "ACT";
  if (pc >= 2900 && pc <= 2920) return "ACT";
  if (pc >= 2000 && pc <= 2599) return "NSW";
  if (pc >= 2620 && pc <= 2899) return "NSW";
  if (pc >= 3000 && pc <= 3999) return "VIC";
  if (pc >= 4000 && pc <= 4999) return "QLD";
  if (pc >= 5000 && pc <= 5799) return "SA";
  if (pc >= 6000 && pc <= 6797) return "WA";
  if (pc >= 7000 && pc <= 7799) return "TAS";
  if (pc >= 800 && pc <= 899) return "NT";
  return "";
}

function inferAddressParts(address?: string | null) {
  const text = String(address || "");
  const parts = text.split(",").map(cleanAddressToken).filter(Boolean);
  const postcodeMatches = text.match(/\b\d{4}\b/g) || [];
  const postcode = postcodeMatches[postcodeMatches.length - 1] || "";
  const postcodeIndex = postcode ? parts.findIndex((part) => new RegExp(`\\b${postcode}\\b`).test(part)) : -1;
  const stateIndex = parts.findIndex((part) => !!AU_STATE_ALIASES[part.toLowerCase()]);
  const state = stateIndex >= 0 ? normaliseAuState(parts[stateIndex]) : inferStateFromPostcode(postcode);
  let suburbIndex = stateIndex >= 0 ? stateIndex - 1 : postcodeIndex >= 0 ? postcodeIndex - 1 : parts.length - 2;

  if (suburbIndex >= 0 && ACT_DISTRICT_NAMES.has(parts[suburbIndex].toLowerCase()) && suburbIndex > 0) {
    suburbIndex -= 1;
  }

  const suburb = parts[suburbIndex] && !AU_STATE_ALIASES[parts[suburbIndex].toLowerCase()]
    ? parts[suburbIndex].replace(/\b\d{4}\b/g, "").trim()
    : "";

  return { suburb, state, postcode };
}

function addressPartsFromResult(addr: AddressResult) {
  const inferred = inferAddressParts(addr.fullAddress);
  return {
    suburb: cleanAddressToken(addr.suburb) || inferred.suburb,
    state: normaliseAuState(addr.state) || inferred.state,
    postcode: cleanAddressToken(addr.postcode) || inferred.postcode,
  };
}

// Section definitions for sidebar nav
const SECTIONS = [
  { id: "details", label: "Lead Details" },
  { id: "appointment", label: "Appointment" },
  { id: "documents", label: "Documents" },
  { id: "contract", label: "Contract" },
  { id: "finance", label: "Finance" },

  { id: "review", label: "Customer Review" },
  { id: "communications", label: "Communications" },
  { id: "activity", label: "Activity Log" },
];

const PROJECT_TEAM_STATUSES = new Set(["won", "contract", "building_authority", "construction", "completed"]);

export default function CrmLeadDetail() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const isNew = params.id === "new";
  const leadId = isNew ? undefined : Number(params.id);

  const { data: lead, isLoading } = trpc.crm.leads.get.useQuery(
    { id: leadId! },
    { enabled: !!leadId }
  );

  // Fetch competitor DA matches for this lead (for inline badge)
  const { data: competitorDas } = trpc.competitorIntel.clientMatches.getByLead.useQuery(
    { leadId: leadId! },
    { enabled: !!leadId }
  );
  const competitorDaCount = (competitorDas || []).filter((d: any) => !d.isOurs).length;

  // Fetch all notes for this lead to show count badges
  const { data: allNotes } = trpc.crm.notes.list.useQuery(
    { leadId: leadId! },
    { enabled: !!leadId }
  );
  const noteCountBySection = (allNotes || []).reduce<Record<string, number>>((acc, n: any) => {
    acc[n.section] = (acc[n.section] || 0) + 1;
    return acc;
  }, {});

  // Form state
  const [form, setForm] = useState({
    contactFirstName: "", contactLastName: "", contactPhone: "", contactEmail: "",
    contactAddress: "", clientNumber: "", suburb: "", state: "", postcode: "",
    latitude: null as number | null, longitude: null as number | null,
    detectedRegion: "",
    productType: "", leadSource: "", status: "new",
    outcome: "", designAdvisor: "", branchId: "" as string,
    sourceCreatedAt: "",
  });
  // Dynamic CRM dropdown options
  const { statusOptions } = useLeadStatusOptions();
  const { productTypes } = useProductTypeOptions();
  const { leadSources } = useLeadSourceOptions();
  const { outcomes } = useOutcomeOptions();
  const STATUS_OPTIONS = useMemo(() => {
    const byValue = new Map(FALLBACK_STATUS_OPTIONS.map((option) => [option.value, option]));
    for (const option of statusOptions) byValue.set(option.value, option);
    return Array.from(byValue.values());
  }, [statusOptions]);
  const PRODUCT_TYPES = productTypes.length > 0 ? productTypes : FALLBACK_PRODUCT_TYPES;
  const LEAD_SOURCES = leadSources.length > 0 ? leadSources : FALLBACK_LEAD_SOURCES;
  const OUTCOMES = outcomes.length > 0 ? outcomes : FALLBACK_OUTCOMES;

  const { data: branchesList } = trpc.branches.list.useQuery();
  const [mapCoords, setMapCoords] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  useEffect(() => {
    if (lead) {
      setForm({
        contactFirstName: lead.contactFirstName || "",
        contactLastName: lead.contactLastName || "",
        contactPhone: lead.contactPhone || "",
        contactEmail: lead.contactEmail || "",
        contactAddress: lead.contactAddress || "",
        clientNumber: lead.clientNumber || "",
        suburb: lead.suburb || "",
        state: lead.state || "",
        postcode: lead.postcode || "",
        latitude: lead.latitude ?? null,
        longitude: lead.longitude ?? null,
        detectedRegion: lead.detectedRegion || "",
        productType: lead.productType || "",
        leadSource: lead.leadSource || "",
        status: lead.status || "new",
        outcome: lead.outcome || "",
        designAdvisor: lead.designAdvisor || "",
        branchId: lead.branchId ? String(lead.branchId) : "",
        sourceCreatedAt: toDateInputValue(lead.sourceCreatedAt),
      });
      if (lead.latitude && lead.longitude) {
        setMapCoords({ lat: lead.latitude, lng: lead.longitude });
      }
    }
  }, [lead]);

  const utils = trpc.useUtils();
  const showProjectTeam = !isNew && !!leadId && PROJECT_TEAM_STATUSES.has(form.status);
  const projectTeamQuery = trpc.constructionClients.projectTeamByLeadId.useQuery(
    { leadId: leadId! },
    { enabled: showProjectTeam }
  );
  const updateProjectTeam = trpc.constructionClients.updateProjectTeam.useMutation({
    onSuccess: () => {
      toast.success("Project team updated");
      projectTeamQuery.refetch();
      if (leadId) utils.constructionClients.projectTeamByLeadId.invalidate({ leadId });
    },
    onError: (err) => toast.error(err.message || "Failed to update project team"),
  });
  const createMut = trpc.crm.leads.create.useMutation({
    onSuccess: (data) => {
      if (data.id === 0) {
        toast.info("Test lead ignored");
        return;
      }
      toast.success("Lead created");
      navigate(`/crm/leads/${data.id}`);
    },
    onError: (err) => toast.error(err.message || "Failed to create lead"),
  });
  const updateMut = trpc.crm.leads.update.useMutation({
    onSuccess: () => {
      toast.success("Lead saved");
      utils.crm.leads.get.invalidate({ id: leadId! });
    },
    onError: (err) => toast.error(err.message || "Failed to save lead"),
  });
  const deleteMut = trpc.crm.leads.delete.useMutation({
    onSuccess: () => {
      toast.success("Lead deleted");
      navigate("/crm/leads");
    },
  });
  const [deleteLeadOpen, setDeleteLeadOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  // Find & Merge Duplicates
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role || "");
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [selectedDupeIds, setSelectedDupeIds] = useState<Set<number>>(new Set());
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);

  const { data: duplicates, isLoading: dupesLoading, refetch: refetchDupes } = trpc.crm.leads.findDuplicates.useQuery(
    { leadId: leadId! },
    { enabled: false } // only fetch on demand
  );

  const mergeMut = trpc.crm.leads.merge.useMutation({
    onSuccess: (result) => {
      toast.success(`Merged ${result.archived} duplicate${result.archived === 1 ? "" : "s"} — ${result.transferred} records transferred`);
      setShowDuplicates(false);
      setSelectedDupeIds(new Set());
      setShowMergeConfirm(false);
      utils.crm.leads.get.invalidate({ id: leadId! });
    },
    onError: (err) => toast.error(err.message || "Merge failed"),
  });

  const handleFindDuplicates = async () => {
    setShowDuplicates(true);
    setSelectedDupeIds(new Set());
    await refetchDupes();
  };

  const toggleDupeSelect = (id: number) => {
    setSelectedDupeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const convertMut = trpc.crm.leads.convertToClient.useMutation({
    onSuccess: () => {
      toast.success("Lead converted to client (status: won)");
      utils.crm.leads.get.invalidate({ id: leadId! });
    },
    onError: (err) => toast.error(err.message),
  });

  const archiveMut = trpc.crm.leads.archive.useMutation({
    onSuccess: () => {
      toast.success("Lead archived");
      utils.crm.leads.get.invalidate({ id: leadId! });
    },
    onError: (err) => toast.error(err.message),
  });

  const unarchiveMut = trpc.crm.leads.unarchive.useMutation({
    onSuccess: () => {
      toast.success("Lead unarchived");
      utils.crm.leads.get.invalidate({ id: leadId! });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    const contactFirstName = form.contactFirstName.trim();
    const contactLastName = form.contactLastName.trim();
    const contactPhone = form.contactPhone.trim();
    const contactEmail = form.contactEmail.trim();
    if (!contactFirstName && !contactLastName) {
      toast.error("Enter at least a first or last name before creating the lead.");
      return;
    }
    if (!contactPhone && !contactEmail) {
      toast.error("Enter a phone number or email address before creating the lead.");
      return;
    }
    const payload = {
      ...form,
      contactFirstName,
      contactLastName,
      contactPhone,
      contactEmail,
      contactAddress: form.contactAddress.trim(),
      clientNumber: form.clientNumber.trim(),
      suburb: form.suburb.trim(),
      state: normaliseAuState(form.state),
      postcode: form.postcode.trim(),
      designAdvisor: form.designAdvisor.trim(),
      branchId: form.branchId ? Number(form.branchId) : null,
      sourceCreatedAt: form.sourceCreatedAt ? new Date(`${form.sourceCreatedAt}T00:00:00Z`) : null,
    };
    if (isNew) {
      createMut.mutate(payload as any);
    } else {
      updateMut.mutate({ id: leadId!, ...payload } as any);
    }
  };

  // Sidebar nav active section tracking
  const [activeSection, setActiveSection] = useState("details");
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [openSections, setOpenSections] = useState<string[]>(["details"]);

  const scrollToSection = (sectionId: string) => {
    // Open the section if not already open
    if (!openSections.includes(sectionId)) {
      setOpenSections(prev => [...prev, sectionId]);
    }
    setActiveSection(sectionId);
    // Scroll after a brief delay to allow accordion to open
    setTimeout(() => {
      const el = sectionRefs.current[sectionId];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  };

  // Section completion checks
  const sectionHasData = useMemo(() => {
    if (!lead) return {};
    return {
      details: !!(form.contactFirstName || form.contactLastName || form.contactPhone),
      appointment: !!(noteCountBySection.appointment),
      documents: false, // checked separately
      contract: !!(noteCountBySection.contract),
      finance: false,
      review: !!(noteCountBySection.customer_review),
      communications: false,
      activity: false,
    };
  }, [lead, form, noteCountBySection]);

  if (!isNew && isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading lead...</div>;
  }

  const visibleSections = isNew ? SECTIONS.filter(s => s.id === "details") : SECTIONS;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/crm/leads")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">
              {isNew ? "New Lead" : `Lead ${lead?.leadNumber || ""}`}
            </h1>
            {!isNew && lead && (
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">
                  {lead.contactFirstName} {lead.contactLastName}
                </p>
                {competitorDaCount > 0 && (
                  <Badge variant="destructive" className="text-xs gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {competitorDaCount} Competitor DA{competitorDaCount > 1 ? "s" : ""}
                  </Badge>
                )}
                {lead.status === "won" && (
                  <Link href={`/crm/leads/${lead.id}/preview`}>
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs">
                      <ExternalLink className="h-3 w-3 mr-1" />View Quotes
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isNew && lead?.status !== "won" && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setConvertOpen(true)} disabled={convertMut.isPending}>
              <UserCheck className="h-4 w-4" />
              <span className="hidden sm:inline">{convertMut.isPending ? "Converting..." : "Convert to Client"}</span>
              <span className="sm:hidden">{convertMut.isPending ? "..." : "Convert"}</span>
            </Button>
          )}
          {!isNew && isAdmin && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={handleFindDuplicates}
              disabled={dupesLoading}
            >
              {dupesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="hidden sm:inline">Find Duplicates</span>
              <span className="sm:hidden">Dupes</span>
            </Button>
          )}
          {!isNew && isAdmin && form.designAdvisor && (
            <ViewAsDaButton designAdvisorName={form.designAdvisor} />
          )}
          {!isNew && lead && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => {
                if (lead.archived) {
                  if (confirm("Unarchive this lead?")) unarchiveMut.mutate({ id: leadId! });
                } else {
                  if (confirm("Archive this lead?")) archiveMut.mutate({ id: leadId! });
                }
              }}
              disabled={archiveMut.isPending || unarchiveMut.isPending}
            >
              {(archiveMut.isPending || unarchiveMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : lead.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
              <span className="hidden sm:inline">{lead.archived ? "Unarchive" : "Archive"}</span>
            </Button>
          )}
          {!isNew && (
            <Button variant="destructive" size="sm" onClick={() => setDeleteLeadOpen(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          <Button type="button" size="sm" onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
            <Save className="h-4 w-4 mr-1" /> {isNew ? "Create" : "Save"}
          </Button>
        </div>
      </div>

      {/* Inline Duplicates Panel */}
      {showDuplicates && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <GitMerge className="h-4 w-4" />
                Potential Duplicates
                {duplicates && <Badge variant="secondary" className="text-xs">{duplicates.length} found</Badge>}
              </CardTitle>
              <div className="flex gap-2">
                {selectedDupeIds.size > 0 && (
                  <Button
                    size="sm"
                    onClick={() => setShowMergeConfirm(true)}
                    disabled={mergeMut.isPending}
                  >
                    <GitMerge className="h-3.5 w-3.5 mr-1" />
                    Merge {selectedDupeIds.size} into this lead
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => { setShowDuplicates(false); setSelectedDupeIds(new Set()); }}>
                  Dismiss
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {dupesLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching for duplicates by phone and email...
              </div>
            )}
            {!dupesLoading && duplicates && duplicates.length === 0 && (
              <p className="text-sm text-muted-foreground py-2">No potential duplicates found for this lead's phone number or email address.</p>
            )}
            {!dupesLoading && duplicates && duplicates.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-3">
                  Select duplicates below, then merge them into <strong>{lead?.contactFirstName} {lead?.contactLastName} ({lead?.leadNumber})</strong> as the primary lead.
                  All notes, appointments, documents, and other records from duplicates will be transferred.
                </p>
                <div className="rounded-md border bg-background">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="py-2 px-3 w-8">
                          <Checkbox
                            checked={duplicates.length > 0 && duplicates.every(d => selectedDupeIds.has(d.id))}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedDupeIds(new Set(duplicates.map(d => d.id)));
                              } else {
                                setSelectedDupeIds(new Set());
                              }
                            }}
                          />
                        </th>
                        <th className="text-left py-2 px-3 font-medium">Lead</th>
                        <th className="text-left py-2 px-3 font-medium">Contact</th>
                        <th className="text-left py-2 px-3 font-medium">Match</th>
                        <th className="text-left py-2 px-3 font-medium">Status</th>
                        <th className="text-left py-2 px-3 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duplicates.map((dupe) => (
                        <tr
                          key={dupe.id}
                          className={`border-b cursor-pointer transition-colors hover:bg-muted/50 ${
                            selectedDupeIds.has(dupe.id) ? "bg-primary/5" : ""
                          }`}
                          onClick={() => toggleDupeSelect(dupe.id)}
                        >
                          <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedDupeIds.has(dupe.id)}
                              onCheckedChange={() => toggleDupeSelect(dupe.id)}
                            />
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-medium">{dupe.contactFirstName} {dupe.contactLastName}</div>
                            <div className="text-xs text-muted-foreground font-mono">#{dupe.leadNumber}</div>
                          </td>
                          <td className="py-2 px-3">
                            <div className="text-xs">{dupe.contactEmail || "—"}</div>
                            <div className="text-xs text-muted-foreground">{dupe.contactPhone || "—"}</div>
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex gap-1">
                              {dupe.matchReasons.includes("phone") && (
                                <Badge variant="outline" className="text-xs gap-1 border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400">
                                  <Phone className="h-3 w-3" /> Phone
                                </Badge>
                              )}
                              {dupe.matchReasons.includes("email") && (
                                <Badge variant="outline" className="text-xs gap-1 border-green-300 text-green-700 dark:border-green-700 dark:text-green-400">
                                  <AtSign className="h-3 w-3" /> Email
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <Badge variant="secondary" className="text-xs capitalize">
                              {STATUS_OPTIONS.find(s => s.value === dupe.status)?.label || dupe.status}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-xs text-muted-foreground">
                            {(dupe as any).sourceCreatedAt || dupe.createdAt
                              ? new Date((dupe as any).sourceCreatedAt || dupe.createdAt).toLocaleDateString("en-AU")
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Hybrid Layout: Sticky Sidebar + Accordion Content */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Sticky Sidebar Nav */}
        <nav className="hidden lg:block w-52 shrink-0">
          <div className="sticky top-4 space-y-3">
            {/* Quick Status Dropdown */}
            {!isNew && (
              <div className="px-1 pb-2 border-b">
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1 block">Status</label>
                <Select
                  value={form.status}
                  onValueChange={(v) => {
                    setForm(f => ({ ...f, status: v }));
                    updateMut.mutate({ id: leadId!, status: v } as any);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
            {visibleSections.map((section) => {
              const isActive = activeSection === section.id;
              const hasData = sectionHasData[section.id as keyof typeof sectionHasData];
              const noteCount = noteCountBySection[section.id] || 0;
              return (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {hasData ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  )}
                  <span className="truncate">{section.label}</span>
                  {noteCount > 0 && (
                    <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px] leading-none ml-auto">
                      {noteCount}
                    </Badge>
                  )}
                </button>
              );
            })}
            </div>
          </div>
        </nav>

        {/* Main Content - Accordion Sections */}
        <div className="flex-1 min-w-0">
          <Accordion
            type="multiple"
            value={openSections}
            onValueChange={setOpenSections}
            className="space-y-3"
          >
            {/* Lead Details */}
            <AccordionItem value="details" className="border rounded-lg px-4">
              <div ref={(el) => { sectionRefs.current.details = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  Lead Details
                </AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-4">
                    <Card className="border-0 shadow-none">
                      <CardHeader className="pb-3 px-0"><CardTitle className="text-sm">Contact Information</CardTitle></CardHeader>
                      <CardContent className="space-y-3 px-0">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium">First Name</label>
                            <Input value={form.contactFirstName} onChange={(e) => setForm(f => ({ ...f, contactFirstName: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-medium">Last Name</label>
                            <Input value={form.contactLastName} onChange={(e) => setForm(f => ({ ...f, contactLastName: e.target.value }))} />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium">Phone</label>
                          <Input value={form.contactPhone} onChange={(e) => setForm(f => ({ ...f, contactPhone: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-medium">Email</label>
                          <Input type="email" value={form.contactEmail} onChange={(e) => setForm(f => ({ ...f, contactEmail: e.target.value }))} />
                        </div>
                        <div>
                          <label className="text-xs font-medium">Client Number</label>
                          <Input
                            value={form.clientNumber}
                            onChange={(e) => setForm(f => ({ ...f, clientNumber: e.target.value }))}
                            placeholder="e.g. RIV-190116"
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground">Xero contact account number.</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium">Address</label>
                          <AddressAutocomplete
                            value={form.contactAddress}
                            onChange={(val) => setForm(f => {
                              const parts = inferAddressParts(val);
                              const region = parts.suburb || parts.postcode || parts.state
                                ? detectRegion(parts.postcode, parts.suburb, parts.state) || ""
                                : "";
                              return {
                                ...f,
                                contactAddress: val,
                                suburb: parts.suburb || f.suburb,
                                state: parts.state || f.state,
                                postcode: parts.postcode || f.postcode,
                                detectedRegion: region || f.detectedRegion,
                              };
                            })}
                            onAddressSelect={(addr) => {
                              const parts = addressPartsFromResult(addr);
                              const region = detectRegion(parts.postcode, parts.suburb, parts.state) || "";
                              const street = addr.unitNumber
                                ? `${addr.unitNumber}/${addr.streetAddress}`
                                : (addr.streetAddress || addr.fullAddress);
                              setForm(f => ({
                                ...f,
                                contactAddress: addr.fullAddress || street,
                                suburb: parts.suburb || f.suburb,
                                state: parts.state || f.state,
                                postcode: parts.postcode || f.postcode,
                                latitude: addr.lat ?? null,
                                longitude: addr.lng ?? null,
                                detectedRegion: region || f.detectedRegion,
                              }));
                              if (addr.lat && addr.lng) {
                                const coords = { lat: addr.lat, lng: addr.lng };
                                setMapCoords(coords);
                                if (mapRef.current) {
                                  mapRef.current.setCenter(coords);
                                  mapRef.current.setZoom(16);
                                  if (markerRef.current) markerRef.current.position = coords;
                                }
                              }
                              // Auto-default branch based on closest branch by straight-line distance
                              if (addr.lat && addr.lng && branchesList && branchesList.length > 0 && !form.branchId) {
                                // Use a simple heuristic: find closest branch by name/region match
                                // For now, set to first branch if only one exists
                                if (branchesList.length === 1) {
                                  setForm(f => ({ ...f, branchId: String(branchesList[0].id) }));
                                }
                              }
                            }}
                            placeholder="Start typing an address..."
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs font-medium">Suburb</label>
                            <Input value={form.suburb} onChange={(e) => setForm(f => ({ ...f, suburb: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-medium">State</label>
                            <Input value={form.state} onChange={(e) => setForm(f => ({ ...f, state: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs font-medium">Postcode</label>
                            <Input value={form.postcode} onChange={(e) => setForm(f => ({ ...f, postcode: e.target.value }))} />
                          </div>
                        </div>
                        {form.detectedRegion && (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs font-medium text-muted-foreground">Pricing Region:</span>
                            <Badge variant="secondary">{form.detectedRegion}</Badge>
                          </div>
                        )}
                        {mapCoords && (
                          <div className="mt-3 rounded-md overflow-hidden border">
                            <MapView
                              className="h-[200px]"
                              initialCenter={mapCoords}
                              initialZoom={16}
                              onMapReady={(map) => {
                                mapRef.current = map;
                                const marker = new google.maps.marker.AdvancedMarkerElement({
                                  map,
                                  position: mapCoords,
                                  title: form.contactAddress,
                                });
                                markerRef.current = marker;
                              }}
                            />
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className="border-0 shadow-none">
                      <CardHeader className="pb-3 px-0"><CardTitle className="text-sm">Lead Information</CardTitle></CardHeader>
                      <CardContent className="space-y-3 px-0">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium">Product Type</label>
                            <Select value={form.productType} onValueChange={(v) => setForm(f => ({ ...f, productType: v }))}>
                              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>
                                {PRODUCT_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-xs font-medium">Lead Source</label>
                            <Select value={form.leadSource} onValueChange={(v) => setForm(f => ({ ...f, leadSource: v }))}>
                              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>
                                {LEAD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium">Status</label>
                            <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <label className="text-xs font-medium">Outcome</label>
                            <Select value={form.outcome} onValueChange={(v) => setForm(f => ({ ...f, outcome: v }))}>
                              <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>
                                {OUTCOMES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium">Design Advisor</label>
                          <DesignAdvisorSelect value={form.designAdvisor} onChange={(v) => setForm(f => ({ ...f, designAdvisor: v }))} />
                        </div>
                        <div>
                          <label className="text-xs font-medium">Date Created</label>
                          <Input
                            type="date"
                            value={form.sourceCreatedAt}
                            onChange={(e) => setForm(f => ({ ...f, sourceCreatedAt: e.target.value }))}
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground">Created date from the inbound lead sheet/Zapier feed.</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium">Branch</label>
                          <Select value={form.branchId || "none"} onValueChange={(v) => setForm(f => ({ ...f, branchId: v === "none" ? "" : v }))}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select branch" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No branch assigned</SelectItem>
                              {(branchesList || []).map((b: any) => (
                                <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {showProjectTeam && (
                    <div className="pb-4">
                      {projectTeamQuery.isLoading ? (
                        <Card>
                          <CardContent className="py-6 text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading linked construction job...
                          </CardContent>
                        </Card>
                      ) : projectTeamQuery.data ? (
                        <ProjectTeamFields
                          value={projectTeamQuery.data}
                          linkedJobLabel={`Linked job #${projectTeamQuery.data.jobId}${projectTeamQuery.data.quoteNumber ? ` - Quote ${projectTeamQuery.data.quoteNumber}` : ""}`}
                          description="Assign the construction handover team for this client from users, or enter a non-user name."
                          saving={updateProjectTeam.isPending}
                          onSave={(data) => updateProjectTeam.mutate({ jobId: projectTeamQuery.data!.jobId, ...data })}
                        />
                      ) : (
                        <Card>
                          <CardContent className="py-6">
                            <p className="text-sm font-medium">No linked construction job yet</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Construction Manager and Technical Designer assignments are saved against the construction job once this client reaches the contract handover stage.
                            </p>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}

                  {/* Email Correspondence - visible to office_user, admin, super_admin only */}
                  {!isNew && (user?.role === "office_user" || user?.role === "admin" || user?.role === "super_admin") && (
                    <div className="border-t pt-4 mt-2">
                      <h4 className="text-sm font-medium mb-2">Email Correspondence</h4>
                      <div className="flex flex-wrap gap-2">
                        <IntroLetterButton
                          leadId={leadId!}
                          letterType="unassigned_intro"
                          label="Send Unassigned Intro Letter"
                          leadEmail={form.contactEmail}
                          leadName={`${form.contactFirstName} ${form.contactLastName}`.trim()}
                        />
                        <IntroLetterButton
                          leadId={leadId!}
                          letterType="assigned_intro"
                          label="Send Assigned Intro Letter"
                          leadEmail={form.contactEmail}
                          leadName={`${form.contactFirstName} ${form.contactLastName}`.trim()}
                        />
                      </div>
                      {!form.contactEmail && <p className="text-xs text-muted-foreground mt-2">Add an email address to the lead to enable sending.</p>}
                    </div>
                  )}

                  {/* Notes */}
                  {!isNew && <NotesSection leadId={leadId!} />}
                  {!isNew && <LeadSectionNotes leadId={leadId!} section="spec_internal" title="Spec Internal Notes" />}
                </AccordionContent>
              </div>
            </AccordionItem>

            {/* Appointment */}
            {!isNew && (
              <AccordionItem value="appointment" className="border rounded-lg px-4">
                <div ref={(el) => { sectionRefs.current.appointment = el; }}>
                  <AccordionTrigger className="text-base font-semibold py-4">
                    <span className="flex items-center gap-2">
                      Appointment
                      {noteCountBySection.appointment ? <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">{noteCountBySection.appointment}</Badge> : null}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <AppointmentTab leadId={leadId!} />
                  </AccordionContent>
                </div>
              </AccordionItem>
            )}

            {/* Documents */}
            {!isNew && (
              <AccordionItem value="documents" className="border rounded-lg px-4">
                <div ref={(el) => { sectionRefs.current.documents = el; }}>
                  <AccordionTrigger className="text-base font-semibold py-4">Documents</AccordionTrigger>
                  <AccordionContent>
                    <DocumentsTab leadId={leadId!} />
                  </AccordionContent>
                </div>
              </AccordionItem>
            )}

            {/* Contract */}
            {!isNew && (
              <AccordionItem value="contract" className="border rounded-lg px-4">
                <div ref={(el) => { sectionRefs.current.contract = el; }}>
                  <AccordionTrigger className="text-base font-semibold py-4">
                    <span className="flex items-center gap-2">
                      Contract
                      {noteCountBySection.contract ? <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">{noteCountBySection.contract}</Badge> : null}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ContractTab leadId={leadId!} leadEmail={lead?.contactEmail || ""} leadName={`${lead?.contactFirstName || ""} ${lead?.contactLastName || ""}`.trim()} />
                  </AccordionContent>
                </div>
              </AccordionItem>
            )}

            {/* Finance */}
            {!isNew && (
              <AccordionItem value="finance" className="border rounded-lg px-4">
                <div ref={(el) => { sectionRefs.current.finance = el; }}>
                  <AccordionTrigger className="text-base font-semibold py-4">
                    <span className="flex items-center gap-2">
                      Finance
                      {noteCountBySection.finance ? <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">{noteCountBySection.finance}</Badge> : null}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <FinanceTab leadId={leadId!} />
                  </AccordionContent>
                </div>
              </AccordionItem>
            )}

            {/* Approvals */}
            {/* Approvals has been moved to Construction Clients detail page */}

            {/* Customer Review */}
            {!isNew && (
              <AccordionItem value="review" className="border rounded-lg px-4">
                <div ref={(el) => { sectionRefs.current.review = el; }}>
                  <AccordionTrigger className="text-base font-semibold py-4">
                    <span className="flex items-center gap-2">
                      Customer Review
                      {noteCountBySection.customer_review ? <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[10px]">{noteCountBySection.customer_review}</Badge> : null}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <CustomerReviewTab leadId={leadId!} lead={lead ? { contactFirstName: lead.contactFirstName || undefined, contactLastName: lead.contactLastName || undefined, contactEmail: lead.contactEmail || undefined, contactPhone: lead.contactPhone || undefined, contactAddress: lead.contactAddress || undefined } : undefined} />
                  </AccordionContent>
                </div>
              </AccordionItem>
            )}

            {/* Communications */}
            {!isNew && (
              <AccordionItem value="communications" className="border rounded-lg px-4">
                <div ref={(el) => { sectionRefs.current.communications = el; }}>
                  <AccordionTrigger className="text-base font-semibold py-4">
                    <span className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" /> Communications
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <CommunicationsTab
                      leadId={leadId!}
                      leadPhone={lead?.contactPhone || ""}
                      leadName={`${lead?.contactFirstName || ""} ${lead?.contactLastName || ""}`.trim()}
                      branchId={form.branchId ? Number(form.branchId) : null}
                    />
                  </AccordionContent>
                </div>
              </AccordionItem>
            )}

            {/* Activity Log */}
            {!isNew && (
              <AccordionItem value="activity" className="border rounded-lg px-4">
                <div ref={(el) => { sectionRefs.current.activity = el; }}>
                  <AccordionTrigger className="text-base font-semibold py-4">Activity Log</AccordionTrigger>
                  <AccordionContent>
                    <ActivityTab leadId={leadId!} />
                    {/* Show construction activities if this lead is linked to a construction job */}
                    <LinkedConstructionActivities leadId={leadId!} />
                  </AccordionContent>
                </div>
              </AccordionItem>
            )}
          </Accordion>
        </div>
      </div>

      <ConfirmDeleteDialog
        open={deleteLeadOpen}
        onOpenChange={setDeleteLeadOpen}
        onConfirm={() => { deleteMut.mutate({ id: leadId! }); setDeleteLeadOpen(false); }}
        title="Delete Lead?"
        description="This will permanently delete this lead and all associated data (notes, appointments, documents). This action cannot be undone."
      />
      <ConfirmDeleteDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        onConfirm={() => { convertMut.mutate({ id: leadId! }); setConvertOpen(false); }}
        title="Convert to Client?"
        description="This will change the lead status to 'won' and convert it to a client record."
        confirmLabel="Convert to Client"
      />

      {/* Merge Confirmation Dialog */}
      <Dialog open={showMergeConfirm} onOpenChange={setShowMergeConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5" /> Confirm Lead Merge
            </DialogTitle>
            <DialogDescription>
              This will merge <strong>{selectedDupeIds.size} duplicate lead{selectedDupeIds.size !== 1 ? "s" : ""}</strong> into{" "}
              <strong>{lead?.contactFirstName} {lead?.contactLastName} ({lead?.leadNumber})</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm">The following will happen:</p>
            <ul className="text-sm space-y-1 list-disc pl-5 text-muted-foreground">
              <li>All notes, appointments, documents, contracts, and other records from the duplicate leads will be transferred to this lead.</li>
              <li>The duplicate leads will be archived (not permanently deleted).</li>
              <li>This lead's contact details will remain unchanged.</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMergeConfirm(false)} disabled={mergeMut.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => mergeMut.mutate({ primaryId: leadId!, duplicateIds: Array.from(selectedDupeIds) })}
              disabled={mergeMut.isPending}
            >
              {mergeMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Merging...</> : <>Merge {selectedDupeIds.size} Lead{selectedDupeIds.size !== 1 ? "s" : ""}</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Notes Section ──────────────────────────────────────────────────────────
function NotesSection({ leadId }: { leadId: number }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: notes, isLoading } = trpc.crm.notes.list.useQuery({ leadId, section: "general" });
  const [newNote, setNewNote] = useState("");

  const createMut = trpc.crm.notes.create.useMutation({
    onSuccess: () => {
      setNewNote("");
      utils.crm.notes.list.invalidate({ leadId, section: "general" });
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = trpc.crm.notes.delete.useMutation({
    onSuccess: () => {
      utils.crm.notes.list.invalidate({ leadId, section: "general" });
      toast.success("Note deleted");
    },
  });
  const [deleteNoteTarget, setDeleteNoteTarget] = useState<number | null>(null);
  const pinMut = trpc.crm.notes.togglePin.useMutation({
    onSuccess: () => {
      utils.crm.notes.list.invalidate({ leadId, section: "general" });
    },
  });

  const handleSubmit = () => {
    if (!newNote.trim()) return;
    createMut.mutate({ leadId, section: "general", content: newNote.trim() });
  };

  return (
    <>
    <div className="border-t pt-4 mt-4">
      <h4 className="text-sm font-medium mb-3">Notes</h4>
      <div className="space-y-3">
        <div className="flex gap-2">
          <Textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note..."
            rows={2}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!newNote.trim() || createMut.isPending}
            className="self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Press Ctrl+Enter to submit</p>

        {isLoading && <p className="text-sm text-muted-foreground">Loading notes...</p>}
        {notes && notes.length === 0 && (
          <p className="text-sm text-muted-foreground italic">No notes yet.</p>
        )}
        {notes && notes.length > 0 && (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {notes.map((note: any) => (
              <div key={note.id} className={`border rounded-md p-3 ${note.pinned ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800" : "bg-muted/30"}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {note.pinned && <Pin className="h-3 w-3 text-amber-600" />}
                    <span className="text-xs font-semibold">{note.userName}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(note.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-6 w-6 p-0 ${note.pinned ? "text-amber-600" : "text-muted-foreground hover:text-amber-600"}`}
                      onClick={() => pinMut.mutate({ id: note.id, pinned: !note.pinned })}
                      title={note.pinned ? "Unpin" : "Pin to top"}
                    >
                      <Pin className="h-3 w-3" />
                    </Button>
                    {(user?.role === "admin" || user?.role === "super_admin" || user?.id === note.userId) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteNoteTarget(note.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    <ConfirmDeleteDialog
      open={deleteNoteTarget !== null}
      onOpenChange={(o) => { if (!o) setDeleteNoteTarget(null); }}
      onConfirm={() => { if (deleteNoteTarget) { deleteMut.mutate({ id: deleteNoteTarget }); setDeleteNoteTarget(null); } }}
      title="Delete Note?"
      description="This will permanently remove this note."
    />
    </>
  );
}

type AppointmentParticipant = { name?: string; email: string };

const emptyAppointmentForm = {
  appointmentType: "",
  appointmentDate: "",
  appointmentTime: "",
  duration: "60",
  location: "",
  notes: "",
  outcome: "",
  participantsText: "",
};

function parseParticipants(value: string): AppointmentParticipant[] {
  return value
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const angleMatch = line.match(/^(.*?)<([^>]+)>$/);
      if (angleMatch) {
        return { name: angleMatch[1].trim() || undefined, email: angleMatch[2].trim() };
      }

      const commaMatch = line.match(/^(.+),\s*([^,\s]+@[^,\s]+)$/);
      if (commaMatch) {
        return { name: commaMatch[1].trim() || undefined, email: commaMatch[2].trim() };
      }

      return { email: line };
    });
}

function formatParticipants(participants?: AppointmentParticipant[] | null) {
  return (participants || [])
    .map((participant) => participant.name ? `${participant.name} <${participant.email}>` : participant.email)
    .join("\n");
}

// ─── Appointment Tab ────────────────────────────────────────────────────────
function AppointmentTab({ leadId }: { leadId: number }) {
  const { data: appointments, isLoading } = trpc.crm.appointments.list.useQuery({ leadId });
  const utils = trpc.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [editingAppointmentId, setEditingAppointmentId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyAppointmentForm);
  const { appointmentTypes } = useAppointmentTypeOptions();

  const resetForm = () => {
    setForm(emptyAppointmentForm);
    setEditingAppointmentId(null);
    setShowForm(false);
  };

  const createMut = trpc.crm.appointments.create.useMutation({
    onSuccess: () => {
      toast.success("Appointment added");
      utils.crm.appointments.list.invalidate({ leadId });
      resetForm();
    },
  });
  const updateMut = trpc.crm.appointments.update.useMutation({
    onSuccess: () => {
      toast.success("Appointment updated");
      utils.crm.appointments.list.invalidate({ leadId });
      resetForm();
    },
  });
  const retryMut = trpc.crm.appointments.retryCalendarSync.useMutation({
    onSuccess: () => {
      toast.success("Calendar sync retried");
      utils.crm.appointments.list.invalidate({ leadId });
    },
    onError: (error) => {
      toast.error(error.message || "Calendar retry failed");
      utils.crm.appointments.list.invalidate({ leadId });
    },
  });
  const deleteMut = trpc.crm.appointments.delete.useMutation({
    onSuccess: () => { toast.success("Deleted"); utils.crm.appointments.list.invalidate({ leadId }); }
  });
  const [deleteAptTarget, setDeleteAptTarget] = useState<number | null>(null);

  const openNewForm = () => {
    setEditingAppointmentId(null);
    setForm(emptyAppointmentForm);
    setShowForm(true);
  };

  const openEditForm = (apt: any) => {
    setEditingAppointmentId(apt.id);
    setForm({
      appointmentType: apt.appointmentType || "",
      appointmentDate: apt.appointmentDate || "",
      appointmentTime: apt.appointmentTime || "",
      duration: String(apt.duration || 60),
      location: apt.location || "",
      notes: apt.notes || "",
      outcome: apt.outcome || "",
      participantsText: formatParticipants(apt.participants as AppointmentParticipant[] | null),
    });
    setShowForm(true);
  };

  const handleSaveAppointment = () => {
    const duration = Number(form.duration) > 0 ? Number(form.duration) : 60;
    const participants = parseParticipants(form.participantsText);
    const payload = {
      appointmentType: form.appointmentType || undefined,
      appointmentDate: form.appointmentDate || undefined,
      appointmentTime: form.appointmentTime || undefined,
      duration,
      location: form.location || undefined,
      notes: form.notes || undefined,
      outcome: form.outcome || undefined,
      participants,
    };

    if (editingAppointmentId) {
      updateMut.mutate({ id: editingAppointmentId, ...payload });
      return;
    }

    createMut.mutate({ leadId, ...payload });
  };

  const saving = createMut.isPending || updateMut.isPending;

  return (
    <>
    <div className="space-y-3 pb-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Appointments</h4>
        <Button size="sm" onClick={openNewForm}><Plus className="h-3 w-3 mr-1" /> Add</Button>
      </div>
      {showForm && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <div>
            <label className="text-xs font-medium">Appointment Type</label>
            <Select value={form.appointmentType} onValueChange={(v) => setForm(f => ({ ...f, appointmentType: v }))}>
              <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
              <SelectContent>
                {appointmentTypes.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Input type="date" value={form.appointmentDate} onChange={(e) => setForm(f => ({ ...f, appointmentDate: e.target.value }))} placeholder="Date" />
            <Input type="time" value={form.appointmentTime} onChange={(e) => setForm(f => ({ ...f, appointmentTime: e.target.value }))} placeholder="Time" />
            <Input type="number" min="15" step="15" value={form.duration} onChange={(e) => setForm(f => ({ ...f, duration: e.target.value }))} placeholder="Duration" />
          </div>
          <Input value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Location" />
          <Textarea
            value={form.participantsText}
            onChange={(e) => setForm(f => ({ ...f, participantsText: e.target.value }))}
            placeholder="Jane Client <jane@example.com>&#10;john@example.com"
            rows={3}
          />
          <Textarea value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes" rows={2} />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveAppointment} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
              {editingAppointmentId ? "Update" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancel</Button>
          </div>
        </div>
      )}
      {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> :
        !appointments || appointments.length === 0 ? <p className="text-sm text-muted-foreground">No appointments yet.</p> :
        appointments.map((apt) => {
          const participants = (apt.participants || []) as AppointmentParticipant[];
          const syncFailed = apt.calendarSyncStatus === "failed";
          const syncPending = apt.calendarSyncStatus === "pending";

          return (
            <div key={apt.id} className="border rounded-lg p-3 space-y-3">
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">
                    {apt.appointmentType && <Badge variant="outline" className="mr-2 text-xs">{appointmentTypes.find(t => t.value === apt.appointmentType)?.label || apt.appointmentType}</Badge>}
                    {apt.appointmentDate} {apt.appointmentTime && `at ${apt.appointmentTime}`}
                  </div>
                  {apt.location && <div className="text-xs text-muted-foreground">{apt.location}</div>}
                  {participants.length > 0 && (
                    <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span className="break-words">
                        {participants.map((participant) => participant.name ? `${participant.name} <${participant.email}>` : participant.email).join(", ")}
                      </span>
                    </div>
                  )}
                  {apt.notes && <div className="text-xs mt-1">{apt.notes}</div>}
                  {apt.outcome && <Badge className="mt-1 text-xs">{apt.outcome}</Badge>}
                  {syncPending && (
                    <Badge variant="outline" className="mt-2 text-xs border-amber-300 text-amber-700">
                      Calendar sync pending
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEditForm(apt)} title="Edit appointment">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteAptTarget(apt.id)} title="Delete appointment">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {syncFailed && (
                <div className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="break-words">{apt.calendarSyncError || "Calendar sync failed"}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => retryMut.mutate({ id: apt.id })}
                    disabled={retryMut.isPending}
                    className="h-8 border-red-200 bg-white text-red-700 hover:bg-red-100 dark:bg-red-950"
                  >
                    {retryMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    Retry
                  </Button>
                </div>
              )}
            </div>
          );
        })
      }
      <LeadSectionNotes leadId={leadId} section="appointment" />
    </div>
    <ConfirmDeleteDialog
      open={deleteAptTarget !== null}
      onOpenChange={(o) => { if (!o) setDeleteAptTarget(null); }}
      onConfirm={() => { if (deleteAptTarget) { deleteMut.mutate({ id: deleteAptTarget }); setDeleteAptTarget(null); } }}
      title="Delete Appointment?"
      description="This will permanently remove this appointment."
    />
    </>
  );
}

// ─── Documents Tab ──────────────────────────────────────────────────────────
function DocumentsTab({ leadId }: { leadId: number }) {
  const { data: docs, isLoading } = trpc.crm.documents.list.useQuery({ leadId });
  const utils = trpc.useUtils();
  const uploadMut = trpc.crm.documents.upload.useMutation({
    onSuccess: () => { toast.success("Document uploaded"); utils.crm.documents.list.invalidate({ leadId }); }
  });
  const deleteMut = trpc.crm.documents.delete.useMutation({
    onSuccess: () => { toast.success("Deleted"); utils.crm.documents.list.invalidate({ leadId }); }
  });
  const [deleteDocTarget, setDeleteDocTarget] = useState<number | null>(null);
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadMut.mutate({ leadId, fileName: file.name, fileBase64: base64, contentType: file.type });
    };
    reader.readAsDataURL(file);
  };
  return (
    <>
    <div className="space-y-3 pb-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Documents</h4>
        <label className="cursor-pointer">
          <Button size="sm" asChild><span><Plus className="h-3 w-3 mr-1" /> Upload</span></Button>
          <input type="file" className="hidden" onChange={handleUpload} />
        </label>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> :
        !docs || docs.length === 0 ? <p className="text-sm text-muted-foreground">No documents yet.</p> :
        <div className="space-y-2">
          {docs.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between border rounded p-2">
              <a href={doc.fileUrl} target="_blank" rel="noopener" className="text-sm text-blue-600 hover:underline">{doc.fileName}</a>
              <Button variant="ghost" size="sm" onClick={() => setDeleteDocTarget(doc.id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      }
    </div>
    <ConfirmDeleteDialog
      open={deleteDocTarget !== null}
      onOpenChange={(o) => { if (!o) setDeleteDocTarget(null); }}
      onConfirm={() => { if (deleteDocTarget) { deleteMut.mutate({ id: deleteDocTarget }); setDeleteDocTarget(null); } }}
      title="Delete Document?"
      description="This will permanently remove this document."
    />
    </>
  );
}

// ─── Contract Tab ───────────────────────────────────────────────────────────
function ContractTab({ leadId, leadEmail, leadName }: { leadId: number; leadEmail: string; leadName: string }) {
  const { data: contract } = trpc.crm.contracts.get.useQuery({ leadId });
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ contractDate: "", contractValue: "", depositAmount: "", depositDate: "", paymentSchedule: "", welcomeLetterSent: false, welcomeLetterDate: "", notes: "" });
  const [sendingWelcome, setSendingWelcome] = useState(false);
  const sendLetterMut = trpc.crm.sendLetter.useMutation();

  useEffect(() => {
    if (contract) {
      setForm({
        contractDate: contract.contractDate || "",
        contractValue: contract.contractValue || "",
        depositAmount: contract.depositAmount || "",
        depositDate: contract.depositDate || "",
        paymentSchedule: contract.paymentSchedule || "",
        welcomeLetterSent: contract.welcomeLetterSent || false,
        welcomeLetterDate: contract.welcomeLetterDate || "",
        notes: contract.notes || "",
      });
    }
  }, [contract]);

  const upsertMut = trpc.crm.contracts.upsert.useMutation({
    onSuccess: () => { toast.success("Contract saved"); utils.crm.contracts.get.invalidate({ leadId }); }
  });

  return (
    <div className="space-y-3 pb-4">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs font-medium">Contract Date</label>
          <div className="flex gap-1 items-center">
            <Input type="date" value={form.contractDate} onChange={(e) => setForm(f => ({ ...f, contractDate: e.target.value }))} className="flex-1" />
            {form.contractDate && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-destructive" onClick={() => setForm(f => ({ ...f, contractDate: "" }))} title="Clear date">&times;</Button>}
          </div>
        </div>
        <div><label className="text-xs font-medium">Contract Value ($)</label><Input type="number" value={form.contractValue} onChange={(e) => setForm(f => ({ ...f, contractValue: e.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs font-medium">Deposit Amount ($)</label><Input type="number" value={form.depositAmount} onChange={(e) => setForm(f => ({ ...f, depositAmount: e.target.value }))} /></div>
        <div><label className="text-xs font-medium">Deposit Date</label>
          <div className="flex gap-1 items-center">
            <Input type="date" value={form.depositDate} onChange={(e) => setForm(f => ({ ...f, depositDate: e.target.value }))} className="flex-1" />
            {form.depositDate && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-destructive" onClick={() => setForm(f => ({ ...f, depositDate: "" }))} title="Clear date">&times;</Button>}
          </div>
        </div>
      </div>
      <div><label className="text-xs font-medium">Payment Schedule</label><Textarea value={form.paymentSchedule} onChange={(e) => setForm(f => ({ ...f, paymentSchedule: e.target.value }))} rows={2} /></div>
      <div className="flex items-center gap-2">
        <Checkbox checked={form.welcomeLetterSent} onCheckedChange={(v) => setForm(f => ({ ...f, welcomeLetterSent: !!v }))} />
        <label className="text-sm">Welcome Letter Sent</label>
        {form.welcomeLetterSent && (
          <div className="flex gap-1 items-center ml-2">
            <Input type="date" className="w-40" value={form.welcomeLetterDate} onChange={(e) => setForm(f => ({ ...f, welcomeLetterDate: e.target.value }))} />
            {form.welcomeLetterDate && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-destructive" onClick={() => setForm(f => ({ ...f, welcomeLetterDate: "" }))} title="Clear date">&times;</Button>}
          </div>
        )}
      </div>
      <div className="pt-2 border-t">
        <Button
          variant="outline"
          size="sm"
          disabled={!leadEmail || sendingWelcome}
          onClick={async () => {
            if (!leadEmail) { toast.error("No email address on lead"); return; }
            setSendingWelcome(true);
            try {
              const res = await sendLetterMut.mutateAsync({
                leadId, letterType: "welcome_letter", to: leadEmail, clientName: leadName,
              });
              if (res.success) {
                toast.success("Welcome letter sent to " + leadEmail);
                setForm(f => ({ ...f, welcomeLetterSent: true, welcomeLetterDate: new Date().toISOString().split("T")[0] }));
              } else {
                toast.error(res.error || "Failed to send");
              }
            } catch (e: any) {
              toast.error(e.message || "Error sending welcome letter");
            } finally {
              setSendingWelcome(false);
            }
          }}
        >
          <Mail className="h-4 w-4 mr-1" /> Send Welcome Letter
        </Button>
        {!leadEmail && <p className="text-xs text-muted-foreground mt-1">Add an email address to the lead to enable sending.</p>}
      </div>
      <Button onClick={() => upsertMut.mutate({ leadId, ...form })} disabled={upsertMut.isPending}><Save className="h-4 w-4 mr-1" /> Save Contract</Button>
      <LeadSectionNotes leadId={leadId} section="contract" />
    </div>
  );
}

// ─── Finance Tab ────────────────────────────────────────────────────────────
function FinanceTab({ leadId }: { leadId: number }) {
  const { data: contract } = trpc.crm.contracts.get.useQuery({ leadId });
  return (
    <div className="space-y-4 pb-4">
      {!contract ? <p className="text-sm text-muted-foreground">No contract data yet. Complete the Contract section first.</p> : (
        <div className="grid grid-cols-2 gap-4">
          <div className="border rounded p-3">
            <div className="text-xs text-muted-foreground">Contract Value</div>
            <div className="text-xl font-bold">${Number(contract.contractValue || 0).toLocaleString()}</div>
          </div>
          <div className="border rounded p-3">
            <div className="text-xs text-muted-foreground">Deposit</div>
            <div className="text-xl font-bold">${Number(contract.depositAmount || 0).toLocaleString()}</div>
          </div>
          <div className="border rounded p-3">
            <div className="text-xs text-muted-foreground">Balance</div>
            <div className="text-xl font-bold">${(Number(contract.contractValue || 0) - Number(contract.depositAmount || 0)).toLocaleString()}</div>
          </div>
          <div className="border rounded p-3">
            <div className="text-xs text-muted-foreground">Deposit Date</div>
            <div className="text-lg font-medium">{contract.depositDate || "—"}</div>
          </div>
        </div>
      )}
      <LeadSectionNotes leadId={leadId} section="finance" />
    </div>
  );
}

// ─── Approvals Tab (moved to ConstructionClientDetail) ──────────────────────
// The Approvals tab has been moved to the Construction Clients detail page.
// See ConstructionClientDetail.tsx > BuildingAuthoritySection for the current implementation.

// ─── Customer Review Tab ────────────────────────────────────────────────────
function CustomerReviewTab({ leadId, lead }: { leadId: number; lead?: { contactFirstName?: string; contactLastName?: string; contactEmail?: string; contactPhone?: string; contactAddress?: string } }) {
  // ─── Internal Review Data (existing) ─────────────────────────────────────
  const { data } = trpc.crm.customerReviews.get.useQuery({ leadId });
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ projectCompletedDate: "", warrantyReceivedDate: "", homeAdditionType: "", additionDescription: "", serviceRating: 0, workmanshipRating: 0, satisfactionRating: 0, designConsultantRating: 0, customerComments: "" });

  useEffect(() => {
    if (data) {
      setForm({
        projectCompletedDate: data.projectCompletedDate || "",
        warrantyReceivedDate: data.warrantyReceivedDate || "",
        homeAdditionType: data.homeAdditionType || "",
        additionDescription: data.additionDescription || "",
        serviceRating: data.serviceRating || 0,
        workmanshipRating: data.workmanshipRating || 0,
        satisfactionRating: data.satisfactionRating || 0,
        designConsultantRating: data.designConsultantRating || 0,
        customerComments: data.customerComments || "",
      });
    }
  }, [data]);

  const upsertMut = trpc.crm.customerReviews.upsert.useMutation({
    onSuccess: () => { toast.success("Saved"); utils.crm.customerReviews.get.invalidate({ leadId }); }
  });

  // ─── Google Reviews (from Climbo) ────────────────────────────────────────
  const { data: googleReviewsData } = trpc.reviews.list.useQuery({ leadId });
  const googleReviews = googleReviewsData?.rows;
  const { data: climboAccountsList } = trpc.reviews.climboAccounts.list.useQuery();
  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const requestMut = trpc.reviews.requestReview.useMutation({
    onSuccess: () => { toast.success("Review request sent via Climbo"); },
    onError: (err) => toast.error(err.message),
  });

  const activeAccounts = climboAccountsList?.filter((a: any) => a.active && a.webhookUrl) || [];

  const StarRating = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
    <div>
      <label className="text-xs font-medium">{label}</label>
      <div className="flex gap-1 mt-1">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => onChange(n)} className="focus:outline-none">
            <Star className={`h-5 w-5 ${n <= value ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
          </button>
        ))}
      </div>
    </div>
  );

  const StarDisplay = ({ rating }: { rating: number }) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} className={`h-4 w-4 ${n <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`} />
      ))}
    </div>
  );

  return (
    <div className="space-y-4 pb-4">
      {/* ─── Request Google Review ─── */}
      <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Send className="h-4 w-4" /> Request Google Review
        </h4>
        {activeAccounts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active Climbo accounts with webhook configured. Go to Admin → Climbo Settings to set up.</p>
        ) : (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium">Climbo Account</label>
              <Select value={selectedAccount?.toString() || ""} onValueChange={(v) => setSelectedAccount(Number(v))}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select account..." />
                </SelectTrigger>
                <SelectContent>
                  {activeAccounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id.toString()}>{a.name} {a.region ? `(${a.region})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              disabled={!selectedAccount || requestMut.isPending || !lead?.contactEmail}
              onClick={() => {
                if (!selectedAccount || !lead) return;
                requestMut.mutate({
                  leadId,
                  clientName: `${lead.contactFirstName || ""} ${lead.contactLastName || ""}`.trim(),
                  clientEmail: lead.contactEmail || "",
                  clientPhone: lead.contactPhone || "",
                  siteAddress: lead.contactAddress || "",
                  climboAccountId: selectedAccount,
                });
              }}
            >
              <Send className="h-3 w-3 mr-1" />
              {requestMut.isPending ? "Sending..." : "Send Request"}
            </Button>
          </div>
        )}
        {!lead?.contactEmail && (
          <p className="text-xs text-amber-600">Lead has no email address — review request requires an email.</p>
        )}
      </div>

      {/* ─── Google Reviews Received ─── */}
      {googleReviews && googleReviews.length > 0 && (
        <div className="border rounded-lg p-3 space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> Google Reviews ({googleReviews.length})
          </h4>
          {googleReviews.map((r: any) => (
            <div key={r.id} className="border-b last:border-0 pb-2 last:pb-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{r.reviewerName || "Anonymous"}</span>
                <StarDisplay rating={r.rating} />
              </div>
              {r.reviewText && <p className="text-xs text-muted-foreground mt-1">{r.reviewText}</p>}
              {r.reviewDate && <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(r.reviewDate).toLocaleDateString()}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ─── Internal Review Form (existing) ─── */}
      <div className="border rounded-lg p-3 space-y-3">
        <h4 className="text-sm font-semibold">Internal Review</h4>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium">Project Completed</label>
            <div className="flex gap-1 items-center">
              <Input type="date" value={form.projectCompletedDate} onChange={(e) => setForm(f => ({ ...f, projectCompletedDate: e.target.value }))} className="flex-1" />
              {form.projectCompletedDate && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-destructive" onClick={() => setForm(f => ({ ...f, projectCompletedDate: "" }))} title="Clear date">&times;</Button>}
            </div>
          </div>
          <div><label className="text-xs font-medium">Warranty Received</label>
            <div className="flex gap-1 items-center">
              <Input type="date" value={form.warrantyReceivedDate} onChange={(e) => setForm(f => ({ ...f, warrantyReceivedDate: e.target.value }))} className="flex-1" />
              {form.warrantyReceivedDate && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-destructive" onClick={() => setForm(f => ({ ...f, warrantyReceivedDate: "" }))} title="Clear date">&times;</Button>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-medium">Home Addition Type</label><Input value={form.homeAdditionType} onChange={(e) => setForm(f => ({ ...f, homeAdditionType: e.target.value }))} /></div>
          <div><label className="text-xs font-medium">Description</label><Input value={form.additionDescription} onChange={(e) => setForm(f => ({ ...f, additionDescription: e.target.value }))} /></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StarRating label="Service" value={form.serviceRating} onChange={(v) => setForm(f => ({ ...f, serviceRating: v }))} />
          <StarRating label="Workmanship" value={form.workmanshipRating} onChange={(v) => setForm(f => ({ ...f, workmanshipRating: v }))} />
          <StarRating label="Satisfaction" value={form.satisfactionRating} onChange={(v) => setForm(f => ({ ...f, satisfactionRating: v }))} />
          <StarRating label="Design Consultant" value={form.designConsultantRating} onChange={(v) => setForm(f => ({ ...f, designConsultantRating: v }))} />
        </div>
        <div><label className="text-xs font-medium">Customer Comments</label><Textarea value={form.customerComments} onChange={(e) => setForm(f => ({ ...f, customerComments: e.target.value }))} rows={3} /></div>
        <Button onClick={() => upsertMut.mutate({ leadId, ...form })} disabled={upsertMut.isPending}><Save className="h-4 w-4 mr-1" /> Save</Button>
      </div>
      <LeadSectionNotes leadId={leadId} section="customer_review" />
    </div>
  );
}

// ─── Activity Log Tab ───────────────────────────────────────────────────────
function ActivityTab({ leadId }: { leadId: number }) {
  const { data: activities, isLoading } = trpc.crm.activities.list.useQuery({ leadId });
  const utils = trpc.useUtils();
  const [form, setForm] = useState({ activityType: "", description: "" });

  const createMut = trpc.crm.activities.create.useMutation({
    onSuccess: () => { toast.success("Activity logged"); utils.crm.activities.list.invalidate({ leadId }); setForm({ activityType: "", description: "" }); }
  });

  return (
    <div className="space-y-3 pb-4">
      <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
        <div className="grid grid-cols-3 gap-2">
          <Select value={form.activityType} onValueChange={(v) => setForm(f => ({ ...f, activityType: v }))}>
            <SelectTrigger><SelectValue placeholder="Activity type..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="call">Phone Call</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="meeting">Meeting</SelectItem>
              <SelectItem value="note">Note</SelectItem>
              <SelectItem value="status_change">Status Change</SelectItem>
              <SelectItem value="document">Document</SelectItem>
            </SelectContent>
          </Select>
          <Input className="col-span-2" placeholder="Description..." value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <Button size="sm" onClick={() => createMut.mutate({ leadId, ...form })} disabled={!form.activityType}>Log Activity</Button>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> :
        !activities || activities.length === 0 ? <p className="text-sm text-muted-foreground">No activities logged yet.</p> :
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {activities.map((act) => (
            <div key={act.id} className="flex items-start gap-3 border-l-2 border-primary/20 pl-3 py-1">
              <Badge variant="outline" className="text-xs shrink-0">{act.activityType}</Badge>
              <div className="flex-1">
                <p className="text-sm">{act.description}</p>
                <p className="text-xs text-muted-foreground">{act.createdAt ? new Date(act.createdAt).toLocaleString() : ""}</p>
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}

// ─── Intro Letter Button ───────────────────────────────────────────────────
function IntroLetterButton({ leadId, letterType, label, leadEmail, leadName }: {
  leadId: number;
  letterType: "unassigned_intro" | "assigned_intro";
  label: string;
  leadEmail: string;
  leadName: string;
}) {
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const sendLetterMut = trpc.crm.sendLetter.useMutation();
  const utils = trpc.useUtils();

  // Check if this letter type has already been sent for this lead
  const { data: activities } = trpc.crm.activities.list.useQuery({ leadId });
  const alreadySent = justSent || (activities || []).some(
    (act: any) => act.activityType === "email_sent" && act.emailType === letterType
  );

  if (alreadySent) {
    return (
      <Button variant="outline" size="sm" disabled className="opacity-70">
        <Mail className="h-4 w-4 mr-1" /> {label.replace("Send ", "")} — Sent \u2713
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={!leadEmail || sending}
      onClick={async () => {
        if (!leadEmail) { toast.error("No email address on lead"); return; }
        setSending(true);
        try {
          const res = await sendLetterMut.mutateAsync({
            leadId, letterType, to: leadEmail, clientName: leadName,
          });
          if (res.success) {
            toast.success(`${label.replace("Send ", "")} sent to ${leadEmail}`);
            setJustSent(true);
            utils.crm.activities.list.invalidate({ leadId });
          } else {
            toast.error(res.error || "Failed to send");
          }
        } catch (e: any) {
          toast.error(e.message || "Error sending letter");
        } finally {
          setSending(false);
        }
      }}
    >
      <Mail className="h-4 w-4 mr-1" /> {label}
    </Button>
  );
}


// ─── Linked Construction Activities ─────────────────────────────────────────
// Shows construction job activities when a CRM lead is linked to a construction job
function LinkedConstructionActivities({ leadId }: { leadId: number }) {
  // Look up construction job linked to this lead
  const { data: clients } = trpc.constructionClients.list.useQuery(
    { search: "", limit: 200 },
    { enabled: !!leadId }
  );

  // Find job(s) linked to this lead
  const linkedJob = (clients?.clients || []).find((c: any) => c.leadId === leadId);

  if (!linkedJob) return null;

  return (
    <div className="mt-4 pt-4 border-t">
      <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
        Construction Job Activities
        <Badge variant="outline" className="text-[10px]">Job #{linkedJob.id}</Badge>
      </h4>
      <ClientActivityTab jobId={linkedJob.id} leadId={leadId} />
    </div>
  );
}

// BaStatusIndicator removed — now lives in ConstructionClients.tsx and ConstructionClientDetail.tsx


/**
 * "View as DA" button — impersonates the assigned DA via the design_advisors.userId link.
 * Only visible to admin/super_admin users when a DA is assigned to the lead.
 */
function ViewAsDaButton({ designAdvisorName }: { designAdvisorName: string }) {
  const { data: advisors } = trpc.designAdvisors.list.useQuery({ includePendingInvites: true });
  const impersonateMut = trpc.userManagement.startImpersonation.useMutation({
    onSuccess: () => {
      toast.success(`Now viewing as ${designAdvisorName}`);
      setTimeout(() => window.location.reload(), 500);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to impersonate");
    },
  });

  const handleViewAsDa = () => {
    // Find the design_advisors record by name or email
    const advisor = advisors?.find(
      (a) => a.name?.toLowerCase() === designAdvisorName.toLowerCase() ||
             a.email?.toLowerCase() === designAdvisorName.toLowerCase()
    );

    if (advisor?.userId) {
      // Direct link via design_advisors.userId
      impersonateMut.mutate({ userId: advisor.userId });
      return;
    }

    // Fallback: navigate directly to DA portal if no linked user
    // The DA portal can resolve by DA id without impersonation
    if (advisor) {
      window.open(`/da-portal?daId=${advisor.id}`, '_blank');
      toast.info(`Opening DA portal for ${designAdvisorName} (no linked user account yet)`);
      return;
    }

    toast.error(
      `No design advisor record found for "${designAdvisorName}". ` +
      `Check the name matches a record in the People page.`
    );
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="gap-1 text-amber-700 border-amber-300 hover:bg-amber-50"
      onClick={handleViewAsDa}
      disabled={impersonateMut.isPending}
      title={`Impersonate ${designAdvisorName} to view their DA portal`}
    >
      {impersonateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCog className="h-4 w-4" />}
      <span className="hidden sm:inline">View as DA</span>
    </Button>
  );
}
