import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Edit, Save, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import ClientPicker from "@/components/ClientPicker";

interface ApprovalOverviewTabProps {
  project: any;
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
                  <Badge variant="outline" className="text-xs mt-1">Linked to CRM</Badge>
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
                <ClientPicker
                  selectedClientId={certifierContact.id}
                  onClientSelect={(c) => setCertifierContact({ id: c.id, name: c.name })}
                  onClientClear={() => setCertifierContact({ name: "" })}
                  clientName={certifierContact.name}
                />
                {!certifierContact.id && (
                  <div className="mt-2">
                    <Input
                      placeholder="Certifier name (if not in CRM)"
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
