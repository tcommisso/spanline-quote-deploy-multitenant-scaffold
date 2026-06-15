import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation } from "wouter";
import { ArrowLeft, Save, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import ClientPicker from "@/components/ClientPicker";

interface ContactSelection {
  id?: number | null;
  name: string;
}

export default function ApprovalsProjectNew() {
  const [, navigate] = useLocation();
  const [linkedLeadId, setLinkedLeadId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    jurisdiction: "" as "NSW" | "ACT" | "",
    propertyAddress: "",
    propertySuburb: "",
    propertyState: "NSW",
    propertyPostcode: "",
    lotNumber: "",
    dpNumber: "",
    sectionNumber: "",
    blockNumber: "",
    zoning: "",
    buildingClass: "10a",
    estimatedCost: "",
    descriptionOfWork: "",
    riskFlags: {
      heritage: false,
      bushfire: false,
      flood: false,
      trees: false,
      easements: false,
      strata: false,
      nca: false,
      lease: false,
      utility: false,
    },
  });

  const [client, setClient] = useState<ContactSelection>({ name: "" });
  const [applicant, setApplicant] = useState<ContactSelection>({ name: "" });
  const [certifier, setCertifier] = useState<ContactSelection>({ name: "" });

  // Fetch contract value when a lead is linked
  const { data: linkedContract } = trpc.crm.contracts.get.useQuery(
    { leadId: linkedLeadId! },
    { enabled: !!linkedLeadId }
  );

  const createProject = trpc.approvals.projects.create.useMutation({
    onSuccess: (result) => {
      toast.success(`Project ${result.projectNumber} created`);
      navigate(`/approvals/projects/${result.id}`);
    },
    onError: (err) => {
      toast.error(err.message || "Failed to create project");
    },
  });

  // When a CRM lead is selected, auto-populate all available fields
  const handleLeadSelect = (leadData: {
    id: number;
    name: string;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    address?: string | null;
    suburb?: string | null;
    state?: string | null;
    postcode?: string | null;
    designAdvisor?: string | null;
  }) => {
    setLinkedLeadId(leadData.id);
    // Set client from the lead
    setClient({ id: leadData.id, name: leadData.name });

    // Auto-populate form fields from the lead
    setForm((prev) => ({
      ...prev,
      name: prev.name || `${leadData.address || leadData.suburb || leadData.name} — Approval`,
      propertyAddress: leadData.address || prev.propertyAddress,
      propertySuburb: leadData.suburb || prev.propertySuburb,
      propertyState: leadData.state || prev.propertyState,
      propertyPostcode: leadData.postcode || prev.propertyPostcode,
      // Set jurisdiction from state
      jurisdiction: leadData.state === "ACT" ? "ACT" : (leadData.state === "NSW" || prev.jurisdiction === "" ? "NSW" : prev.jurisdiction) as any,
    }));

    toast.success("Lead linked — fields auto-populated");
  };

  // Apply contract value when it loads
  const applyContractValue = () => {
    if (linkedContract?.contractValue) {
      setForm((prev) => ({
        ...prev,
        estimatedCost: prev.estimatedCost || linkedContract.contractValue || "",
      }));
      toast.info(`Contract value $${Number(linkedContract.contractValue).toLocaleString()} applied`);
    }
  };

  // Effect: apply contract value when it becomes available
  if (linkedContract?.contractValue && !form.estimatedCost) {
    // Use a microtask to avoid setState during render
    Promise.resolve().then(() => {
      setForm((prev) => {
        if (!prev.estimatedCost && linkedContract.contractValue) {
          return { ...prev, estimatedCost: linkedContract.contractValue };
        }
        return prev;
      });
    });
  }

  const handleUnlinkLead = () => {
    setLinkedLeadId(null);
    toast.info("Lead unlinked — fields preserved for manual editing");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.jurisdiction) {
      toast.error("Project name and jurisdiction are required");
      return;
    }
    createProject.mutate({
      name: form.name,
      jurisdiction: form.jurisdiction as "NSW" | "ACT",
      propertyAddress: form.propertyAddress || undefined,
      propertySuburb: form.propertySuburb || undefined,
      propertyState: form.propertyState || undefined,
      propertyPostcode: form.propertyPostcode || undefined,
      lotNumber: form.lotNumber || undefined,
      dpNumber: form.dpNumber || undefined,
      sectionNumber: form.sectionNumber || undefined,
      blockNumber: form.blockNumber || undefined,
      zoning: form.zoning || undefined,
      buildingClass: form.buildingClass || undefined,
      estimatedCost: form.estimatedCost || undefined,
      descriptionOfWork: form.descriptionOfWork || undefined,
      clientName: client.name || undefined,
      clientContactId: client.id || undefined,
      applicantName: applicant.name || undefined,
      applicantContactId: applicant.id || undefined,
      certifierName: certifier.name || undefined,
      certifierContactId: certifier.id || undefined,
      crmLeadId: linkedLeadId || undefined,
      riskFlags: form.riskFlags,
    });
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const toggleRisk = (flag: string) => {
    setForm((prev) => ({
      ...prev,
      riskFlags: { ...prev.riskFlags, [flag]: !prev.riskFlags[flag as keyof typeof prev.riskFlags] },
    }));
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/approvals/projects")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold">New Approval Project</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Link to CRM Lead — auto-populate */}
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Link to CRM Lead
            </CardTitle>
            <CardDescription>
              Select a CRM lead to auto-fill address, contact, and contract value
            </CardDescription>
          </CardHeader>
          <CardContent>
            {linkedLeadId ? (
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <ClientPicker
                    selectedClientId={linkedLeadId}
                    onClientSelect={handleLeadSelect}
                    onClientClear={handleUnlinkLead}
                    clientName={client.name}
                  />
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={handleUnlinkLead}>
                  <Unlink className="h-4 w-4 mr-1" />
                  Unlink
                </Button>
              </div>
            ) : (
              <ClientPicker
                selectedClientId={null}
                onClientSelect={handleLeadSelect}
                onClientClear={() => {}}
                clientName=""
              />
            )}
            {linkedContract?.contractValue && (
              <div className="mt-2 text-sm text-muted-foreground flex items-center gap-2">
                <span>Contract value: <strong>${Number(linkedContract.contractValue).toLocaleString()}</strong></span>
                {!form.estimatedCost && (
                  <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={applyContractValue}>
                    Apply
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Project Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                placeholder="e.g. 123 Main St — New Dwelling"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="jurisdiction">Jurisdiction *</Label>
              <Select value={form.jurisdiction} onValueChange={(v) => updateField("jurisdiction", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select jurisdiction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NSW">New South Wales</SelectItem>
                  <SelectItem value="ACT">Australian Capital Territory</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="buildingClass">Building Class</Label>
              <Select value={form.buildingClass} onValueChange={(v) => updateField("buildingClass", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1a">Class 1a — Detached House</SelectItem>
                  <SelectItem value="1b">Class 1b — Boarding/Guest House</SelectItem>
                  <SelectItem value="2">Class 2 — Apartments</SelectItem>
                  <SelectItem value="3">Class 3 — Residential (other)</SelectItem>
                  <SelectItem value="4">Class 4 — Dwelling in Non-Res</SelectItem>
                  <SelectItem value="5">Class 5 — Office</SelectItem>
                  <SelectItem value="6">Class 6 — Retail/Shop</SelectItem>
                  <SelectItem value="7a">Class 7a — Carpark</SelectItem>
                  <SelectItem value="7b">Class 7b — Warehouse/Storage</SelectItem>
                  <SelectItem value="8">Class 8 — Laboratory/Factory</SelectItem>
                  <SelectItem value="9a">Class 9a — Health Care</SelectItem>
                  <SelectItem value="9b">Class 9b — Assembly</SelectItem>
                  <SelectItem value="9c">Class 9c — Aged Care</SelectItem>
                  <SelectItem value="10a">Class 10a — Non-habitable (shed, carport)</SelectItem>
                  <SelectItem value="10b">Class 10b — Fence, Retaining Wall</SelectItem>
                  <SelectItem value="10c">Class 10c — Swimming Pool</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="estimatedCost">Estimated Cost of Work ($)</Label>
              <Input
                id="estimatedCost"
                type="number"
                placeholder="e.g. 250000"
                value={form.estimatedCost}
                onChange={(e) => updateField("estimatedCost", e.target.value)}
              />
              {linkedContract?.contractValue && form.estimatedCost !== linkedContract.contractValue && (
                <p className="text-xs text-muted-foreground mt-1">
                  Contract value: ${Number(linkedContract.contractValue).toLocaleString()}
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="descriptionOfWork">Description of Work</Label>
              <Textarea
                id="descriptionOfWork"
                placeholder="Brief description of the proposed works..."
                value={form.descriptionOfWork}
                onChange={(e) => updateField("descriptionOfWork", e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Property Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Property Details</CardTitle>
            {linkedLeadId && (
              <CardDescription>Auto-populated from linked CRM lead</CardDescription>
            )}
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="propertyAddress">Street Address</Label>
              <Input
                id="propertyAddress"
                placeholder="e.g. 123 Main Street"
                value={form.propertyAddress}
                onChange={(e) => updateField("propertyAddress", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="propertySuburb">Suburb</Label>
              <Input
                id="propertySuburb"
                placeholder="Suburb"
                value={form.propertySuburb}
                onChange={(e) => updateField("propertySuburb", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="propertyPostcode">Postcode</Label>
              <Input
                id="propertyPostcode"
                placeholder="2000"
                value={form.propertyPostcode}
                onChange={(e) => updateField("propertyPostcode", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="lotNumber">Lot Number</Label>
              <Input
                id="lotNumber"
                placeholder="Lot"
                value={form.lotNumber}
                onChange={(e) => updateField("lotNumber", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="dpNumber">DP Number</Label>
              <Input
                id="dpNumber"
                placeholder="DP"
                value={form.dpNumber}
                onChange={(e) => updateField("dpNumber", e.target.value)}
              />
            </div>
            {form.jurisdiction === "ACT" && (
              <>
                <div>
                  <Label htmlFor="sectionNumber">Section</Label>
                  <Input
                    id="sectionNumber"
                    placeholder="Section"
                    value={form.sectionNumber}
                    onChange={(e) => updateField("sectionNumber", e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="blockNumber">Block</Label>
                  <Input
                    id="blockNumber"
                    placeholder="Block"
                    value={form.blockNumber}
                    onChange={(e) => updateField("blockNumber", e.target.value)}
                  />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="zoning">Zoning</Label>
              <Input
                id="zoning"
                placeholder="e.g. R2 Low Density Residential"
                value={form.zoning}
                onChange={(e) => updateField("zoning", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Parties (Applicant & Certifier with auto-complete) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Parties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-2 block">Client</Label>
              <ClientPicker
                selectedClientId={client.id}
                onClientSelect={(c) => setClient({ id: c.id, name: c.name })}
                onClientClear={() => setClient({ name: "" })}
                clientName={client.name}
              />
              {!client.id && (
                <div className="mt-2">
                  <Input
                    placeholder="Client name (if not in CRM)"
                    value={client.name}
                    onChange={(e) => setClient({ name: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div>
              <Label className="mb-2 block">Applicant</Label>
              <ClientPicker
                selectedClientId={applicant.id}
                onClientSelect={(c) => setApplicant({ id: c.id, name: c.name })}
                onClientClear={() => setApplicant({ name: "" })}
                clientName={applicant.name}
              />
              {!applicant.id && (
                <div className="mt-2">
                  <Input
                    placeholder="Applicant name (if not in CRM)"
                    value={applicant.name}
                    onChange={(e) => setApplicant({ name: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div>
              <Label className="mb-2 block">Certifier / PCA</Label>
              <ClientPicker
                selectedClientId={certifier.id}
                onClientSelect={(c) => setCertifier({ id: c.id, name: c.name })}
                onClientClear={() => setCertifier({ name: "" })}
                clientName={certifier.name}
              />
              {!certifier.id && (
                <div className="mt-2">
                  <Input
                    placeholder="Certifier name (if not in CRM)"
                    value={certifier.name}
                    onChange={(e) => setCertifier({ name: e.target.value })}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Risk Flags */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Risk Flags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(form.riskFlags).map(([key, value]) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox
                    id={`risk-${key}`}
                    checked={value}
                    onCheckedChange={() => toggleRisk(key)}
                  />
                  <Label htmlFor={`risk-${key}`} className="text-sm capitalize cursor-pointer">
                    {key === "nca" ? "NCA / Designated Land" : key === "lease" ? "Crown Lease" : key}
                  </Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/approvals/projects")}>
            Cancel
          </Button>
          <Button type="submit" disabled={createProject.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {createProject.isPending ? "Creating..." : "Create Project"}
          </Button>
        </div>
      </form>
    </div>
  );
}
