import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Save, Bell, Shield, FileText, Upload, Trash2, Download, UploadCloud, PenLine, ExternalLink, CheckCircle2, Loader2, Menu, Clock, Trophy, ImageIcon, Building, ListChecks, Plus, DollarSign } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/useMobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { toast } from "sonner";
import { isAdminRole } from "@shared/const";
import {
  loadProposalText,
  saveProposalText,
  loadTermsDocument,
  saveTermsDocument,
  clearTermsDocument,
  fileToTermsDocument,
  createSettingsBundle,
  restoreSettingsBundle,
  type ProposalText,
  type TermsDocument,
} from "@/lib/proposalStore";
import { useSettingsSync } from "@/hooks/useSettingsSync";

const SECTIONS = [
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "proposal-text", label: "Proposal Text", icon: FileText },
  { id: "terms", label: "Terms & Conditions", icon: FileText },
  { id: "signwell", label: "Digital Signatures", icon: PenLine },
  { id: "follow-up", label: "Follow-Up Reminders", icon: Clock },
  { id: "win-loss-reasons", label: "Win/Loss Reasons", icon: Trophy },
  { id: "export-import", label: "Export / Import", icon: UploadCloud },
  { id: "building-authority", label: "Approvals", icon: Building },
  { id: "login-image", label: "Login Background", icon: ImageIcon },
];

