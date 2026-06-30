import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ClipboardCheck, Plus, Trash2, ArrowUp, ArrowDown, Loader2, Save, RotateCcw,
  Award, ListChecks, ScrollText, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

export default function InductionFormAdmin() {
  const { data: config, isLoading } = trpc.siteInductions.getFormConfig.useQuery();
  const utils = trpc.useUtils();

  const [certificates, setCertificates] = useState<string[]>([]);
  const [checklistItems, setChecklistItems] = useState<string[]>([]);
  const [siteRules, setSiteRules] = useState("");
  const [emergencyProcedures, setEmergencyProcedures] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  // Load config into state
  useEffect(() => {
    if (config) {
      setCertificates(config.certificates);
      setChecklistItems(config.checklistItems);
      setSiteRules(config.siteRules);
      setEmergencyProcedures(config.emergencyProcedures);
      setHasChanges(false);
    }
  }, [config]);

  const updateMutation = trpc.siteInductions.updateFormConfig.useMutation({
    onSuccess: () => {
      toast.success("Induction form configuration saved");
      utils.siteInductions.getFormConfig.invalidate();
      utils.siteInductions.getDefaults.invalidate();
      utils.siteInductions.getSiteRules.invalidate();
      setHasChanges(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const markChanged = useCallback(() => setHasChanges(true), []);

  // ─── Certificate helpers ───────────────────────────────────────────
  const addCertificate = () => {
    setCertificates(prev => [...prev, ""]);
    markChanged();
  };
  const updateCertificate = (index: number, value: string) => {
    setCertificates(prev => prev.map((c, i) => i === index ? value : c));
    markChanged();
  };
  const removeCertificate = (index: number) => {
    setCertificates(prev => prev.filter((_, i) => i !== index));
    markChanged();
  };
  const moveCertificate = (index: number, direction: "up" | "down") => {
    setCertificates(prev => {
      const arr = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= arr.length) return arr;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
    markChanged();
  };

  // ─── Checklist helpers ─────────────────────────────────────────────
  const addChecklistItem = () => {
    setChecklistItems(prev => [...prev, ""]);
    markChanged();
  };
  const updateChecklistItem = (index: number, value: string) => {
    setChecklistItems(prev => prev.map((c, i) => i === index ? value : c));
    markChanged();
  };
  const removeChecklistItem = (index: number) => {
    setChecklistItems(prev => prev.filter((_, i) => i !== index));
    markChanged();
  };
  const moveChecklistItem = (index: number, direction: "up" | "down") => {
    setChecklistItems(prev => {
      const arr = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= arr.length) return arr;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return arr;
    });
    markChanged();
  };

  // ─── Save ──────────────────────────────────────────────────────────
  const handleSave = () => {
    const filteredCerts = certificates.filter(c => c.trim());
    const filteredChecklist = checklistItems.filter(c => c.trim());
    if (filteredCerts.length === 0) {
      toast.error("At least one certificate is required");
      return;
    }
    if (filteredChecklist.length === 0) {
      toast.error("At least one checklist item is required");
      return;
    }
    if (!siteRules.trim()) {
      toast.error("Site rules cannot be empty");
      return;
    }
    if (!emergencyProcedures.trim()) {
      toast.error("Emergency procedures cannot be empty");
      return;
    }
    updateMutation.mutate({
      certificates: filteredCerts,
      checklistItems: filteredChecklist,
      siteRules: siteRules.trim(),
      emergencyProcedures: emergencyProcedures.trim(),
    });
  };

  const handleReset = () => {
    if (config) {
      setCertificates(config.certificates);
      setChecklistItems(config.checklistItems);
      setSiteRules(config.siteRules);
      setEmergencyProcedures(config.emergencyProcedures);
      setHasChanges(false);
      toast.info("Changes reverted");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl px-4 py-4 space-y-6 sm:py-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-500/10 shrink-0">
            <ClipboardCheck className="h-6 w-6 text-amber-500" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">Induction Form Configuration</h1>
            <p className="text-sm text-muted-foreground">
              Manage the certificates, checklist items, site rules, and emergency procedures used in the Workplace Specific Induction Checklist.
            </p>
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:justify-end">
          {hasChanges && (
            <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Revert
            </Button>
          )}
          <Button
            size="sm"
            className="w-full sm:w-auto"
            onClick={handleSave}
            disabled={!hasChanges || updateMutation.isPending}
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Unsaved changes banner */}
      {hasChanges && (
        <div className="flex items-start gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          You have unsaved changes.
        </div>
      )}

      {/* Certificates Section */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-2">
            <Award className="h-5 w-5 text-blue-500 shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-lg">Certificates &amp; Licences</CardTitle>
              <CardDescription>
                Certificates that trades must confirm (Yes / No / N/A) during induction. Order determines display order on the form.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {certificates.map((cert, index) => (
            <div key={index} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 sm:flex sm:items-center">
              <span className="text-xs text-muted-foreground w-6 text-right shrink-0 pt-2 sm:pt-0">{index + 1}.</span>
              <Input
                value={cert}
                onChange={(e) => updateCertificate(index, e.target.value)}
                placeholder="Certificate name..."
                className="min-w-0 sm:flex-1"
              />
              <div className="col-start-2 flex gap-1 sm:col-auto">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => moveCertificate(index, "up")}
                  disabled={index === 0}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => moveCertificate(index, "down")}
                  disabled={index === certificates.length - 1}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => removeCertificate(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addCertificate} className="mt-2 w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-1" />
            Add Certificate
          </Button>
        </CardContent>
      </Card>

      {/* Checklist Items Section */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-2">
            <ListChecks className="h-5 w-5 text-green-500 shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-lg">Site Checklist Items</CardTitle>
              <CardDescription>
                Items that trades must confirm (Yes / No / N/A) during site induction. These cover site-specific safety and orientation items.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {checklistItems.map((item, index) => (
            <div key={index} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 sm:flex sm:items-center">
              <span className="text-xs text-muted-foreground w-6 text-right shrink-0 pt-2 sm:pt-0">{index + 1}.</span>
              <Input
                value={item}
                onChange={(e) => updateChecklistItem(index, e.target.value)}
                placeholder="Checklist item..."
                className="min-w-0 sm:flex-1"
              />
              <div className="col-start-2 flex gap-1 sm:col-auto">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => moveChecklistItem(index, "up")}
                  disabled={index === 0}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => moveChecklistItem(index, "down")}
                  disabled={index === checklistItems.length - 1}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => removeChecklistItem(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addChecklistItem} className="mt-2 w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-1" />
            Add Checklist Item
          </Button>
        </CardContent>
      </Card>

      {/* Site Rules Section */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-2">
            <ScrollText className="h-5 w-5 text-orange-500 shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-lg">Site Rules</CardTitle>
              <CardDescription>
                Rules displayed to trades during induction that they must read and acknowledge. Enter one rule per line.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={siteRules}
            onChange={(e) => { setSiteRules(e.target.value); markChanged(); }}
            placeholder="Enter site rules, one per line..."
            rows={12}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-2">
            {siteRules.split("\n").filter(l => l.trim()).length} rule(s)
          </p>
        </CardContent>
      </Card>

      {/* Emergency Procedures Section */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-lg">Emergency Procedures</CardTitle>
              <CardDescription>
                Emergency procedures displayed to trades during induction. Enter one procedure per line.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={emergencyProcedures}
            onChange={(e) => { setEmergencyProcedures(e.target.value); markChanged(); }}
            placeholder="Enter emergency procedures, one per line..."
            rows={10}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-2">
            {emergencyProcedures.split("\n").filter(l => l.trim()).length} procedure(s)
          </p>
        </CardContent>
      </Card>

      {/* Bottom save bar (sticky) */}
      {hasChanges && (
        <div className="sticky bottom-4 flex flex-col gap-2 p-4 rounded-lg bg-card border shadow-lg sm:flex-row sm:justify-end">
          <Button variant="outline" className="w-full sm:w-auto" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-1" />
            Revert Changes
          </Button>
          <Button className="w-full sm:w-auto" onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}
