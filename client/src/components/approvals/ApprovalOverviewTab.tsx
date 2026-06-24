import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { Edit, Save, X, AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import ClientPicker from "@/components/ClientPicker";
import SupplierPicker from "@/components/SupplierPicker";

interface ApprovalOverviewTabProps {
  project: any;
}

function dateInputValue(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function isIssuedHbcfStatus(value?: string | null) {
  const status = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ");
  return !status || ["issued", "current", "active", "valid", "completed", "complete", "open job"].includes(status);
}

export function ApprovalOverviewTab({ project }: ApprovalOverviewTabProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(project);
  const [clientContact, setClientContact] = useState<{ id?: number | null; name: string }>({
    id: project.clientContactId,
    name: project.clientName || "",
  });
  const [applicantContact, setApplicantContact] = useState<{ id?: number | null; name: string }>({
    id: project.applicantContactId,
    name: project.applicantName || "",
  });
  const [certifierContact, setCertifierContact] = useState<{ id?: number | null; name: string }>({
    id: project.certifierContactId,
    name: project.certifierName || "",
  });
  const utils = trpc.useUtils();

  const updateProject = trpc.approvals.projects.update.useMutation({
    onSuccess: () => {
      toast.success("Project updated");
      setEditing(false);
      utils.approvals.projects.get.invalidate({ id: project.id });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = () => {
    updateProject.mutate({
      id: project.id,
      data: {
        name: form.name,
        propertyAddress: form.propertyAddress,
        propertySuburb: form.propertySuburb,
        propertyPostcode: form.propertyPostcode,
        lotNumber: form.lotNumber,
        dpNumber: form.dpNumber,
        zoning: form.zoning,
        buildingClass: form.buildingClass,
        estimatedCost: form.estimatedCost,
        descriptionOfWork: form.descriptionOfWork,
        clientName: clientContact.name || null,
        clientContactId: clientContact.id || null,
        applicantName: applicantContact.name || null,
        applicantContactId: applicantContact.id || null,
        certifierName: certifierContact.name || null,
        certifierContactId: certifierContact.id || null,
        overallStatus: form.overallStatus,
      },
    });
  };

  const handleCancel = () => {
    setEditing(false);
    setForm(project);
    setClientContact({ id: project.clientContactId, name: project.clientName || "" });
    setApplicantContact({ id: project.applicantContactId, name: project.applicantName || "" });
    setCertifierContact({ id: project.certifierContactId, name: project.certifierName || "" });
  };

  const riskFlags = project.riskFlags || {};
  const activeRisks = Object.entries(riskFlags).filter(([, v]) => v);

  return (
    <div className="space-y-4 mt-4">
      {/* Status & Workflow */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Current State</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold capitalize">{project.currentState || "Intake"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Current Gate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">Gate {project.currentGate || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pathway</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {project.confirmedPathway || project.recommendedPathway || "Not assessed"}
            </p>
            {project.pathwayConfidence && (
              <Badge variant="outline" className="mt-1">{project.pathwayConfidence} confidence</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <HbcfProjectCard project={project} />

      {/* Project Details */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Project Details</CardTitle>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Edit className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={updateProject.isPending}>
                <Save className="h-3.5 w-3.5 mr-1" /> Save
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {!editing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Name:</span>
                <p className="font-medium">{project.name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>
                <p className="font-medium capitalize">{project.overallStatus}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Address:</span>
                <p className="font-medium">{project.propertyAddress || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Suburb:</span>
                <p className="font-medium">{project.propertySuburb || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Lot/DP:</span>
                <p className="font-medium">{project.lotNumber ? `Lot ${project.lotNumber} DP ${project.dpNumber}` : "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Zoning:</span>
                <p className="font-medium">{project.zoning || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Building Class:</span>
                <p className="font-medium">{project.buildingClass || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Estimated Cost:</span>
                <p className="font-medium">{project.estimatedCost ? `$${Number(project.estimatedCost).toLocaleString()}` : "—"}</p>
              </div>
              <div className="md:col-span-2">
                <span className="text-muted-foreground">Description of Work:</span>
                <p className="font-medium">{project.descriptionOfWork || "—"}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Name</Label>
                <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.overallStatus} onValueChange={(v) => setForm({ ...form, overallStatus: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="intake">Intake</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Address</Label>
                <Input value={form.propertyAddress || ""} onChange={(e) => setForm({ ...form, propertyAddress: e.target.value })} />
              </div>
              <div>
                <Label>Suburb</Label>
                <Input value={form.propertySuburb || ""} onChange={(e) => setForm({ ...form, propertySuburb: e.target.value })} />
              </div>
              <div>
                <Label>Postcode</Label>
                <Input value={form.propertyPostcode || ""} onChange={(e) => setForm({ ...form, propertyPostcode: e.target.value })} />
              </div>
              <div>
                <Label>Building Class</Label>
                <Input value={form.buildingClass || ""} onChange={(e) => setForm({ ...form, buildingClass: e.target.value })} />
              </div>
              <div>
                <Label>Estimated Cost</Label>
                <Input type="number" value={form.estimatedCost || ""} onChange={(e) => setForm({ ...form, estimatedCost: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label>Description of Work</Label>
                <Textarea value={form.descriptionOfWork || ""} onChange={(e) => setForm({ ...form, descriptionOfWork: e.target.value })} rows={3} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Parties (with CRM linking) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Parties</CardTitle>
        </CardHeader>
        <CardContent>
          {!editing ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Client:</span>
                <p className="font-medium">{project.clientName || "—"}</p>
                {project.clientContactId && (
                  <Badge variant="outline" className="text-xs mt-1">Linked to CRM</Badge>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Applicant:</span>
                <p className="font-medium">{project.applicantName || "—"}</p>
                {project.applicantContactId && (
                  <Badge variant="outline" className="text-xs mt-1">Linked to CRM</Badge>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Certifier / PCA:</span>
                <p className="font-medium">{project.certifierName || "—"}</p>
                {project.certifierContactId && (
                  <Badge variant="outline" className="text-xs mt-1">Linked to Supplier</Badge>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">Project Manager:</span>
                <p className="font-medium">{project.projectManagerName || "—"}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Client</Label>
                <ClientPicker
                  selectedClientId={clientContact.id}
                  onClientSelect={(c) => setClientContact({ id: c.id, name: c.name })}
                  onClientClear={() => setClientContact({ name: "" })}
                  clientName={clientContact.name}
                />
                {!clientContact.id && (
                  <div className="mt-2">
                    <Input
                      placeholder="Client name (if not in CRM)"
                      value={clientContact.name}
                      onChange={(e) => setClientContact({ name: e.target.value })}
                    />
                  </div>
                )}
              </div>
              <div>
                <Label className="mb-2 block">Applicant</Label>
                <ClientPicker
                  selectedClientId={applicantContact.id}
                  onClientSelect={(c) => setApplicantContact({ id: c.id, name: c.name })}
                  onClientClear={() => setApplicantContact({ name: "" })}
                  clientName={applicantContact.name}
                />
                {!applicantContact.id && (
                  <div className="mt-2">
                    <Input
                      placeholder="Applicant name (if not in CRM)"
                      value={applicantContact.name}
                      onChange={(e) => setApplicantContact({ name: e.target.value })}
                    />
                  </div>
                )}
              </div>
              <div>
                <Label className="mb-2 block">Certifier / PCA</Label>
                <SupplierPicker
                  selectedSupplierId={certifierContact.id}
                  onSupplierSelect={(supplier) => setCertifierContact({ id: supplier.id, name: supplier.name })}
                  onSupplierClear={() => setCertifierContact({ name: "" })}
                  supplierName={certifierContact.name}
                  supplierScope="construction"
                  placeholder="Search construction suppliers for certifier / PCA..."
                />
                {!certifierContact.id && (
                  <div className="mt-2">
                    <Input
                      placeholder="Certifier name (if not in suppliers)"
                      value={certifierContact.name}
                      onChange={(e) => setCertifierContact({ name: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Risk Flags */}
      {activeRisks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Risk Flags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {activeRisks.map(([key]) => (
                <Badge key={key} variant="outline" className="bg-amber-50 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HbcfProjectCard({ project }: { project: any }) {
  const utils = trpc.useUtils();
  const { data: gateStatus } = trpc.approvals.hbcf.gateStatus.useQuery({ projectId: project.id });
  const { data: certificates } = trpc.approvals.hbcf.certificates.list.useQuery({ projectId: project.id });
  const [form, setForm] = useState({
    certificateNumber: "",
    policyNumber: "",
    status: "issued",
    issuedAt: "",
    expiresAt: "",
    builderName: "",
    builderLicenceNumber: "",
    insurerName: "",
    contractPrice: project.estimatedCost || "",
    certificateUrl: "",
    notes: "",
  });

  const syncProject = trpc.approvals.hbcf.certificates.syncProject.useMutation({
    onSuccess: (result) => {
      const linked = (result as any).linked || 0;
      if (linked > 0) {
        toast.success("HBCF sync complete: linked existing certificate from the register");
      } else {
        toast.success(`HBCF sync complete: ${result.imported} certificate${result.imported === 1 ? "" : "s"} imported`);
      }
      utils.approvals.hbcf.certificates.list.invalidate({ projectId: project.id });
      utils.approvals.hbcf.gateStatus.invalidate({ projectId: project.id });
      utils.approvals.projects.get.invalidate({ id: project.id });
    },
    onError: (err) => toast.error(err.message),
  });

  const manualUpsert = trpc.approvals.hbcf.certificates.manualUpsert.useMutation({
    onSuccess: () => {
      toast.success("HBCF certificate saved");
      setForm((current) => ({ ...current, certificateNumber: "", policyNumber: "", certificateUrl: "", notes: "" }));
      utils.approvals.hbcf.certificates.list.invalidate({ projectId: project.id });
      utils.approvals.hbcf.gateStatus.invalidate({ projectId: project.id });
      utils.approvals.projects.get.invalidate({ id: project.id });
    },
    onError: (err) => toast.error(err.message),
  });

  const required = gateStatus?.required || project.hbcfRequired;
  const issued = gateStatus?.issued || (certificates || []).some((cert: any) => isIssuedHbcfStatus(cert.status));
  const statusVariant = !required ? "outline" : issued ? "default" : "destructive";
  const primaryCertificate = (certificates || [])[0];

  useEffect(() => {
    if (!primaryCertificate) return;
    setForm((current) => ({
      ...current,
      certificateNumber: current.certificateNumber || primaryCertificate.certificateNumber || "",
      policyNumber: current.policyNumber || primaryCertificate.policyNumber || "",
      status: current.status || primaryCertificate.status || "issued",
      issuedAt: current.issuedAt || dateInputValue(primaryCertificate.issuedAt),
      expiresAt: current.expiresAt || dateInputValue(primaryCertificate.expiresAt),
      builderName: current.builderName || primaryCertificate.builderName || "",
      builderLicenceNumber: current.builderLicenceNumber || primaryCertificate.builderLicenceNumber || "",
      insurerName: current.insurerName || primaryCertificate.insurerName || "",
      contractPrice: current.contractPrice || primaryCertificate.contractPrice || project.estimatedCost || "",
      certificateUrl: current.certificateUrl || primaryCertificate.certificateUrl || "",
    }));
  }, [primaryCertificate?.id, project.estimatedCost]);

  const handleManualSave = () => {
    if (!form.certificateNumber && !form.policyNumber) {
      toast.error("Enter a certificate number or policy number");
      return;
    }
    manualUpsert.mutate({
      approvalProjectId: project.id,
      crmLeadId: project.crmLeadId || undefined,
      certificateNumber: form.certificateNumber || undefined,
      policyNumber: form.policyNumber || undefined,
      status: form.status,
      issuedAt: form.issuedAt || undefined,
      expiresAt: form.expiresAt || undefined,
      builderName: form.builderName || undefined,
      builderLicenceNumber: form.builderLicenceNumber || undefined,
      insurerName: form.insurerName || undefined,
      ownerName: project.clientName || undefined,
      propertyAddress: project.propertyAddress || undefined,
      propertySuburb: project.propertySuburb || undefined,
      propertyPostcode: project.propertyPostcode || undefined,
      contractPrice: form.contractPrice || undefined,
      certificateUrl: form.certificateUrl || undefined,
      notes: form.notes || undefined,
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            HBCF
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            HBCF is automatically required when the quote or project value is at least $20,000.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant as any}>
            {!required ? "Not required" : issued ? "Issued" : "Required"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => syncProject.mutate({ projectId: project.id })} disabled={syncProject.isPending}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${syncProject.isPending ? "animate-spin" : ""}`} />
            Sync
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {required && !issued && (
          <div className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{gateStatus?.blockers?.[0] || "Issued HBCF certificate is required before a Construction Commencement Certificate can be issued."}</span>
          </div>
        )}

        {(certificates || []).length > 0 && (
          <div className="rounded border divide-y">
            {(certificates || []).map((cert: any) => (
              <div key={cert.id} className="p-3 grid grid-cols-1 md:grid-cols-4 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Certificate</span>
                  <p className="font-medium">{cert.certificateNumber || cert.policyNumber || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Builder</span>
                  <p className="font-medium">{cert.builderName || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Issued</span>
                  <p className="font-medium">{cert.issuedAt ? new Date(cert.issuedAt).toLocaleDateString() : "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p><Badge variant={isIssuedHbcfStatus(cert.status) ? "default" : "outline"}>{cert.status}</Badge></p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label>Certificate number</Label>
            <Input value={form.certificateNumber} onChange={(e) => setForm({ ...form, certificateNumber: e.target.value })} />
          </div>
          <div>
            <Label>Policy number</Label>
            <Input value={form.policyNumber} onChange={(e) => setForm({ ...form, policyNumber: e.target.value })} />
          </div>
          <div>
            <Label>Issued date</Label>
            <Input type="date" value={form.issuedAt} onChange={(e) => setForm({ ...form, issuedAt: e.target.value })} />
          </div>
          <div>
            <Label>Expiry date</Label>
            <Input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
          </div>
          <div>
            <Label>Builder</Label>
            <Input value={form.builderName} onChange={(e) => setForm({ ...form, builderName: e.target.value })} />
          </div>
          <div>
            <Label>Licence number</Label>
            <Input value={form.builderLicenceNumber} onChange={(e) => setForm({ ...form, builderLicenceNumber: e.target.value })} />
          </div>
          <div>
            <Label>Insurer</Label>
            <Input value={form.insurerName} onChange={(e) => setForm({ ...form, insurerName: e.target.value })} />
          </div>
          <div>
            <Label>Contract price</Label>
            <Input type="number" value={form.contractPrice} onChange={(e) => setForm({ ...form, contractPrice: e.target.value })} />
          </div>
          <div className="md:col-span-3">
            <Label>Certificate URL</Label>
            <Input value={form.certificateUrl} onChange={(e) => setForm({ ...form, certificateUrl: e.target.value })} />
          </div>
          <div className="flex items-end">
            <Button onClick={handleManualSave} disabled={manualUpsert.isPending} className="w-full">
              {manualUpsert.isPending ? "Saving..." : "Save HBCF"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
