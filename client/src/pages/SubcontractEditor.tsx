import { useState, useEffect, useCallback } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  cancelled: "bg-red-100 text-red-700",
};

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

  // Fetch all trades for the dropdown
  const { data: allInstallers } = trpc.construction.installers.list.useQuery();

  // Form state
  const [installerId, setInstallerId] = useState<number | null>(null);
  const [jobNumber, setJobNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [constructionManager, setConstructionManager] = useState("");
  const [subcontractorName, setSubcontractorName] = useState("");
  const [subcontractorPhone, setSubcontractorPhone] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [subcontractSum, setSubcontractSum] = useState("");
  const [estimatedCommencement, setEstimatedCommencement] = useState("");
  const [estimatedCompletion, setEstimatedCompletion] = useState("");
  const [flashingBySubcontractor, setFlashingBySubcontractor] = useState("N/A");

  // Send for Signature dialog state
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [subcontractorEmail, setSubcontractorEmail] = useState("");
  const [spanlineSignerName, setSpanlineSignerName] = useState("");
  const [spanlineSignerEmail, setSpanlineSignerEmail] = useState("");
  const sendMutation = trpc.subcontract.sendForSignature.useMutation();

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
      setConstructionManager(subcontract.constructionManager || "");
      setInstallerId(subcontract.installerId || null);
      setSubcontractorName(subcontract.subcontractorName || "");
      setSubcontractorPhone(subcontract.subcontractorPhone || "");
      setSiteAddress(subcontract.siteAddress || "");
      setSubcontractSum(subcontract.subcontractSum || "0.00");
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
        constructionManager,
        subcontractorName,
        subcontractorPhone,
        siteAddress,
        subcontractSum,
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
  }, [subcontractId, installerId, jobNumber, clientName, constructionManager, subcontractorName, subcontractorPhone, siteAddress, subcontractSum, milestones, estimatedCommencement, estimatedCompletion, buildingFile, inspections, otherContractors, electricalCabling, downpipes, flashingBySubcontractor]);

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

  if (isLoading) {
    return (
      <div className="container py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="h-96 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!subcontract) {
    return (
      <div className="container py-6">
        <p className="text-muted-foreground">Subcontract not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/construction")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Jobs
        </Button>
      </div>
    );
  }

  return (
    <div className="container py-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Project Subcontract
            </h1>
            <p className="text-sm text-muted-foreground">Job #{jobNumber} — {clientName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={STATUS_COLORS[subcontract.status]}>
            {subcontract.status.charAt(0).toUpperCase() + subcontract.status.slice(1)}
          </Badge>
          <Button
            size="sm"
            variant="outline"
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
          <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
            <Save className="h-4 w-4 mr-1" /> Save
          </Button>
        </div>
      </div>

      {/* Intro Text */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            The information identified in this document forms a specific separate Project Subcontract between Altaspan and the Subcontractor.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            The Project Subcontract incorporates by reference the general conditions of the latest current version of the Master Subcontract that has been agreed between Altaspan and the Subcontractor.
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
              <Label className="text-xs font-medium">Construction Manager</Label>
              <Input value={constructionManager} onChange={(e) => setConstructionManager(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium">Subcontractor</Label>
              <Select
                value={installerId ? installerId.toString() : "custom"}
                onValueChange={(v) => {
                  if (v === "custom") {
                    setInstallerId(null);
                  } else {
                    const id = parseInt(v);
                    setInstallerId(id);
                    const selected = allInstallers?.find((i: any) => i.id === id);
                    if (selected) {
                      setSubcontractorName(selected.name);
                      setSubcontractorPhone(selected.phone || "");
                    }
                  }
                }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select trade..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom (type manually)</SelectItem>
                  {allInstallers?.filter((i: any) => i.active).map((i: any) => (
                    <SelectItem key={i.id} value={i.id.toString()}>
                      {i.name}{i.tradeType && i.tradeType !== "installer" ? ` (${i.tradeType})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!installerId && (
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
                className="h-8 text-sm max-w-48"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Schedule */}
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
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
            <table className="w-full text-sm">
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
          <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={addMilestone}>
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
              <div key={key} className="flex items-center justify-between gap-2">
                <Label className="text-xs capitalize w-28">{key === "materialsList" ? "Materials list" : key}</Label>
                <Input
                  value={buildingFile[key]}
                  onChange={(e) => setBuildingFile({ ...buildingFile, [key]: e.target.value })}
                  className="h-7 text-xs max-w-32"
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
              <div key={key} className="flex items-center justify-between gap-2">
                <Label className="text-xs capitalize w-28">{key}</Label>
                <Input
                  value={inspections[key]}
                  onChange={(e) => setInspections({ ...inspections, [key]: e.target.value })}
                  className="h-7 text-xs max-w-32"
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
              <div key={key} className="flex items-center justify-between gap-2">
                <Label className="text-xs capitalize w-28">{key}</Label>
                <Input
                  value={otherContractors[key]}
                  onChange={(e) => setOtherContractors({ ...otherContractors, [key]: e.target.value })}
                  className="h-7 text-xs max-w-32"
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
                <div key={key} className="flex items-center justify-between gap-2">
                  <Label className="text-xs capitalize w-28">{key}</Label>
                  <Input
                    value={electricalCabling[key]}
                    onChange={(e) => setElectricalCabling({ ...electricalCabling, [key]: e.target.value })}
                    className="h-7 text-xs max-w-32"
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
                <div key={key} className="flex items-center justify-between gap-2">
                  <Label className="text-xs w-40">{label}</Label>
                  <Input
                    value={downpipes[key]}
                    onChange={(e) => setDownpipes({ ...downpipes, [key]: e.target.value })}
                    className="h-7 text-xs max-w-32"
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
          <div className="flex items-center justify-between gap-4">
            <Label className="text-sm font-medium">Flashing measurement and design by Subcontractor:</Label>
            <Input
              value={flashingBySubcontractor}
              onChange={(e) => setFlashingBySubcontractor(e.target.value)}
              className="h-8 text-sm max-w-32"
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
            By working on the site listed you agree to the Build fee issued by Altaspan and will conduct work that is to the highest
            standard and working inline with all WHS requirements, the site will be keep clean and free of mess by the contractor
            while works are being carried out, any damage to materials caused by the contractor can be back charged to the
            contractor at Altaspan's discretion, a retention is kept for 15 days after the works have been completed by the contractor,
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
                Executed by Authorised Signatory for and on behalf of Commisso Group Pty Limited:
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
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => window.history.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
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
          <Button variant="outline" onClick={handleSave} disabled={updateMutation.isPending}>
            <Save className="h-4 w-4 mr-1" /> Save Draft
          </Button>
          <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={subcontract.status === "sent" || subcontract.status === "signed"}>
                <Send className="h-4 w-4 mr-1" /> Send for Signature
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Send Subcontract for Signature</DialogTitle>
                <DialogDescription>
                  This will send the subcontract via SignWell for dual digital signatures — first the subcontractor, then the Altaspan authorised signatory.
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
                  <Label className="text-sm font-medium">Altaspan Authorised Signatory Name</Label>
                  <Input
                    placeholder="e.g. Tony Commisso"
                    value={spanlineSignerName}
                    onChange={(e) => setSpanlineSignerName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Altaspan Authorised Signatory Email</Label>
                  <Input
                    type="email"
                    placeholder="signer@altaspan.com"
                    value={spanlineSignerEmail}
                    onChange={(e) => setSpanlineSignerEmail(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Will sign second, after the subcontractor</p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
                <Button
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
