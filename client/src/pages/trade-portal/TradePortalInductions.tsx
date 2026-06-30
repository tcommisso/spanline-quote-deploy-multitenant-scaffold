import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ClipboardCheck, Loader2, CheckCircle2, Clock, MapPin,
  AlertTriangle, FileText,
} from "lucide-react";
import { toast } from "sonner";

export default function TradePortalInductions() {
  const utils = trpc.useUtils();
  const { data: inductions, isLoading } = trpc.siteInductions.tradePortalMyInductions.useQuery();
  const [activeInduction, setActiveInduction] = useState<any>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const pending = (inductions || []).filter((i: any) => i.status === "pending");
  const completed = (inductions || []).filter((i: any) => i.status === "completed");

  if (activeInduction) {
    return (
      <InductionForm
        induction={activeInduction}
        onClose={() => setActiveInduction(null)}
        onComplete={() => {
          setActiveInduction(null);
          utils.siteInductions.tradePortalMyInductions.invalidate();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">Site Inductions</h1>
        <p className="text-muted-foreground mt-1">
          Complete your workplace specific induction checklist for each job site
        </p>
      </div>

      {/* Pending Inductions */}
      {pending.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-primary" />
            Pending Inductions ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((ind: any) => (
              <Card key={ind.id} className="border-primary/30 dark:border-primary">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold break-words">{ind.job?.clientName || `Job #${ind.jobId}`}</p>
                      <div className="flex items-start gap-1.5 text-sm text-muted-foreground mt-0.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span className="break-words">{ind.job?.siteAddress || "—"}</span>
                      </div>
                      {ind.job?.quoteNumber && (
                        <p className="text-xs text-muted-foreground mt-0.5">Quote: {ind.job.quoteNumber}</p>
                      )}
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                      <Badge className="bg-primary/10 text-primary">
                        <Clock className="h-3 w-3 mr-1" /> Pending
                      </Badge>
                      <Button className="flex-1 sm:flex-none" onClick={() => setActiveInduction(ind)}>
                        <ClipboardCheck className="h-4 w-4 mr-1.5" /> Complete Now
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Completed Inductions */}
      {completed.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Completed ({completed.length})
          </h2>
          <div className="space-y-3">
            {completed.map((ind: any) => (
              <Card key={ind.id} className="border-green-300 dark:border-green-700">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold break-words">{ind.job?.clientName || `Job #${ind.jobId}`}</p>
                      <div className="flex items-start gap-1.5 text-sm text-muted-foreground mt-0.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span className="break-words">{ind.job?.siteAddress || "—"}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Completed: {ind.completedAt ? new Date(ind.completedAt).toLocaleString("en-AU") : "—"}
                      </p>
                    </div>
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Done
                      </Badge>
                      {ind.pdfUrl && (
                        <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={() => window.open(ind.pdfUrl, "_blank")}>
                          <FileText className="h-4 w-4 mr-1" /> PDF
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {(!inductions || inductions.length === 0) && (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium">No inductions assigned</p>
            <p className="text-sm mt-1">You'll see inductions here when you're assigned to a job site</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Induction Form (multi-step) ────────────────────────────────────────────
function InductionForm({ induction, onClose, onComplete }: {
  induction: any;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(0);
  const [medicalConditions, setMedicalConditions] = useState(induction.medicalConditions || "");
  const [certificates, setCertificates] = useState<any[]>(
    induction.certificates?.length > 0 ? induction.certificates : []
  );
  const [siteChecklist, setSiteChecklist] = useState<any[]>(
    induction.siteChecklist?.length > 0 ? induction.siteChecklist : []
  );

  const { data: defaults } = trpc.siteInductions.getDefaults.useQuery();
  const { data: rulesData } = trpc.siteInductions.getSiteRules.useQuery();

  useEffect(() => {
    if (induction.certificates?.length > 0) {
      setCertificates(induction.certificates);
      return;
    }
    if (defaults?.certificates?.length) {
      setCertificates(defaults.certificates);
    }
  }, [defaults?.certificates, induction.certificates, induction.id]);

  useEffect(() => {
    if (induction.siteChecklist?.length > 0) {
      setSiteChecklist(induction.siteChecklist);
      return;
    }
    if (defaults?.siteChecklist?.length) {
      setSiteChecklist(defaults.siteChecklist);
    }
  }, [defaults?.siteChecklist, induction.id, induction.siteChecklist]);

  const submitMutation = trpc.siteInductions.tradePortalSubmit.useMutation({
    onSuccess: () => {
      toast.success("Induction completed and submitted!");
      onComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateCertStatus = (idx: number, status: string) => {
    setCertificates(prev => prev.map((c, i) => i === idx ? { ...c, status } : c));
  };
  const updateCertExpiry = (idx: number, expiryDate: string) => {
    setCertificates(prev => prev.map((c, i) => i === idx ? { ...c, expiryDate } : c));
  };
  const updateChecklistStatus = (idx: number, status: string) => {
    setSiteChecklist(prev => prev.map((c, i) => i === idx ? { ...c, status } : c));
  };

  const steps = ["Details", "Certificates", "Site Checklist", "Site Rules", "Confirm & Send"];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold flex items-center gap-2 sm:text-2xl">
            <ClipboardCheck className="h-6 w-6 shrink-0" />
            Site Induction
          </h1>
          <p className="text-muted-foreground mt-0.5 break-words">
            {induction.job?.clientName || `Job #${induction.jobId}`} — {induction.job?.siteAddress || ""}
          </p>
        </div>
        <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>Cancel</Button>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            {steps.map((s, i) => (
              <div key={i} className={`h-2 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Step {step + 1} of {steps.length}: <span className="font-medium text-foreground">{steps[step]}</span>
          </p>
        </CardContent>
      </Card>

      {/* Step Content */}
      <Card>
        <CardContent className="p-4 space-y-4 sm:p-6">
          {/* Step 0: Contractor Details */}
          {step === 0 && (
            <div className="space-y-4">
              <CardTitle className="text-lg">Contractor Details</CardTitle>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Contractor / Company Name</Label>
                  <Input value={induction.contractorName} disabled className="bg-muted" />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={induction.contractorPhone || ""} disabled className="bg-muted" />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={induction.contractorEmail || ""} disabled className="bg-muted" />
                </div>
                <div>
                  <Label>Site Address</Label>
                  <Input value={induction.job?.siteAddress || ""} disabled className="bg-muted" />
                </div>
              </div>
              <div>
                <Label>Known Allergies / Medical Conditions</Label>
                <Input
                  value={medicalConditions}
                  onChange={e => setMedicalConditions(e.target.value)}
                  placeholder="None declared"
                />
                <p className="text-xs text-muted-foreground mt-1">Leave blank if none</p>
              </div>
            </div>
          )}

          {/* Step 1: Certificates */}
          {step === 1 && (
            <div className="space-y-4">
              <CardTitle className="text-lg">Certificates & Licences</CardTitle>
              <p className="text-sm text-muted-foreground">
                Mark each certificate as <strong>Y</strong> (Yes, I hold this), <strong>N</strong> (No), or <strong>NA</strong> (Not Applicable)
              </p>
              <div className="space-y-2">
                {certificates.map((cert, idx) => (
                  <div key={idx} className="flex flex-col gap-3 p-3 rounded-lg border sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{cert.name}</p>
                      <Input
                        placeholder="Expiry date (DD/MM/YYYY)"
                        value={cert.expiryDate || ""}
                        onChange={e => updateCertExpiry(idx, e.target.value)}
                        className="h-8 w-full text-xs mt-1 sm:max-w-[200px]"
                      />
                    </div>
                    <div className="grid w-full grid-cols-3 gap-1 sm:w-auto sm:flex">
                      {["Y", "N", "NA"].map(s => (
                        <Button
                          key={s}
                          variant={cert.status === s ? "default" : "outline"}
                          size="sm"
                          className={`w-full sm:w-10 ${cert.status === s && s === "Y" ? "bg-green-600 hover:bg-green-700" : ""} ${cert.status === s && s === "N" ? "bg-red-600 hover:bg-red-700" : ""}`}
                          onClick={() => updateCertStatus(idx, s)}
                        >
                          {s}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Site Checklist */}
          {step === 2 && (
            <div className="space-y-4">
              <CardTitle className="text-lg">Site Specific Checklist</CardTitle>
              <p className="text-sm text-muted-foreground">
                Issues specific to this site — mark each as <strong>Y</strong> (Yes/Confirmed), <strong>N</strong> (No/Not Applicable), or <strong>NA</strong>
              </p>
              <div className="space-y-2">
                {siteChecklist.map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-3 p-3 rounded-lg border sm:flex-row sm:items-center">
                    <p className="min-w-0 flex-1 text-sm break-words">{item.item}</p>
                    <div className="grid w-full grid-cols-3 gap-1 sm:w-auto sm:flex">
                      {["Y", "N", "NA"].map(s => (
                        <Button
                          key={s}
                          variant={item.status === s ? "default" : "outline"}
                          size="sm"
                          className={`w-full sm:w-10 ${item.status === s && s === "Y" ? "bg-green-600 hover:bg-green-700" : ""} ${item.status === s && s === "N" ? "bg-red-600 hover:bg-red-700" : ""}`}
                          onClick={() => updateChecklistStatus(idx, s)}
                        >
                          {s}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Site Rules (read-only) */}
          {step === 3 && (
            <div className="space-y-4">
              <CardTitle className="text-lg">Site Rules & Emergency Procedures</CardTitle>
              <p className="text-sm text-muted-foreground">Please read through the following carefully before proceeding</p>
              <div>
                <h4 className="font-semibold text-sm text-primary mb-2">Site Rules</h4>
                <div className="space-y-2 p-4 rounded-lg bg-muted/50 border text-sm">
                  {(rulesData?.siteRules || []).map((rule, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-semibold text-sm text-red-600 dark:text-red-400 mb-2">Emergency Procedure</h4>
                <div className="space-y-2 p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 text-sm">
                  {(rulesData?.emergencyProcedure || []).map((proc, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-red-400 shrink-0">•</span>
                      <span>{proc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Confirmation */}
          {step === 4 && (
            <div className="space-y-4">
              <CardTitle className="text-lg">Confirm & Submit</CardTitle>
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-sm font-medium">Declaration</p>
                <p className="text-sm text-muted-foreground mt-1">
                  I, <strong>{induction.contractorName}</strong>, acknowledge that I have been inducted on the site-specific requirements for <strong>{induction.job?.siteAddress || "this site"}</strong>. I have read and understood the site rules and emergency procedures. This submission will be date and time stamped as a record of my induction.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <div className="p-3 rounded-lg bg-muted/30 border">
                  <span className="text-muted-foreground block text-xs">Contractor</span>
                  <span className="font-medium">{induction.contractorName}</span>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border">
                  <span className="text-muted-foreground block text-xs">Medical Conditions</span>
                  <span>{medicalConditions || "None declared"}</span>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border">
                  <span className="text-muted-foreground block text-xs">Certificates</span>
                  <span>{certificates.filter(c => c.status).length}/{certificates.length} answered</span>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 border">
                  <span className="text-muted-foreground block text-xs">Checklist Items</span>
                  <span>{siteChecklist.filter(c => c.status).length}/{siteChecklist.length} answered</span>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex flex-col-reverse gap-2 pt-4 border-t sm:flex-row sm:justify-between">
            <Button variant="outline" className="w-full sm:w-auto" onClick={step === 0 ? onClose : () => setStep(s => s - 1)}>
              {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step < 4 ? (
              <Button className="w-full sm:w-auto" onClick={() => setStep(s => s + 1)}>
                Next
              </Button>
            ) : (
              <Button
                onClick={() => submitMutation.mutate({
                  id: induction.id,
                  medicalConditions,
                  certificates,
                  siteChecklist,
                })}
                disabled={submitMutation.isPending}
                className="w-full bg-green-600 hover:bg-green-700 sm:w-auto"
              >
                {submitMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                )}
                Complete & Send
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