export default function AdminSettings() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: masterData } = trpc.masterData.getAll.useQuery();
  const upsertMutation = trpc.masterData.upsert.useMutation({
    onSuccess: () => {
      toast.success("Settings saved");
      utils.masterData.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Notification Settings ─────────────────────────────────────────────────
  const getVal = (key: string) => masterData?.find(d => d.category === "notification" && d.key === key)?.value || "";
  const getId = (key: string) => masterData?.find(d => d.category === "notification" && d.key === key)?.id;

  const [notifyNewQuote, setNotifyNewQuote] = useState(true);
  const [notifyStatusChange, setNotifyStatusChange] = useState(true);
  const [valueThreshold, setValueThreshold] = useState("10000");
  const [supplierAlertThreshold, setSupplierAlertThreshold] = useState("3.0");

  useEffect(() => {
    if (masterData) {
      setNotifyNewQuote(getVal("notify_new_quote") !== "false");
      setNotifyStatusChange(getVal("notify_status_change") !== "false");
      setValueThreshold(getVal("value_threshold") || "10000");
      setSupplierAlertThreshold(getVal("supplier_alert_threshold") || "3.0");
    }
  }, [masterData]);

  const handleSaveNotifications = () => {
    const settings = [
      { key: "notify_new_quote", value: String(notifyNewQuote), id: getId("notify_new_quote") },
      { key: "notify_status_change", value: String(notifyStatusChange), id: getId("notify_status_change") },
      { key: "value_threshold", value: valueThreshold, id: getId("value_threshold") },
      { key: "supplier_alert_threshold", value: supplierAlertThreshold, id: getId("supplier_alert_threshold") },
    ];
    settings.forEach(s => {
      upsertMutation.mutate({
        id: s.id,
        category: "notification",
        key: s.key,
        value: s.value,
        sortOrder: 0,
      });
    });
  };

  // ─── Proposal Customisation State ─────────────────────────────────────────
  const [proposalText, setProposalText] = useState<ProposalText>(loadProposalText());
  const [terms, setTerms] = useState<TermsDocument | null>(loadTermsDocument());
  const termsInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const { syncProposalText } = useSettingsSync();

  const handleSaveProposalText = () => {
    syncProposalText(proposalText);
    toast.success("Proposal text saved");
  };

  const handleTermsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const termsData = await fileToTermsDocument(file);
      saveTermsDocument(termsData);
      setTerms(termsData);
      toast.success("Terms document uploaded");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload terms");
    }
    if (termsInputRef.current) termsInputRef.current.value = "";
  };

  const handleRemoveTerms = () => {
    clearTermsDocument();
    setTerms(null);
    toast.success("Terms document removed");
  };

  const handleExportSettings = () => {
    const bundle = createSettingsBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `altaspan-proposal-settings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Settings exported");
  };

  const handleImportSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const bundle = JSON.parse(reader.result as string);
        restoreSettingsBundle(bundle);
        setProposalText(loadProposalText());
        setTerms(loadTermsDocument());
        toast.success("Settings imported successfully");
      } catch {
        toast.error("Invalid settings file");
      }
    };
    reader.readAsText(file);
    if (importInputRef.current) importInputRef.current.value = "";
  };

  // ─── SignWell Template Settings ──────────────────────────────────────────────
  const getSignwellVal = (key: string) => masterData?.find(d => d.category === "signwell" && d.key === key)?.value || "";
  const getSignwellId = (key: string) => masterData?.find(d => d.category === "signwell" && d.key === key)?.id;
  const [templateId, setTemplateId] = useState("");
  const [templateStatus, setTemplateStatus] = useState<"idle" | "validating" | "valid" | "invalid">("idle");

  useEffect(() => {
    if (masterData) {
      const tid = getSignwellVal("template_id");
      setTemplateId(tid);
      if (tid) setTemplateStatus("valid");
    }
  }, [masterData]);

  const handleSaveTemplateId = () => {
    upsertMutation.mutate({
      id: getSignwellId("template_id"),
      category: "signwell",
      key: "template_id",
      value: templateId.trim(),
      sortOrder: 0,
    });
    if (templateId.trim()) {
      setTemplateStatus("valid");
    } else {
      setTemplateStatus("idle");
    }
  };

  const handleClearTemplate = () => {
    setTemplateId("");
    setTemplateStatus("idle");
    upsertMutation.mutate({
      id: getSignwellId("template_id"),
      category: "signwell",
      key: "template_id",
      value: "",
      sortOrder: 0,
    });
  };

  // ─── Sidebar + Accordion state ─────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState("notifications");
  const [openSections, setOpenSections] = useState<string[]>(["notifications"]);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToSection = (sectionId: string) => {
    if (!openSections.includes(sectionId)) {
      setOpenSections(prev => [...prev, sectionId]);
    }
    setActiveSection(sectionId);
    setTimeout(() => {
      const el = sectionRefs.current[sectionId];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
  };

  if (!isAdminRole(user?.role || "")) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Shield className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-sm text-muted-foreground">Admin access required</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Proposal & Notification Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure notifications and proposal branding. Company details and branches are in Company Settings.</p>
      </div>

      {/* Mobile Section Nav */}
      <MobileSectionNav
        sections={SECTIONS}
        activeSection={activeSection}
        onSelect={scrollToSection}
      />

      {/* Hybrid Layout: Sticky Sidebar + Accordion Content */}
      <div className="flex gap-6">
        {/* Sticky Sidebar Nav (desktop only) */}
        <nav className="hidden lg:block w-52 shrink-0">
          <div className="sticky top-4 space-y-1">
            {SECTIONS.map((section) => {
              const isActive = activeSection === section.id;
              const Icon = section.icon;
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
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{section.label}</span>
                </button>
              );
            })}
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
            {/* Notification Settings */}
            <AccordionItem value="notifications" className="border rounded-lg px-4">
              <div ref={(el) => { sectionRefs.current.notifications = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-primary" />
                    Notification Settings
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pb-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">New Quote Created</p>
                        <p className="text-xs text-muted-foreground">Notify when any user creates a new quote</p>
                      </div>
                      <Switch checked={notifyNewQuote} onCheckedChange={setNotifyNewQuote} />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Quote Status Change</p>
                        <p className="text-xs text-muted-foreground">Notify when a quote is marked as Accepted or Lost</p>
                      </div>
                      <Switch checked={notifyStatusChange} onCheckedChange={setNotifyStatusChange} />
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Value Threshold ($)</Label>
                      <p className="text-xs text-muted-foreground">Notify when a quote total exceeds this amount</p>
                      <Input
                        type="number"
                        value={valueThreshold}
                        onChange={(e) => setValueThreshold(e.target.value)}
                        className="h-9 text-sm w-48"
                        placeholder="10000"
                      />
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Supplier Alert Threshold (Stars)</Label>
                      <p className="text-xs text-muted-foreground">Highlight suppliers on the dashboard whose average rating falls below this value. Notify admin when a new review causes a supplier to drop below this threshold.</p>
                      <Input
                        type="number"
                        step="0.5"
                        min="1"
                        max="5"
                        value={supplierAlertThreshold}
                        onChange={(e) => setSupplierAlertThreshold(e.target.value)}
                        className="h-9 text-sm w-48"
                        placeholder="3.0"
                      />
                    </div>
                    <div className="flex justify-end pt-2">
                      <Button onClick={handleSaveNotifications} disabled={upsertMutation.isPending} size="sm" className="gap-2">
                        <Save className="h-3.5 w-3.5" />
                        {upsertMutation.isPending ? "Saving..." : "Save Notifications"}
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </div>
            </AccordionItem>

            {/* Proposal Text */}
            <AccordionItem value="proposal-text" className="border rounded-lg px-4">
              <div ref={(el) => { sectionRefs.current["proposal-text"] = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-amber-600" />
                    Proposal Text
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pb-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Introduction Title</Label>
                      <Input value={proposalText.introTitle} onChange={(e) => setProposalText({ ...proposalText, introTitle: e.target.value })} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Introduction Body</Label>
                      <Textarea value={proposalText.introBody} onChange={(e) => setProposalText({ ...proposalText, introBody: e.target.value })} rows={3} className="text-sm" />
                    </div>
                    <Separator />
                    <div className="space-y-1.5">
                      <Label className="text-xs">Scope of Works Title</Label>
                      <Input value={proposalText.scopeTitle} onChange={(e) => setProposalText({ ...proposalText, scopeTitle: e.target.value })} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Scope of Works Body</Label>
                      <Textarea value={proposalText.scopeBody} onChange={(e) => setProposalText({ ...proposalText, scopeBody: e.target.value })} rows={3} className="text-sm" />
                    </div>
                    <Separator />
                    <div className="space-y-1.5">
                      <Label className="text-xs">Warranty Title</Label>
                      <Input value={proposalText.warrantyTitle} onChange={(e) => setProposalText({ ...proposalText, warrantyTitle: e.target.value })} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Warranty Body</Label>
                      <Textarea value={proposalText.warrantyBody} onChange={(e) => setProposalText({ ...proposalText, warrantyBody: e.target.value })} rows={3} className="text-sm" />
                    </div>
                    <Separator />
                    <div className="space-y-1.5">
                      <Label className="text-xs">Footer Note</Label>
                      <Textarea value={proposalText.footerNote} onChange={(e) => setProposalText({ ...proposalText, footerNote: e.target.value })} rows={2} className="text-sm" />
                    </div>
                    <div className="flex justify-end pt-2">
                      <Button onClick={handleSaveProposalText} size="sm" className="gap-2">
                        <Save className="h-3.5 w-3.5" /> Save Proposal Text
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </div>
            </AccordionItem>

            {/* Terms & Conditions */}
            <AccordionItem value="terms" className="border rounded-lg px-4">
              <div ref={(el) => { sectionRefs.current.terms = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-600" />
                    Terms & Conditions Document
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pb-4">
                    {terms ? (
                      <div className="flex items-center gap-4">
                        <div className="border rounded-lg p-3 bg-muted/30 flex items-center gap-2">
                          <FileText className="h-6 w-6 text-emerald-600" />
                          <div>
                            <p className="text-sm font-medium">{terms.fileName}</p>
                            <p className="text-xs text-muted-foreground">~{terms.pageCount} page{terms.pageCount > 1 ? "s" : ""}</p>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleRemoveTerms} className="gap-1.5 text-xs text-destructive">
                          <Trash2 className="h-3 w-3" /> Remove
                        </Button>
                      </div>
                    ) : (
                      <div
                        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => termsInputRef.current?.click()}
                      >
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">Click to upload Terms & Conditions PDF</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">PDF format only, max 5MB</p>
                      </div>
                    )}
                    <input ref={termsInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleTermsUpload} />
                  </div>
                </AccordionContent>
              </div>
            </AccordionItem>

            {/* Digital Signatures (SignWell) */}
            <AccordionItem value="signwell" className="border rounded-lg px-4">
              <div ref={(el) => { sectionRefs.current.signwell = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  <div className="flex items-center gap-2">
                    <PenLine className="h-4 w-4 text-indigo-600" />
                    Digital Signatures (SignWell)
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pb-4">
                    <p className="text-xs text-muted-foreground">
                      Configure a SignWell template with pre-placed signature and date fields for a polished signing experience.
                      When a template is configured, proposals will use it instead of placing fields dynamically.
                    </p>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">SignWell Template ID</Label>
                      <p className="text-xs text-muted-foreground">
                        Create a template in your{" "}
                        <a href="https://www.signwell.com/templates" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-0.5">
                          SignWell dashboard <ExternalLink className="h-3 w-3" />
                        </a>{" "}
                        with a "Client" placeholder and signature/date fields, then paste the template ID here.
                      </p>
                      <div className="flex gap-2 items-center">
                        <Input
                          value={templateId}
                          onChange={(e) => { setTemplateId(e.target.value); setTemplateStatus("idle"); }}
                          placeholder="e.g. abc123-def456-..."
                          className="h-9 text-sm font-mono flex-1 max-w-md"
                        />
                        {templateStatus === "valid" && (
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                        )}
                      </div>
                    </div>

                    <div className="bg-muted/50 rounded-md p-3 space-y-2">
                      <p className="text-xs font-medium">How to set up your template:</p>
                      <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                        <li>Go to SignWell → Templates → Create Template</li>
                        <li>Upload a blank signature page PDF (or use any PDF as a base)</li>
                        <li>Add a placeholder called <code className="bg-muted px-1 rounded">Client</code></li>
                        <li>Place Signature and Date fields where you want them on the page</li>
                        <li>Save the template and copy its ID from the URL or template details</li>
                        <li>Paste the ID above and save</li>
                      </ol>
                    </div>

                    {templateId && (
                      <p className="text-xs text-muted-foreground">
                        <strong>Current behaviour:</strong> When sending for signature, the proposal PDF will be appended to this template.
                        The client will see your template's signature page with pre-placed fields.
                      </p>
                    )}
                    {!templateId && (
                      <p className="text-xs text-muted-foreground">
                        <strong>Current behaviour:</strong> Signature and date fields are placed dynamically on the last page of the proposal PDF.
                      </p>
                    )}

                    <div className="flex gap-2 justify-end pt-2">
                      {templateId && (
                        <Button variant="outline" size="sm" onClick={handleClearTemplate} className="gap-1.5 text-xs">
                          <Trash2 className="h-3 w-3" /> Clear Template
                        </Button>
                      )}
                      <Button onClick={handleSaveTemplateId} disabled={upsertMutation.isPending} size="sm" className="gap-2">
                        <Save className="h-3.5 w-3.5" />
                        {upsertMutation.isPending ? "Saving..." : "Save Template ID"}
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </div>
            </AccordionItem>

            {/* Follow-Up Reminders */}
            <AccordionItem value="follow-up" className="border rounded-lg px-4">
              <div ref={(el) => { sectionRefs.current["follow-up"] = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-orange-600" />
                    Follow-Up Reminders
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <FollowUpThresholdsEditor />
                </AccordionContent>
              </div>
            </AccordionItem>

            {/* Win/Loss Reasons */}
            <AccordionItem value="win-loss-reasons" className="border rounded-lg px-4">
              <div ref={(el) => { sectionRefs.current["win-loss-reasons"] = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-600" />
                    Win/Loss Reasons
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <WinLossReasonsEditor />
                </AccordionContent>
              </div>
            </AccordionItem>

            {/* Export / Import */}
            <AccordionItem value="export-import" className="border rounded-lg px-4">
              <div ref={(el) => { sectionRefs.current["export-import"] = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  <div className="flex items-center gap-2">
                    <UploadCloud className="h-4 w-4 text-slate-600" />
                    Export / Import Settings
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pb-4">
                    <p className="text-xs text-muted-foreground mb-3">Share proposal settings between team members</p>
                    <div className="flex gap-3">
                      <Button variant="outline" size="sm" onClick={handleExportSettings} className="gap-1.5 text-xs">
                        <Download className="h-3.5 w-3.5" /> Export All Settings
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => importInputRef.current?.click()} className="gap-1.5 text-xs">
                        <Upload className="h-3.5 w-3.5" /> Import Settings
                      </Button>
                    </div>
                    <input ref={importInputRef} type="file" accept="application/json" className="hidden" onChange={handleImportSettings} />
                  </div>
                </AccordionContent>
              </div>
            </AccordionItem>

            {/* Approvals Settings */}
            <AccordionItem value="building-authority" className="border rounded-lg px-4">
              <div ref={(el) => { sectionRefs.current["building-authority"] = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-blue-600" />
                    Approvals Settings
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <BaOverdueThresholdEditor />
                </AccordionContent>
              </div>
            </AccordionItem>

            {/* Login Background Image */}
            <AccordionItem value="login-image">
              <div ref={(el) => { sectionRefs.current["login-image"] = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-slate-600" />
                    Login Background Image
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <LoginBackgroundEditor />
                </AccordionContent>
              </div>
            </AccordionItem>


          </Accordion>
        </div>
      </div>
    </div>
  );
}


// ─── Follow-Up Thresholds Editor ─────────────────────────────────────────────
const STATUS_LABELS_FOLLOWUP: Record<string, string> = {
  new: "New",
  assigned: "Assigned",
  appointment_set: "Appointment Set",
  quoted: "Quoted",
  contract: "Contract",
  building_authority: "Approvals",
  construction: "Construction",
};

const DEFAULT_THRESHOLDS: Record<string, number> = {
  new: 3,
  assigned: 5,
  appointment_set: 7,
  quoted: 14,
  contract: 21,
  building_authority: 14,
  construction: 14,
};

function FollowUpThresholdsEditor() {
  const settingQuery = trpc.globalSettings.get.useQuery({ key: "followUpThresholds" });
  const setMut = trpc.globalSettings.set.useMutation({
    onSuccess: () => {
      toast.success("Follow-up thresholds saved");
      settingQuery.refetch();
    },
    onError: () => toast.error("Failed to save thresholds"),
  });

  const [thresholds, setThresholds] = useState<Record<string, number>>(DEFAULT_THRESHOLDS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settingQuery.data && typeof settingQuery.data === "object") {
      setThresholds({ ...DEFAULT_THRESHOLDS, ...(settingQuery.data as Record<string, number>) });
    }
  }, [settingQuery.data]);

  const handleChange = (status: string, value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 1 && num <= 90) {
      setThresholds(prev => ({ ...prev, [status]: num }));
      setDirty(true);
    }
  };

  const handleSave = () => {
    setMut.mutate({ key: "followUpThresholds", value: thresholds });
    setDirty(false);
  };

  const handleReset = () => {
    setThresholds(DEFAULT_THRESHOLDS);
    setDirty(true);
  };

  return (
    <div className="pb-4 space-y-4">
      <p className="text-xs text-muted-foreground">
        Set the number of days after which a lead is flagged as needing follow-up (shown as an orange clock badge on the leads list). A lead is considered stale if it has no activity within this many days for its current status.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.entries(STATUS_LABELS_FOLLOWUP).map(([status, label]) => (
          <div key={status} className="flex items-center justify-between gap-2 px-3 py-2 border rounded-md">
            <Label className="text-sm font-medium">{label}</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                max={90}
                value={thresholds[status] ?? DEFAULT_THRESHOLDS[status]}
                onChange={(e) => handleChange(status, e.target.value)}
                className="w-16 h-8 text-center text-sm"
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={!dirty || setMut.isPending} className="gap-1.5">
          {setMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Thresholds
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset} disabled={setMut.isPending}>
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}

// ─── Win/Loss Reasons Editor ─────────────────────────────────────────────────
const DEFAULT_WON_REASONS = ["Best price", "Product quality", "Design/style", "Relationship/trust", "Timing", "Other"];
const DEFAULT_LOST_REASONS = ["Too expensive", "Went with competitor", "Project cancelled", "Design not suitable", "Timing/delays", "Changed mind", "Other"];

function WinLossReasonsEditor() {
  const settingQuery = trpc.globalSettings.get.useQuery({ key: "winLossReasons" });
  const setMut = trpc.globalSettings.set.useMutation({
    onSuccess: () => {
      toast.success("Win/Loss reasons saved");
      settingQuery.refetch();
    },
    onError: () => toast.error("Failed to save reasons"),
  });

  const [wonReasons, setWonReasons] = useState<string[]>(DEFAULT_WON_REASONS);
  const [lostReasons, setLostReasons] = useState<string[]>(DEFAULT_LOST_REASONS);
  const [newWon, setNewWon] = useState("");
  const [newLost, setNewLost] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settingQuery.data && typeof settingQuery.data === "object") {
      const d = settingQuery.data as { won?: string[]; lost?: string[] };
      if (d.won) setWonReasons(d.won);
      if (d.lost) setLostReasons(d.lost);
    }
  }, [settingQuery.data]);

  const handleSave = () => {
    setMut.mutate({ key: "winLossReasons", value: { won: wonReasons, lost: lostReasons } });
    setDirty(false);
  };

  const handleReset = () => {
    setWonReasons(DEFAULT_WON_REASONS);
    setLostReasons(DEFAULT_LOST_REASONS);
    setDirty(true);
  };

  const addWon = () => {
    const trimmed = newWon.trim();
    if (trimmed && !wonReasons.includes(trimmed)) {
      setWonReasons([...wonReasons, trimmed]);
      setNewWon("");
      setDirty(true);
    }
  };

  const addLost = () => {
    const trimmed = newLost.trim();
    if (trimmed && !lostReasons.includes(trimmed)) {
      setLostReasons([...lostReasons, trimmed]);
      setNewLost("");
      setDirty(true);
    }
  };

  const removeWon = (r: string) => { setWonReasons(wonReasons.filter(x => x !== r)); setDirty(true); };
  const removeLost = (r: string) => { setLostReasons(lostReasons.filter(x => x !== r)); setDirty(true); };

  return (
    <div className="pb-4 space-y-4">
      <p className="text-xs text-muted-foreground">
        Configure the reason options shown when a quote is marked as won (accepted) or lost. These reasons are tracked and displayed on the CRM dashboard breakdown chart.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Won Reasons */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-green-700">Won Reasons</h4>
          <div className="space-y-1">
            {wonReasons.map((r) => (
              <div key={r} className="flex items-center justify-between px-3 py-1.5 border rounded text-sm">
                <span>{r}</span>
                <button onClick={() => removeWon(r)} className="text-muted-foreground hover:text-red-600 text-xs"><Trash2 className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            <Input
              value={newWon}
              onChange={(e) => setNewWon(e.target.value)}
              placeholder="Add reason..."
              className="h-8 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWon(); } }}
            />
            <Button size="sm" variant="outline" onClick={addWon} className="h-8 px-2">+</Button>
          </div>
        </div>

        {/* Lost Reasons */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-red-700">Lost Reasons</h4>
          <div className="space-y-1">
            {lostReasons.map((r) => (
              <div key={r} className="flex items-center justify-between px-3 py-1.5 border rounded text-sm">
                <span>{r}</span>
                <button onClick={() => removeLost(r)} className="text-muted-foreground hover:text-red-600 text-xs"><Trash2 className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            <Input
              value={newLost}
              onChange={(e) => setNewLost(e.target.value)}
              placeholder="Add reason..."
              className="h-8 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLost(); } }}
            />
            <Button size="sm" variant="outline" onClick={addLost} className="h-8 px-2">+</Button>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={!dirty || setMut.isPending} className="gap-1.5">
          {setMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Reasons
        </Button>
        <Button size="sm" variant="outline" onClick={handleReset} disabled={setMut.isPending}>
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}

// ─── Mobile Section Nav (Sheet overlay for section navigation on mobile) ─────
function MobileSectionNav({
  sections,
  activeSection,
  onSelect,
}: {
  sections: typeof SECTIONS;
  activeSection: string;
  onSelect: (id: string) => void;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (!isMobile) return null;

  const currentSection = sections.find(s => s.id === activeSection);
  const CurrentIcon = currentSection?.icon || Bell;

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-md border bg-muted/50 text-sm font-medium w-full text-left"
      >
        <Menu className="h-4 w-4 text-muted-foreground" />
        <CurrentIcon className="h-4 w-4 text-primary" />
        <span className="truncate">{currentSection?.label || "Sections"}</span>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-4 pt-6 [&>button]:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Settings Navigation</SheetTitle>
            <SheetDescription>Navigate between settings sections</SheetDescription>
          </SheetHeader>
          <div className="space-y-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-3">
              Sections
            </h2>
            {sections.map((section) => {
              const isActive = activeSection === section.id;
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => {
                    onSelect(section.id);
                    setOpen(false);
                    if (navigator.vibrate) navigator.vibrate(10);
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{section.label}</span>
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}


// ─── Login Background Image Editor ──────────────────────────────────────────
const RECOMMENDED_WIDTH = 1920;
const RECOMMENDED_HEIGHT = 1080;
const MAX_FILE_SIZE_KB = 400; // target compressed size for web optimization
const MAX_UPLOAD_MB = 10; // reject files over 10MB before processing

function LoginBackgroundEditor() {
  const bgQuery = trpc.globalSettings.getLoginBackground.useQuery();
  const uploadMut = trpc.globalSettings.uploadLoginBackground.useMutation({
    onSuccess: () => {
      toast.success("Login background updated");
      bgQuery.refetch();
    },
    onError: (err) => toast.error(err.message || "Upload failed"),
  });
  const removeMut = trpc.globalSettings.removeLoginBackground.useMutation({
    onSuccess: () => {
      toast.success("Login background removed — default will be used");
      bgQuery.refetch();
    },
    onError: (err) => toast.error(err.message || "Remove failed"),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const currentImage = bgQuery.data?.url || null;

  /** Resize and compress image on the client before upload */
  async function processAndUpload(file: File) {
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast.error(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max ${MAX_UPLOAD_MB}MB.`);
      return;
    }
    setProcessing(true);
    try {
      const bitmap = await createImageBitmap(file);
      // Determine target dimensions (fit within recommended, maintain aspect ratio)
      let w = bitmap.width;
      let h = bitmap.height;
      if (w > RECOMMENDED_WIDTH || h > RECOMMENDED_HEIGHT) {
        const scale = Math.min(RECOMMENDED_WIDTH / w, RECOMMENDED_HEIGHT / h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0, w, h);

      // Compress as JPEG with progressive quality reduction until under target size
      let quality = 0.85;
      let blob: Blob | null = null;
      while (quality >= 0.3) {
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality)
        );
        if (blob && blob.size <= MAX_FILE_SIZE_KB * 1024) break;
        quality -= 0.1;
      }

      if (!blob) {
        toast.error("Failed to compress image");
        return;
      }

      // Show preview
      const previewUrl = URL.createObjectURL(blob);
      setPreview(previewUrl);

      // Convert to base64 for upload
      const arrayBuffer = await blob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      await uploadMut.mutateAsync({
        fileBase64: base64,
        fileName: file.name.replace(/\.[^.]+$/, "") + ".jpg",
        mimeType: "image/jpeg",
      });

      toast.info(`Optimized: ${w}×${h}px, ${(blob.size / 1024).toFixed(0)}KB`);
    } catch (err: any) {
      toast.error("Image processing failed: " + (err.message || "Unknown error"));
    } finally {
      setProcessing(false);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processAndUpload(file);
    e.target.value = "";
  }

  return (
    <div className="pb-4 space-y-4">
      <p className="text-xs text-muted-foreground">
        Upload a background image for the login page. Recommended size: <strong>{RECOMMENDED_WIDTH}×{RECOMMENDED_HEIGHT}px</strong> (16:9 landscape).
        Images are automatically resized and compressed to ~{MAX_FILE_SIZE_KB}KB JPEG for fast loading.
      </p>

      {/* Current / Preview */}
      <div className="border rounded-lg overflow-hidden bg-muted/30">
        {(preview || currentImage) ? (
          <img
            src={preview || currentImage!}
            alt="Login background preview"
            className="w-full h-48 object-cover"
          />
        ) : (
          <div className="w-full h-48 flex items-center justify-center text-muted-foreground text-sm">
            No custom background set — using default
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 items-center">
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={processing || uploadMut.isPending}
          className="gap-1.5 text-xs"
        >
          {processing || uploadMut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          {currentImage ? "Replace Image" : "Upload Image"}
        </Button>

        {currentImage && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => removeMut.mutate()}
            disabled={removeMut.isPending}
            className="gap-1.5 text-xs text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      <p className="text-[11px] text-muted-foreground/70">
        Accepted formats: JPEG, PNG, WebP (max {MAX_UPLOAD_MB}MB). Output is always optimized JPEG.
      </p>
    </div>
  );
}


// ─── Approvals Overdue Threshold Editor ─────────────────────────────────────
function BaOverdueThresholdEditor() {
  const thresholdQuery = trpc.globalSettings.getBaOverdueThreshold.useQuery();
  const setMut = trpc.globalSettings.setBaOverdueThreshold.useMutation({
    onSuccess: () => {
      toast.success("Approvals overdue threshold saved");
      thresholdQuery.refetch();
    },
    onError: () => toast.error("Failed to save threshold"),
  });

  const [days, setDays] = useState(30);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (thresholdQuery.data != null) {
      setDays(thresholdQuery.data);
    }
  }, [thresholdQuery.data]);

  const handleSave = () => {
    setMut.mutate({ days });
    setDirty(false);
  };

  return (
    <div className="space-y-4 pb-4">
      <p className="text-xs text-muted-foreground">
        Set the number of days after which a Pending or Lodged approval application is flagged as overdue.
        This threshold applies to the Construction Clients list, Dashboard card, and notifications.
      </p>
      <div className="space-y-2">
        <Label className="text-sm font-medium">Overdue Threshold (days)</Label>
        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => { setDays(Number(e.target.value)); setDirty(true); }}
            className="h-9 text-sm w-32"
          />
          <span className="text-xs text-muted-foreground">days</span>
        </div>
        <p className="text-[11px] text-muted-foreground/70">
          Default: 30 days. Applications pending longer than this will show a warning icon and appear in the "Overdue" filter.
        </p>
      </div>
      <div className="flex justify-end pt-2">
        <Button onClick={handleSave} disabled={setMut.isPending || !dirty} size="sm" className="gap-2">
          <Save className="h-3.5 w-3.5" />
          {setMut.isPending ? "Saving..." : "Save Threshold"}
        </Button>
      </div>
    </div>
  );
}


