import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Props {
  projectId: number;
  jurisdiction?: "NSW" | "ACT";
}

const LODGEMENT_TYPES = [
  { value: "NSW_DA", label: "Development Application", jurisdiction: "NSW" },
  { value: "NSW_CDC", label: "Complying Development Certificate", jurisdiction: "NSW" },
  { value: "NSW_CC", label: "Construction Certificate", jurisdiction: "NSW" },
  { value: "NSW_OC", label: "Occupation Certificate", jurisdiction: "NSW" },
  { value: "NSW_S68", label: "Section 68 Approval", jurisdiction: "NSW" },
  { value: "NSW_S96", label: "Section 4.55 Modification", jurisdiction: "NSW" },
  { value: "ACT_DA", label: "Development Application", jurisdiction: "ACT" },
  { value: "ACT_BA", label: "Building Approval", jurisdiction: "ACT" },
  { value: "ACT_COU", label: "Certificate of Use/Occupancy", jurisdiction: "ACT" },
  { value: "ACT_EDP", label: "Exempt Development", jurisdiction: "ACT" },
  { value: "ACT_MERIT", label: "Merit Track Application", jurisdiction: "ACT" },
  { value: "ACT_IMPACT", label: "Impact Track Application", jurisdiction: "ACT" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  submitted: "bg-blue-100 text-blue-800",
  accepted: "bg-indigo-100 text-indigo-800",
  under_assessment: "bg-amber-100 text-amber-800",
  additional_info: "bg-orange-100 text-orange-800",
  determined: "bg-green-100 text-green-800",
  refused: "bg-red-100 text-red-800",
  withdrawn: "bg-gray-100 text-gray-800",
};

const LODGEMENT_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Lodged" },
  { value: "accepted", label: "Accepted" },
  { value: "under_assessment", label: "Under assessment" },
  { value: "additional_info", label: "Additional info requested" },
  { value: "determined", label: "Approved / determined" },
  { value: "refused", label: "Refused" },
  { value: "withdrawn", label: "Withdrawn" },
];

