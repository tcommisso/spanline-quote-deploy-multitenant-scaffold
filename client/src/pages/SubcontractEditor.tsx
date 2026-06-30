import { useState, useEffect, useCallback, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { loadCompanyDetails } from "@/lib/proposalStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft,
  Save,
  Send,
  FileText,
  Plus,
  Trash2,
  Archive,
  ArchiveRestore,
  Calendar,
  Loader2,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  Download,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface PaymentMilestone {
  label: string;
  amountDollars: number | null;
  percentOfTotal: number | null;
  usePercent: boolean;
}

interface BuildingFileChecklist {
  plans: string;
  materialsList: string;
  approvals: string;
}

interface InspectionChecklist {
  footings: string;
  slab: string;
  plumbing: string;
  framing: string;
  roofing: string;
  other: string;
}

interface OtherContractorsChecklist {
  electrician: string;
  plumber: string;
  concreter: string;
  flooring: string;
  painter: string;
}

interface ElectricalCablingChecklist {
  wall: string;
  roof: string;
  fan: string;
}

interface DownpipesChecklist {
  toGround: string;
  toSpreader: string;
  toExistingDP: string;
  toStormwater: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  signed: "bg-green-100 text-green-700",
  on_file: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
  declined: "bg-red-100 text-red-700",
  archived: "bg-slate-100 text-slate-600",
};

const UNASSIGNED_VALUE = "__unassigned";
const CUSTOM_SUBCONTRACTOR_VALUE = "__custom";
const ALL_SUPPLIER_TYPES_VALUE = "__all";
const SUPPLIER_PREFIX = "supplier:";
const INSTALLER_PREFIX = "installer:";
const CHECKLIST_OPTIONS = ["N/A", "Yes", "No"];

function userDisplayName(user: any) {
  return user?.name || user?.email || `User #${user?.id}`;
}

function roleLabel(role?: string | null) {
  return String(role || "user").replace(/_/g, " ");
}

function normalise(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function textOrEmpty(value: unknown) {
  return String(value || "").trim();
}

function supplierTypeLabel(supplier: any) {
  return String(supplier?.category || supplier?.tradeType || "").trim();
}

function supplierTypeNames(supplier: any, categoryAssignments: Record<number, Array<{ name: string }>>) {
  const names = new Set<string>();
  for (const category of categoryAssignments[supplier.id] || []) {
    const name = String(category.name || "").trim();
    if (name) names.add(name);
  }
  const directType = supplierTypeLabel(supplier);
  if (directType) names.add(directType);
  return Array.from(names);
}

function supplierTypeDisplay(supplier: any, categoryAssignments: Record<number, Array<{ name: string }>>) {
  return supplierTypeNames(supplier, categoryAssignments).join(", ");
}

function supplierOptionValue(supplier: any) {
  if (supplier?.installerId) return `${INSTALLER_PREFIX}${supplier.installerId}`;
  return `${SUPPLIER_PREFIX}${supplier.id}`;
}

function subcontractDisplayStatus(subcontract: any) {
  return subcontract?.archivedAt ? "archived" : subcontract?.status || "draft";
}

function formatStatusLabel(status: string) {
  if (status === "on_file") return "Contract on file";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function SubcontractEditor() {
  const [, params] = useRoute("/subcontracts/:id");
  const [, navigate] = useLocation();
  const subcontractId = params?.id ? parseInt(params.id) : null;

  const { data: subcontract, isLoading } = trpc.subcontract.get.useQuery(
    { id: subcontractId! },
    { enabled: !!subcontractId }
  );

  // Get milestone claim status (which milestones have invoices against them)
  const { data: claimStatus } = trpc.subcontract.getClaimStatus.useQuery(
    { subcontractId: subcontractId! },
    { enabled: !!subcontractId }
  );

  const updateMutation = trpc.subcontract.update.useMutation();
  const utils = trpc.useUtils();

  // Fetch form option lists.
  const { data: userSettings } = trpc.userSettings.get.useQuery();
  const { data: allUsers } = trpc.constructionClients.assignableUsers.useQuery();
  const { data: constructionSuppliers = [] } = trpc.suppliers.list.useQuery({
    activeOnly: true,
    supplierScope: "construction",
  });
  const { data: supplierCategories = [] } = trpc.supplierCategories.list.useQuery();
  const supplierIds = useMemo(
    () => (constructionSuppliers as any[]).filter((supplier) => supplier.id > 0).map((supplier) => supplier.id),
    [constructionSuppliers],
  );
  const { data: supplierCategoryAssignments = {} } = trpc.supplierCategories.getForSuppliers.useQuery(
    { supplierIds },
    { enabled: supplierIds.length > 0 },
  );

  // Form state
  const [installerId, setInstallerId] = useState<number | null>(null);
  const [jobNumber, setJobNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientAccountNumber, setClientAccountNumber] = useState("");
  const [constructionManager, setConstructionManager] = useState("");
  const [supplierTypeFilter, setSupplierTypeFilter] = useState(ALL_SUPPLIER_TYPES_VALUE);
  const [subcontractorName, setSubcontractorName] = useState("");
  const [subcontractorPhone, setSubcontractorPhone] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [subcontractSum, setSubcontractSum] = useState("");
  const [contractSource, setContractSource] = useState<"generated" | "manual_on_file">("generated");
  const [onFileNotes, setOnFileNotes] = useState("");
  const [estimatedCommencement, setEstimatedCommencement] = useState("");
  const [estimatedCompletion, setEstimatedCompletion] = useState("");
  const [flashingBySubcontractor, setFlashingBySubcontractor] = useState("N/A");

  // Send for Signature dialog state
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [subcontractorEmail, setSubcontractorEmail] = useState("");
  const [spanlineSignerName, setSpanlineSignerName] = useState("");
  const [spanlineSignerEmail, setSpanlineSignerEmail] = useState("");
  const sendMutation = trpc.subcontract.sendForSignature.useMutation();
  const createMutation = trpc.subcontract.create.useMutation();
  const cancelMutation = trpc.subcontract.cancel.useMutation();
  const archiveMutation = trpc.subcontract.archive.useMutation();
  const unarchiveMutation = trpc.subcontract.unarchive.useMutation();
  const deleteMutation = trpc.subcontract.delete.useMutation();

  // Payment Schedule
  const [milestones, setMilestones] = useState<PaymentMilestone[]>([]);

  // Checklists
  const [buildingFile, setBuildingFile] = useState<BuildingFileChecklist>({
    plans: "N/A", materialsList: "N/A", approvals: "N/A",
  });
  const [inspections, setInspections] = useState<InspectionChecklist>({
    footings: "N/A", slab: "N/A", plumbing: "N/A", framing: "N/A", roofing: "N/A", other: "N/A",
  });
  const [otherContractors, setOtherContractors] = useState<OtherContractorsChecklist>({
    electrician: "N/A", plumber: "N/A", concreter: "N/A", flooring: "N/A", painter: "N/A",
  });
  const [electricalCabling, setElectricalCabling] = useState<ElectricalCablingChecklist>({
    wall: "N/A", roof: "N/A", fan: "N/A",
  });
  const [downpipes, setDownpipes] = useState<DownpipesChecklist>({
    toGround: "N/A", toSpreader: "N/A", toExistingDP: "N/A", toStormwater: "N/A",
  });

  // Load subcontract data
  useEffect(() => {
    if (subcontract) {
      setJobNumber(subcontract.jobNumber || "");
      setClientName(subcontract.clientName || "");
      setClientAccountNumber(subcontract.clientAccountNumber || "");
      setConstructionManager(subcontract.constructionManager || "");
      setInstallerId(subcontract.installerId || null);
      setSubcontractorName(subcontract.subcontractorName || "");
      setSubcontractorPhone(subcontract.subcontractorPhone || "");
      setSiteAddress(subcontract.siteAddress || "");
      setSubcontractSum(subcontract.subcontractSum || "0.00");
      setContractSource((subcontract.contractSource as "generated" | "manual_on_file") || (subcontract.status === "on_file" ? "manual_on_file" : "generated"));
      setOnFileNotes(subcontract.onFileNotes || "");
      setFlashingBySubcontractor(subcontract.flashingBySubcontractor || "N/A");
      setMilestones((subcontract.paymentSchedule as PaymentMilestone[]) || []);
      setBuildingFile((subcontract.buildingFile as BuildingFileChecklist) || { plans: "N/A", materialsList: "N/A", approvals: "N/A" });
      setInspections((subcontract.inspections as InspectionChecklist) || { footings: "N/A", slab: "N/A", plumbing: "N/A", framing: "N/A", roofing: "N/A", other: "N/A" });
      setOtherContractors((subcontract.otherContractors as OtherContractorsChecklist) || { electrician: "N/A", plumber: "N/A", concreter: "N/A", flooring: "N/A", painter: "N/A" });
      setElectricalCabling((subcontract.electricalCabling as ElectricalCablingChecklist) || { wall: "N/A", roof: "N/A", fan: "N/A" });
      setDownpipes((subcontract.downpipes as DownpipesChecklist) || { toGround: "N/A", toSpreader: "N/A", toExistingDP: "N/A", toStormwater: "N/A" });

      if (subcontract.estimatedCommencement) {
        setEstimatedCommencement(new Date(subcontract.estimatedCommencement).toISOString().split("T")[0]);
      }
      if (subcontract.estimatedCompletion) {
        setEstimatedCompletion(new Date(subcontract.estimatedCompletion).toISOString().split("T")[0]);
      }
    }
  }, [subcontract]);

  const handleSave = useCallback(async () => {
    if (!subcontractId) return;
    try {
      await updateMutation.mutateAsync({
        id: subcontractId,
        installerId: installerId || null,
        jobNumber,
        clientName,
        clientAccountNumber,
        constructionManager,
        subcontractorName,
        subcontractorPhone,
        siteAddress,
        subcontractSum,
        contractSource,
        onFileNotes,
        paymentSchedule: milestones,
        estimatedCommencement: estimatedCommencement || null,
        estimatedCompletion: estimatedCompletion || null,
        buildingFile,
        inspections,
        otherContractors,
        electricalCabling,
        downpipes,
        flashingBySubcontractor,
      });
      utils.subcontract.get.invalidate({ id: subcontractId });
      toast.success("Subcontract saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  }, [subcontractId, installerId, jobNumber, clientName, clientAccountNumber, constructionManager, subcontractorName, subcontractorPhone, siteAddress, subcontractSum, contractSource, onFileNotes, milestones, estimatedCommencement, estimatedCompletion, buildingFile, inspections, otherContractors, electricalCabling, downpipes, flashingBySubcontractor]);

  const managerOptions = useMemo(
    () => [...(allUsers || [])].sort((a: any, b: any) => userDisplayName(a).localeCompare(userDisplayName(b))),
    [allUsers],
  );

  const managerSelectValue = useMemo(() => {
    if (!constructionManager) return UNASSIGNED_VALUE;
    const match = managerOptions.find((user: any) => userDisplayName(user) === constructionManager);
    return match ? `user:${match.id}` : `saved:${constructionManager}`;
  }, [constructionManager, managerOptions]);

  const selectedManagerUser = useMemo(() => {
    const managerName = normalise(constructionManager);
    if (!managerName) return null;
    return managerOptions.find((user: any) =>
      normalise(userDisplayName(user)) === managerName ||
      normalise(user.name) === managerName ||
      normalise(user.email) === managerName
    ) || null;
  }, [constructionManager, managerOptions]);

  const supplierTypes = useMemo(() => {
    const types = new Set<string>();
    for (const category of supplierCategories as any[]) {
      const name = String(category.name || "").trim();
      if (name) types.add(name);
    }
    for (const supplier of constructionSuppliers as any[]) {
      for (const type of supplierTypeNames(supplier, supplierCategoryAssignments as Record<number, Array<{ name: string }>>)) {
        types.add(type);
      }
    }
    return Array.from(types).sort((a, b) => a.localeCompare(b));
  }, [constructionSuppliers, supplierCategories, supplierCategoryAssignments]);

  const filteredSuppliers = useMemo(() => {
    const rows = constructionSuppliers as any[];
    if (supplierTypeFilter === ALL_SUPPLIER_TYPES_VALUE) return rows;
    return rows.filter((supplier) =>
      supplierTypeNames(supplier, supplierCategoryAssignments as Record<number, Array<{ name: string }>>)
        .some((type) => type === supplierTypeFilter)
    );
  }, [constructionSuppliers, supplierCategoryAssignments, supplierTypeFilter]);

  const selectedSupplier = useMemo(() => {
    const rows = constructionSuppliers as any[];
    if (installerId != null) {
      const byInstaller = rows.find((supplier) => Number(supplier.installerId) === installerId);
      if (byInstaller) return byInstaller;
    }
    const name = normalise(subcontractorName);
    if (!name) return null;
    return rows.find((supplier) => normalise(supplier.name) === name) || null;
  }, [constructionSuppliers, installerId, subcontractorName]);

  const selectedSupplierValue = selectedSupplier
    ? supplierOptionValue(selectedSupplier)
    : CUSTOM_SUBCONTRACTOR_VALUE;

  const visibleSuppliers = useMemo(() => {
    if (!selectedSupplier) return filteredSuppliers;
    const selectedValue = supplierOptionValue(selectedSupplier);
    const hasSelected = filteredSuppliers.some((supplier: any) => supplierOptionValue(supplier) === selectedValue);
    return hasSelected ? filteredSuppliers : [selectedSupplier, ...filteredSuppliers];
  }, [filteredSuppliers, selectedSupplier]);

  useEffect(() => {
    if (subcontractorPhone.trim() || !subcontractorName.trim()) return;
    const match = (constructionSuppliers as any[]).find((supplier) => normalise(supplier.name) === normalise(subcontractorName));
    if (!match) return;
    if (match.phone) setSubcontractorPhone(match.phone);
    if (!installerId && match.installerId) setInstallerId(match.installerId);
  }, [constructionSuppliers, installerId, subcontractorName, subcontractorPhone]);

  const handleManagerChange = (value: string) => {
    if (value === UNASSIGNED_VALUE) {
      setConstructionManager("");
      return;
    }
    if (value.startsWith("user:")) {
      const id = Number(value.slice("user:".length));
      const user = managerOptions.find((candidate: any) => candidate.id === id);
      setConstructionManager(user ? userDisplayName(user) : "");
      return;
    }
    if (value.startsWith("saved:")) {
      setConstructionManager(value.slice("saved:".length));
    }
  };

  const handleSupplierChange = (value: string) => {
    if (value === CUSTOM_SUBCONTRACTOR_VALUE) {
      setInstallerId(null);
      return;
    }
    const selected = (constructionSuppliers as any[]).find((supplier) => supplierOptionValue(supplier) === value);
    if (!selected) return;
    setSubcontractorName(selected.name || "");
    setSubcontractorPhone(selected.phone || "");
    setInstallerId(selected.installerId ? Number(selected.installerId) : null);
  };

  const handleSendDialogOpenChange = (open: boolean) => {
    if (open) {
      setSubcontractorEmail(textOrEmpty(selectedSupplier?.email) || subcontractorEmail);
      setSpanlineSignerName(textOrEmpty(constructionManager) || spanlineSignerName);
      setSpanlineSignerEmail(textOrEmpty(selectedManagerUser?.email) || spanlineSignerEmail);
    }
    setSendDialogOpen(open);
  };

  // Payment schedule helpers
  const updateMilestone = (index: number, field: keyof PaymentMilestone, value: any) => {
    const updated = [...milestones];
    updated[index] = { ...updated[index], [field]: value };
    setMilestones(updated);
  };

  const addMilestone = () => {
    setMilestones([...milestones, { label: "", amountDollars: null, percentOfTotal: null, usePercent: false }]);
  };

  const removeMilestone = (index: number) => {
    setMilestones(milestones.filter((_, i) => i !== index));
  };

  // Calculate totals
  const totalDollars = milestones.reduce((sum, m) => sum + (m.usePercent ? 0 : (m.amountDollars || 0)), 0);
  const totalPercent = milestones.reduce((sum, m) => sum + (m.usePercent ? (m.percentOfTotal || 0) : 0), 0);
  const displayStatus = subcontractDisplayStatus(subcontract);
  const isArchived = !!subcontract?.archivedAt;
  const isOnFile = subcontract?.status === "on_file";
  const isSigned = subcontract?.status === "signed" || isOnFile || !!subcontract?.signedAt || !!subcontract?.pdfUrl;
  const canSend = subcontract?.status === "draft" && !isArchived;
  const canCancel = subcontract?.status === "sent" && !isSigned && !isArchived;
  const canDelete = !!subcontract && !isSigned && subcontract.status !== "sent";
  const lifecycleMutationPending = createMutation.isPending || cancelMutation.isPending || archiveMutation.isPending || unarchiveMutation.isPending || deleteMutation.isPending;
  const companyName = useMemo(() => {
    const configured = textOrEmpty((userSettings?.companyDetails as any)?.companyName);
    if (configured) return configured;
    return textOrEmpty(loadCompanyDetails().companyName) || "Commisso Group Pty Limited";
  }, [userSettings]);

  const refreshSubcontract = () => {
    if (subcontractId) utils.subcontract.get.invalidate({ id: subcontractId });
  };

  const handleCreateAdditional = async () => {
    if (!subcontract) return;
    try {
      const result = await createMutation.mutateAsync({
        jobId: subcontract.jobId,
        sourceSubcontractId: subcontract.id,
      });
      toast.success("Additional subcontract draft created");
      navigate(`/subcontracts/${result.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create additional subcontract");
    }
  };

  const handleCancelSubcontract = async () => {
    if (!subcontractId) return;
    if (!window.confirm("Cancel this unsigned subcontract? You can create another draft for replacement or extra work.")) return;
    try {
      await cancelMutation.mutateAsync({ id: subcontractId });
      refreshSubcontract();
      toast.success("Subcontract cancelled");
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel subcontract");
    }
  };

  const handleMarkOnFile = async () => {
    if (!subcontractId) return;
    try {
      await handleSave();
      await updateMutation.mutateAsync({
        id: subcontractId,
        status: "on_file",
        contractSource: "manual_on_file",
        onFileNotes,
      });
      setContractSource("manual_on_file");
      refreshSubcontract();
      toast.success("Contract marked as on file");
    } catch (err: any) {
      toast.error(err.message || "Failed to mark contract on file");
    }
  };

  const handleArchiveToggle = async () => {
    if (!subcontractId) return;
    try {
      if (isArchived) {
        await unarchiveMutation.mutateAsync({ id: subcontractId });
        toast.success("Subcontract restored");
      } else {
        await archiveMutation.mutateAsync({ id: subcontractId });
        toast.success("Subcontract archived");
      }
      refreshSubcontract();
    } catch (err: any) {
      toast.error(err.message || "Failed to update archive status");
    }
  };

  const handleDeleteSubcontract = async () => {
    if (!subcontractId) return;
    if (!window.confirm("Delete this unsigned subcontract? This cannot be undone.")) return;
    try {
      await deleteMutation.mutateAsync({ id: subcontractId });
      toast.success("Subcontract deleted");
      window.history.back();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete subcontract");
    }
  };

  if (isLoading) {
    return (
      <div className="container px-4 py-4 sm:py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="h-96 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!subcontract) {
    return (
      <div className="container px-4 py-4 sm:py-6">
        <p className="text-muted-foreground">Subcontract not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/construction")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Jobs
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl px-4 py-4 sm:py-6">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold flex flex-wrap items-center gap-2">
              <FileText className="h-5 w-5" />
              Project Subcontract
            </h1>
            <p className="text-sm text-muted-foreground break-words">Job #{jobNumber} — {clientName}</p>
          </div>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:w-auto lg:flex lg:flex-wrap lg:justify-end">
          <Badge className={`${STATUS_COLORS[displayStatus]} justify-center lg:justify-start`}>
            {formatStatusLabel(displayStatus)}
          </Badge>
          <Button
            size="sm"
            variant="outline"
            className="w-full lg:w-auto"
            onClick={handleCreateAdditional}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            Create another
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full lg:w-auto"
            onClick={handleArchiveToggle}
            disabled={lifecycleMutationPending}
          >
            {isArchived ? <ArchiveRestore className="h-4 w-4 mr-1" /> : <Archive className="h-4 w-4 mr-1" />}
            {isArchived ? "Restore" : "Archive"}
          </Button>
          {canCancel && (
            <Button
              size="sm"
              variant="outline"
              className="w-full lg:w-auto"
              onClick={handleCancelSubcontract}
              disabled={lifecycleMutationPending}
            >
              Cancel contract
            </Button>
          )}
          {!isSigned && !isArchived && (
            <Button
              size="sm"
              variant="outline"
              className="w-full lg:w-auto"
              onClick={handleMarkOnFile}
              disabled={lifecycleMutationPending || updateMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Mark on file
            </Button>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="destructive"
              className="w-full lg:w-auto"
              onClick={handleDeleteSubcontract}
              disabled={lifecycleMutationPending}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="w-full lg:w-auto"
            onClick={async () => {
              await handleSave();
              const previewWin = window.open("", "_blank");
              if (previewWin) {
                previewWin.document.write("<html><body><p>Loading A4 preview...</p></body></html>");
                try {
                  const result = await utils.subcontract.previewHtml.fetch({ id: subcontractId! });
                  previewWin.document.open();
                  previewWin.document.write(result.html);
                  previewWin.document.close();
                } catch {
                  previewWin.document.open();
                  previewWin.document.write("<html><body><p>Failed to load preview. Please try again.</p></body></html>");
                  previewWin.document.close();
                }
              }
            }}
            disabled={updateMutation.isPending}
          >
            <Eye className="h-4 w-4 mr-1" /> Preview
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full lg:w-auto"
            onClick={async () => {
              await handleSave();
              try {
                const result = await utils.subcontract.previewHtml.fetch({ id: subcontractId! });
                const printWin = window.open("", "_blank");
                if (printWin) {
                  printWin.document.open();
                  printWin.document.write(result.html);
                  printWin.document.close();
                  setTimeout(() => printWin.print(), 600);
                }
              } catch {
                toast.error("Failed to generate PDF");
              }
            }}
            disabled={updateMutation.isPending}
          >
            <Download className="h-4 w-4 mr-1" /> Download PDF
          </Button>
          <Button size="sm" className="w-full lg:w-auto" onClick={handleSave} disabled={updateMutation.isPending}>
            <Save className="h-4 w-4 mr-1" /> Save
          </Button>
        </div>
      </div>

      {/* Intro Text */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            The information identified in this document forms a specific separate Project Subcontract between {companyName} and the Subcontractor.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            The Project Subcontract incorporates by reference the general conditions of the latest current version of the Master Subcontract that has been agreed between {companyName} and the Subcontractor.
          </p>
        </CardContent>
      </Card>

      {/* Header Fields */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contract Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Job No.</Label>
              <Input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Client Name</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Client Account Number</Label>
              <Input value={clientAccountNumber} onChange={(e) => setClientAccountNumber(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Construction Manager</Label>
              <Select value={managerSelectValue} onValueChange={handleManagerChange}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select construction manager..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
                  {constructionManager && managerSelectValue.startsWith("saved:") && (
                    <SelectItem value={managerSelectValue}>{constructionManager}</SelectItem>
                  )}
                  {managerOptions.map((user: any) => (
                    <SelectItem key={user.id} value={`user:${user.id}`}>
                      {userDisplayName(user)} ({roleLabel(user.role)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Supplier Type</Label>
              <Select value={supplierTypeFilter} onValueChange={setSupplierTypeFilter}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="All supplier types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_SUPPLIER_TYPES_VALUE}>All supplier types</SelectItem>
                  {supplierTypes.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Subcontractor</Label>
              <Select
                value={selectedSupplierValue}
                onValueChange={handleSupplierChange}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select subcontractor..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={CUSTOM_SUBCONTRACTOR_VALUE}>Custom (type manually)</SelectItem>
                  {visibleSuppliers.length === 0 && (
                    <SelectItem value="__no_suppliers" disabled>No suppliers for this type</SelectItem>
                  )}
                  {visibleSuppliers.map((supplier: any) => {
                    const type = supplierTypeDisplay(supplier, supplierCategoryAssignments as Record<number, Array<{ name: string }>>);
                    return (
                      <SelectItem key={supplierOptionValue(supplier)} value={supplierOptionValue(supplier)}>
                        {supplier.name}{type ? ` (${type})` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedSupplier && selectedSupplier.phone && (
                <p className="text-[11px] text-muted-foreground">Phone will prefill from supplier: {selectedSupplier.phone}</p>
              )}
              {selectedSupplierValue === CUSTOM_SUBCONTRACTOR_VALUE && (
                <Input
                  value={subcontractorName}
                  onChange={(e) => setSubcontractorName(e.target.value)}
                  className="h-8 text-sm mt-1"
                  placeholder="Enter subcontractor name"
                />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Subcontractor Phone</Label>
              <Input value={subcontractorPhone} onChange={(e) => setSubcontractorPhone(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Site Address</Label>
              <Input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div className="mt-4 space-y-1">
            <Label className="text-xs font-medium">Project Subcontract Sum (ex GST)</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">$</span>
              <Input
                type="number"
                step="0.01"
                value={subcontractSum}
                onChange={(e) => setSubcontractSum(e.target.value)}
                className="h-8 w-full text-sm sm:max-w-48"
              />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Contract Source</Label>
              <Select
                value={contractSource}
                onValueChange={(value) => setContractSource(value as "generated" | "manual_on_file")}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="generated">Generated in app</SelectItem>
                  <SelectItem value="manual_on_file">Manual contract on file</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(contractSource === "manual_on_file" || displayStatus === "on_file") && (
              <div className="space-y-1">
                <Label className="text-xs font-medium">On-file Reference / Notes</Label>
                <Textarea
                  value={onFileNotes}
                  onChange={(event) => setOnFileNotes(event.target.value)}
                  rows={2}
                  className="text-sm"
                  placeholder="Manual contract reference, signed date, or file location"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment Schedule */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>Payment Schedule</span>
            {claimStatus && claimStatus.length > 0 && (
              <Badge variant="outline" className="text-[10px] font-normal">
                {claimStatus.length} claim(s) submitted
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium text-xs text-muted-foreground w-[35%]">Milestone</th>
                  <th className="text-right py-2 px-2 font-medium text-xs text-muted-foreground w-[18%]">$ Amount</th>
                  <th className="text-center py-2 px-2 font-medium text-xs text-muted-foreground w-[6%]">or</th>
                  <th className="text-right py-2 px-2 font-medium text-xs text-muted-foreground w-[18%]">% of Total</th>
                  <th className="text-center py-2 px-2 font-medium text-xs text-muted-foreground w-[13%]">Status</th>
                  <th className="w-[10%]"></th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((m, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1 px-2">
                      <Input
                        value={m.label}
                        onChange={(e) => updateMilestone(i, "label", e.target.value)}
                        className="h-7 text-xs"
                        placeholder="Milestone name"
                      />
                    </td>
                    <td className="py-1 px-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={m.amountDollars ?? ""}
                        onChange={(e) => updateMilestone(i, "amountDollars", e.target.value ? parseFloat(e.target.value) : null)}
                        className="h-7 text-xs text-right"
                        disabled={m.usePercent}
                      />
                    </td>
                    <td className="py-1 px-2 text-center">
                      <Select
                        value={m.usePercent ? "percent" : "dollar"}
                        onValueChange={(v) => updateMilestone(i, "usePercent", v === "percent")}
                      >
                        <SelectTrigger className="h-7 text-xs w-16 mx-auto">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dollar">or</SelectItem>
                          <SelectItem value="percent">Select</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-1 px-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={m.percentOfTotal ?? ""}
                        onChange={(e) => updateMilestone(i, "percentOfTotal", e.target.value ? parseFloat(e.target.value) : null)}
                        className="h-7 text-xs text-right"
                        disabled={!m.usePercent}
                        placeholder="%"
                      />
                    </td>
                    <td className="py-1 px-2 text-center">
                      <MilestoneClaimBadge index={i} claimStatus={claimStatus} />
                    </td>
                    <td className="py-1 px-2">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeMilestone(i)}>
                        <Trash2 className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-medium">
                  <td className="py-2 px-2 text-xs">Total</td>
                  <td className="py-2 px-2 text-right text-xs">${totalDollars.toFixed(2)}</td>
                  <td></td>
                  <td className="py-2 px-2 text-right text-xs">{totalPercent.toFixed(2)}%</td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <Button variant="outline" size="sm" className="mt-2 h-7 w-full text-xs sm:w-auto" onClick={addMilestone}>
            <Plus className="h-3 w-3 mr-1" /> Add Milestone
          </Button>
        </CardContent>
      </Card>

      {/* Dates */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Dates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-medium">Date for Estimated Commencement</Label>
              <Input
                type="date"
                value={estimatedCommencement}
                onChange={(e) => setEstimatedCommencement(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Date for Completion</Label>
              <Input
                type="date"
                value={estimatedCompletion}
                onChange={(e) => setEstimatedCompletion(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Building File & Inspections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Building File including:</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(["plans", "materialsList", "approvals"] as const).map((key) => (
              <div key={key} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-center sm:gap-2">
                <Label className="text-xs capitalize">{key === "materialsList" ? "Materials list" : key}</Label>
                <ChecklistSelect
                  value={buildingFile[key]}
                  onChange={(value) => setBuildingFile({ ...buildingFile, [key]: value })}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Inspection requirements:</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(["footings", "slab", "plumbing", "framing", "roofing", "other"] as const).map((key) => (
              <div key={key} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-center sm:gap-2">
                <Label className="text-xs capitalize">{key}</Label>
                <ChecklistSelect
                  value={inspections[key]}
                  onChange={(value) => setInspections({ ...inspections, [key]: value })}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Other Contractors & Electrical */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Other Contractors accessing site:</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(["electrician", "plumber", "concreter", "flooring", "painter"] as const).map((key) => (
              <div key={key} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-center sm:gap-2">
                <Label className="text-xs capitalize">{key}</Label>
                <ChecklistSelect
                  value={otherContractors[key]}
                  onChange={(value) => setOtherContractors({ ...otherContractors, [key]: value })}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Electrical Cabling by Installer:</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(["wall", "roof", "fan"] as const).map((key) => (
                <div key={key} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-center sm:gap-2">
                  <Label className="text-xs capitalize">{key}</Label>
                  <ChecklistSelect
                    value={electricalCabling[key]}
                    onChange={(value) => setElectricalCabling({ ...electricalCabling, [key]: value })}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Downpipes:</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {([
                { key: "toGround" as const, label: "Downpipe to ground" },
                { key: "toSpreader" as const, label: "Downpipe to spreader" },
                { key: "toExistingDP" as const, label: "Downpipe to existing DP" },
                { key: "toStormwater" as const, label: "Downpipe to Stormwater" },
              ]).map(({ key, label }) => (
                <div key={key} className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-center sm:gap-2">
                  <Label className="text-xs">{label}</Label>
                  <ChecklistSelect
                    value={downpipes[key]}
                    onChange={(value) => setDownpipes({ ...downpipes, [key]: value })}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Flashing */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-center">
            <Label className="text-sm font-medium">Flashing measurement and design by Subcontractor:</Label>
            <ChecklistSelect
              value={flashingBySubcontractor}
              onChange={setFlashingBySubcontractor}
              className="h-8 w-full text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Terms & Conditions */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-red-600">Terms & Conditions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground leading-relaxed">
            By working on the site listed you agree to the Build fee issued by {companyName} and will conduct work that is to the highest
            standard and working inline with all WHS requirements, the site will be keep clean and free of mess by the contractor
            while works are being carried out, any damage to materials caused by the contractor can be back charged to the
            contractor at the discretion of {companyName}, a retention is kept for 15 days after the works have been completed by the contractor,
            during this time any rectification will need to be completed before this 15 days has ended.
          </p>
        </CardContent>
      </Card>

      {/* Signature Blocks */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Signatures</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border rounded-lg p-4 space-y-3">
              <p className="text-xs font-medium text-center">
                Executed by Authorised Signatory for and on behalf of the Subcontractor:
              </p>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs w-16">Signature:</Label>
                  <div className="flex-1 border-b border-dashed h-6" />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs w-16">Name:</Label>
                  <div className="flex-1 border-b border-dashed h-6" />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs w-16">Date:</Label>
                  <div className="flex-1 border-b border-dashed h-6" />
                </div>
              </div>
            </div>
            <div className="border rounded-lg p-4 space-y-3">
              <p className="text-xs font-medium text-center">
                Executed by Authorised Signatory for and on behalf of {companyName}:
              </p>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs w-16">Signature:</Label>
                  <div className="flex-1 border-b border-dashed h-6" />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs w-16">Name:</Label>
                  <div className="flex-1 border-b border-dashed h-6" />
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-xs w-16">Date:</Label>
                  <div className="flex-1 border-b border-dashed h-6" />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto lg:flex lg:items-center">
          <Button
            variant="outline"
            className="w-full lg:w-auto"
            onClick={async () => {
              await handleSave();
              const previewWin = window.open("", "_blank");
              if (previewWin) {
                previewWin.document.write("<html><body><p>Loading A4 preview...</p></body></html>");
                try {
                  const result = await utils.subcontract.previewHtml.fetch({ id: subcontractId! });
                  previewWin.document.open();
                  previewWin.document.write(result.html);
                  previewWin.document.close();
                  setTimeout(() => previewWin.print(), 600);
                } catch {
                  previewWin.document.open();
                  previewWin.document.write("<html><body><p>Failed to load preview. Please try again.</p></body></html>");
                  previewWin.document.close();
                }
              }
            }}
            disabled={updateMutation.isPending}
          >
            <Eye className="h-4 w-4 mr-1" /> Preview / PDF
          </Button>
          <Button variant="outline" className="w-full lg:w-auto" onClick={handleSave} disabled={updateMutation.isPending}>
            <Save className="h-4 w-4 mr-1" /> Save Draft
          </Button>
          <Dialog open={sendDialogOpen} onOpenChange={handleSendDialogOpenChange}>
            <DialogTrigger asChild>
              <Button className="w-full lg:w-auto" disabled={!canSend}>
                <Send className="h-4 w-4 mr-1" /> Send for Signature
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Send Subcontract for Signature</DialogTitle>
                <DialogDescription>
                  This will send the subcontract via SignWell for dual digital signatures — first the subcontractor, then the {companyName} authorised signatory.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Subcontractor Email</Label>
                  <Input
                    type="email"
                    placeholder="subcontractor@example.com"
                    value={subcontractorEmail}
                    onChange={(e) => setSubcontractorEmail(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">The subcontractor will sign first</p>
                </div>
                <Separator />
                <div className="space-y-1">
                  <Label className="text-sm font-medium">{companyName} Authorised Signatory Name</Label>
                  <Input
                    placeholder="Construction Manager"
                    value={spanlineSignerName}
                    onChange={(e) => setSpanlineSignerName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium">{companyName} Authorised Signatory Email</Label>
                  <Input
                    type="email"
                    placeholder="construction.manager@example.com"
                    value={spanlineSignerEmail}
                    onChange={(e) => setSpanlineSignerEmail(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Will sign second, after the subcontractor</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" className="w-full sm:w-auto" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
                <Button
                  className="w-full sm:w-auto"
                  disabled={!subcontractorEmail || !spanlineSignerName || !spanlineSignerEmail || sendMutation.isPending}
                  onClick={async () => {
                    try {
                      // Save first to ensure latest data
                      await handleSave();
                      await sendMutation.mutateAsync({
                        id: subcontractId!,
                        subcontractorEmail,
                        spanlineSignerName,
                        spanlineSignerEmail,
                        origin: window.location.origin,
                      });
                      utils.subcontract.get.invalidate({ id: subcontractId! });
                      toast.success("Subcontract sent for signature");
                      setSendDialogOpen(false);
                    } catch (err: any) {
                      toast.error(err.message || "Failed to send");
                    }
                  }}
                >
                  {sendMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Sending...</>
                  ) : (
                    <><Send className="h-4 w-4 mr-1" /> Send for Signature</>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

function ChecklistSelect({
  value,
  onChange,
  className = "h-7 w-full text-xs sm:max-w-32",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const selectedValue = String(value || "N/A");
  const isCustom = selectedValue && !CHECKLIST_OPTIONS.includes(selectedValue);

  return (
    <Select value={selectedValue} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {isCustom && <SelectItem value={selectedValue}>{selectedValue}</SelectItem>}
        {CHECKLIST_OPTIONS.map((option) => (
          <SelectItem key={option} value={option}>{option}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MilestoneClaimBadge({ index, claimStatus }: { index: number; claimStatus: any[] | undefined }) {
  if (!claimStatus) return <span className="text-[10px] text-muted-foreground">—</span>;
  
  const claims = claimStatus.filter((c: any) => c.subcontractMilestoneIndex === index);
  if (claims.length === 0) return <span className="text-[10px] text-muted-foreground">—</span>;

  const status = claims[0].approvalStatus;
  
  switch (status) {
    case "approved":
    case "paid":
      return (
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-green-300 text-green-700 bg-green-50">
          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
          {status === "paid" ? "Paid" : "Approved"}
        </Badge>
      );
    case "submitted":
    case "under_review":
    case "pending_approval":
      return (
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50">
          <Clock className="h-2.5 w-2.5 mr-0.5" />
          Claimed
        </Badge>
      );
    case "rejected":
      return (
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-red-300 text-red-700 bg-red-50">
          <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
          Rejected
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-[9px] px-1.5 py-0">
          <Clock className="h-2.5 w-2.5 mr-0.5" />
          Pending
        </Badge>
      );
  }
}