// ─── Checklist Item Pricing Editor ──────────────────────────────────────────
const UNIT_OPTIONS = [
  { value: "each", label: "Each" },
  { value: "m", label: "Per Metre (m)" },
  { value: "m2", label: "Per m²" },
  { value: "lump", label: "Lump Sum" },
];

const SECTION_OPTIONS = [
  "site_works",
  "demolition",
  "electrical",
  "plumbing",
  "roofing",
  "structural",
  "finishing",
  "other",
];

export function ChecklistPricingEditor() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.checklistItems.listAll.useQuery();
  const createMut = trpc.checklistItems.create.useMutation({
    onSuccess: () => {
      utils.checklistItems.listAll.invalidate();
      toast.success("Item added");
      setNewItem({ section: "site_works", label: "", unitPrice: "0", unit: "each" });
      setShowAdd(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.checklistItems.update.useMutation({
    onSuccess: () => {
      utils.checklistItems.listAll.invalidate();
      toast.success("Item updated");
      setEditingId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.checklistItems.delete.useMutation({
    onSuccess: () => {
      utils.checklistItems.listAll.invalidate();
      toast.success("Item deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ section: "site_works", label: "", unitPrice: "0", unit: "each" as "each" | "m" | "m2" | "lump" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<{ label: string; unitPrice: string; unit: "each" | "m" | "m2" | "lump"; section: string; isActive: boolean }>({ label: "", unitPrice: "0", unit: "each", section: "site_works", isActive: true });

  const handleAdd = () => {
    if (!newItem.label.trim()) { toast.error("Label is required"); return; }
    createMut.mutate(newItem);
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditData({ label: item.label, unitPrice: String(item.unitPrice), unit: item.unit, section: item.section, isActive: item.isActive });
  };

  const handleUpdate = () => {
    if (!editingId) return;
    updateMut.mutate({ id: editingId, data: editData });
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this checklist item?")) return;
    deleteMut.mutate({ id });
  };

  // Group items by section
  const grouped = (items || []).reduce<Record<string, typeof items>>((acc, item) => {
    const section = item.section || "other";
    if (!acc[section]) acc[section] = [];
    acc[section]!.push(item);
    return acc;
  }, {});

  if (isLoading) {
    return <div className="flex items-center gap-2 py-4"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-sm text-muted-foreground">Loading...</span></div>;
  }

  return (
    <div className="space-y-4 pb-4">
      <p className="text-xs text-muted-foreground">
        Define checklist items with pricing. When a design adviser checks an item on the spec sheet, they enter a quantity and the line total (price × qty) flows into the quote's Additional Costs.
      </p>

      {/* Add New Item */}
      {!showAdd ? (
        <Button size="sm" variant="outline" onClick={() => setShowAdd(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add Item
        </Button>
      ) : (
        <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Section</Label>
              <select
                value={newItem.section}
                onChange={(e) => setNewItem({ ...newItem, section: e.target.value })}
                className="w-full h-8 text-sm border rounded px-2 bg-background"
              >
                {SECTION_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={newItem.label}
                onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
                placeholder="e.g. Demolish existing concrete slab"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unit Price ($)</Label>
              <Input
                type="number"
                step="0.01"
                value={newItem.unitPrice}
                onChange={(e) => setNewItem({ ...newItem, unitPrice: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unit</Label>
              <select
                value={newItem.unit}
                onChange={(e) => setNewItem({ ...newItem, unit: e.target.value as "each" | "m" | "m2" | "lump" })}
                className="w-full h-8 text-sm border rounded px-2 bg-background"
              >
                {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={createMut.isPending} className="gap-1.5">
              {createMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Items List grouped by section */}
      {Object.keys(grouped).length === 0 && (
        <p className="text-sm text-muted-foreground italic py-2">No checklist items configured yet. Add items above.</p>
      )}

      {Object.entries(grouped).map(([section, sectionItems]) => (
        <div key={section} className="space-y-2">
          <h4 className="text-sm font-semibold capitalize text-muted-foreground">{section.replace(/_/g, " ")}</h4>
          <div className="space-y-1">
            {(sectionItems || []).map((item) => (
              <div key={item.id} className="flex items-center gap-2 px-3 py-2 border rounded text-sm group">
                {editingId === item.id ? (
                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                      <Input
                        value={editData.label}
                        onChange={(e) => setEditData({ ...editData, label: e.target.value })}
                        className="h-7 text-xs"
                        placeholder="Label"
                      />
                      <Input
                        type="number"
                        step="0.01"
                        value={editData.unitPrice}
                        onChange={(e) => setEditData({ ...editData, unitPrice: e.target.value })}
                        className="h-7 text-xs"
                        placeholder="Price"
                      />
                      <select
                        value={editData.unit}
                        onChange={(e) => setEditData({ ...editData, unit: e.target.value as "each" | "m" | "m2" | "lump" })}
                        className="h-7 text-xs border rounded px-1 bg-background"
                      >
                        {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                      </select>
                      <select
                        value={editData.section}
                        onChange={(e) => setEditData({ ...editData, section: e.target.value })}
                        className="h-7 text-xs border rounded px-1 bg-background"
                      >
                        {SECTION_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" checked={editData.isActive} onChange={(e) => setEditData({ ...editData, isActive: e.target.checked })} />
                        Active
                      </label>
                      <Button size="sm" variant="default" onClick={handleUpdate} disabled={updateMut.isPending} className="h-6 px-2 text-xs">Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-6 px-2 text-xs">Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 flex items-center gap-3">
                      <span className={`${!item.isActive ? "line-through text-muted-foreground" : ""}`}>{item.label}</span>
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        ${parseFloat(String(item.unitPrice)).toFixed(2)} / {item.unit}
                      </span>
                      {!item.isActive && <span className="text-[10px] text-amber-600 bg-amber-50 px-1 rounded">Inactive</span>}
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(item)} className="h-6 px-1.5">
                        <PenLine className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id)} className="h-6 px-1.5 text-red-600 hover:text-red-700">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