export function ApprovalLodgementsTab({ projectId, jurisdiction }: Props) {
  const filteredTypes = jurisdiction
    ? LODGEMENT_TYPES.filter((t) => t.jurisdiction === jurisdiction)
    : LODGEMENT_TYPES;

  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ lodgementType: "", externalPortal: "", authorityName: "" });

  // Fetch council fee entries from master_data for NSW council dropdown
  const { data: councilFeeData } = trpc.masterData.getByCategory.useQuery(
    { category: "council_fee" },
    { enabled: jurisdiction === "NSW" }
  );

  // For ACT, auto-set authority to ACTPLA
  useEffect(() => {
    if (jurisdiction === "ACT") {
      setNewForm((prev) => ({ ...prev, authorityName: "ACTPLA" }));
    }
  }, [jurisdiction]);

  // Extract unique council names from the council_fee master data
  const nswCouncils = councilFeeData
    ? councilFeeData
        .map((item: any) => item.key || item.dataKey || "")
        .filter((name: string) => name && name !== "ACTPLA" && name !== "ACT - BA Only")
        .sort((a: string, b: string) => a.localeCompare(b))
    : [];

  const { data: lodgements, isLoading } = trpc.approvals.lodgements.list.useQuery({ projectId });
  const utils = trpc.useUtils();

  const createLodgement = trpc.approvals.lodgements.create.useMutation({
    onSuccess: () => {
      toast.success("Lodgement created");
      setShowNew(false);
      setNewForm({ lodgementType: "", externalPortal: "", authorityName: jurisdiction === "ACT" ? "ACTPLA" : "" });
      utils.approvals.lodgements.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const updateLodgement = trpc.approvals.lodgements.update.useMutation({
    onSuccess: () => {
      toast.success("Lodgement updated");
      utils.approvals.lodgements.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const updateLodgementStatus = (lodgement: any, status: string) => {
    const now = new Date().toISOString();
    const data: Record<string, unknown> = { status };
    if (status === "submitted" && !lodgement.submittedAt) data.submittedAt = now;
    if (status === "accepted" && !lodgement.acceptedAt) data.acceptedAt = now;
    if (["determined", "refused", "withdrawn"].includes(status) && !lodgement.determinationAt) {
      data.determinationAt = now;
    }
    if (status === "determined") data.determinationOutcome = "approved";
    if (status === "refused") data.determinationOutcome = "refused";
    if (status === "withdrawn") data.determinationOutcome = "withdrawn";
    updateLodgement.mutate({ id: lodgement.id, projectId, data });
  };

  const handleCreate = () => {
    if (!newForm.lodgementType) {
      toast.error("Lodgement type is required");
      return;
    }
    if (jurisdiction === "NSW" && !newForm.authorityName) {
      toast.error("Council is required for NSW lodgements");
      return;
    }
    createLodgement.mutate({
      projectId,
      lodgementType: newForm.lodgementType,
      externalPortal: newForm.externalPortal || undefined,
      authorityName: newForm.authorityName || undefined,
    });
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Lodgements</h3>
        <Dialog open={showNew} onOpenChange={(open) => {
          setShowNew(open);
          if (open && jurisdiction === "ACT") {
            setNewForm((prev) => ({ ...prev, authorityName: "ACTPLA" }));
          }
        }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> New Lodgement
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Lodgement</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Type *</Label>
                <Select value={newForm.lodgementType} onValueChange={(v) => setNewForm({ ...newForm, lodgementType: v })}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {filteredTypes.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>External Reference Number</Label>
                <Input
                  placeholder="e.g. DA2024/1234"
                  value={newForm.externalPortal}
                  onChange={(e) => setNewForm({ ...newForm, externalPortal: e.target.value })}
                />
              </div>
              <div>
                <Label>Authority / Council {jurisdiction === "NSW" ? "*" : ""}</Label>
                {jurisdiction === "ACT" ? (
                  <Input
                    value="ACTPLA"
                    disabled
                    className="bg-muted cursor-not-allowed"
                  />
                ) : jurisdiction === "NSW" ? (
                  <Select value={newForm.authorityName} onValueChange={(v) => setNewForm({ ...newForm, authorityName: v })}>
                    <SelectTrigger><SelectValue placeholder="Select council" /></SelectTrigger>
                    <SelectContent>
                      {nswCouncils.map((council: string) => (
                        <SelectItem key={council} value={council}>{council}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="e.g. Penrith City Council"
                    value={newForm.authorityName}
                    onChange={(e) => setNewForm({ ...newForm, authorityName: e.target.value })}
                  />
                )}
              </div>
              <Button onClick={handleCreate} disabled={createLodgement.isPending} className="w-full">
                {createLodgement.isPending ? "Creating..." : "Create Lodgement"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : !lodgements || lodgements.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No lodgements yet. Create one to start tracking submissions.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {lodgements.map((lodgement: any) => (
            <Card key={lodgement.id}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">
                        {LODGEMENT_TYPES.find((t) => t.value === lodgement.lodgementType)?.label || lodgement.lodgementType}
                      </span>
                      <Badge variant="outline" className={STATUS_COLORS[lodgement.status] || ""}>
                        {lodgement.status}
                      </Badge>
                    </div>
                    {lodgement.authorityName && (
                      <p className="text-sm text-muted-foreground">Authority: {lodgement.authorityName}</p>
                    )}
                    {lodgement.externalReferenceNumber && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />
                        Ref: {lodgement.externalReferenceNumber}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 md:items-end">
                    <Select
                      value={lodgement.status || "draft"}
                      onValueChange={(status) => updateLodgementStatus(lodgement, status)}
                      disabled={updateLodgement.isPending}
                    >
                      <SelectTrigger className="h-9 w-full md:w-56">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LODGEMENT_STATUSES.map((status) => (
                          <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex flex-wrap gap-1 md:justify-end">
                      {lodgement.status === "draft" && (
                        <Button variant="outline" size="sm" onClick={() => updateLodgementStatus(lodgement, "submitted")}>
                          Mark lodged
                        </Button>
                      )}
                      {["submitted", "accepted", "under_assessment", "additional_info"].includes(lodgement.status) && (
                        <Button variant="outline" size="sm" onClick={() => updateLodgementStatus(lodgement, "determined")}>
                          Mark approved
                        </Button>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground md:text-right">
                      {lodgement.submittedAt && <p>Lodged: {new Date(lodgement.submittedAt).toLocaleDateString()}</p>}
                      {lodgement.acceptedAt && <p>Accepted: {new Date(lodgement.acceptedAt).toLocaleDateString()}</p>}
                      {lodgement.determinationAt && <p>Determined: {new Date(lodgement.determinationAt).toLocaleDateString()}</p>}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
