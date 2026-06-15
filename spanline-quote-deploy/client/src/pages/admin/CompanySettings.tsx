import { useState, useRef, useEffect } from "react";
import { useIsMobile } from "@/hooks/useMobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MapPin, Plus, Trash2, Save, Building2, Image, Upload, Pencil, Phone, Mail, MessageSquare, DollarSign, Menu, Palette } from "lucide-react";
import { toast } from "sonner";
import {
  loadCompanyDetails,
  loadCustomLogo,
  clearCustomLogo,
  fileToCustomLogo,
  loadAppIcon,
  clearAppIcon,
  fileToAppIcon,
  loadFavicon,
  clearFavicon,
  fileToFavicon,
  type CompanyDetails,
  type CustomLogo,
  type AppIcon,
  type Favicon,
} from "@/lib/proposalStore";
import { useSettingsSync } from "@/hooks/useSettingsSync";
import { CompanyThemeSection } from "@/components/CompanyThemeSection";

interface Branch {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  smsNumber: string | null;
  managerName: string | null;
  managerEmail?: string | null;
  managerUserId: number | null;
  isActive: boolean;
}

const SECTIONS = [
  { id: "company-details", label: "Company Details", icon: Building2 },
  { id: "theme", label: "Theme & Colours", icon: Palette },
  { id: "logo", label: "Proposal Logo", icon: Image },
  { id: "app-icon", label: "App Logo", icon: Upload },
  { id: "favicon", label: "Favicon", icon: Image },
  { id: "branches", label: "Branch Offices", icon: MapPin },
  { id: "render-pricing", label: "AI Render Pricing", icon: DollarSign },
  { id: "login-background", label: "Login Background", icon: Image },
];

// ─── Image compression helpers ─────────────────────────────────────────────
function compressImage(file: File, maxW: number, maxH: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
      if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob failed")),
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = URL.createObjectURL(file);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix to get raw base64
      resolve(result.split(",")[1] || result);
    };
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

export default function CompanySettings() {
  const { data: branchList, isLoading } = trpc.branches.list.useQuery();
  const createBranch = trpc.branches.create.useMutation();
  const updateBranch = trpc.branches.update.useMutation();
  const deleteBranch = trpc.branches.delete.useMutation();
  const utils = trpc.useUtils();
  const { syncCompanyDetails, syncAppIcon, syncFavicon, syncCustomLogo } = useSettingsSync();

  // Company Details state (from proposalStore)
  const [company, setCompany] = useState<CompanyDetails>(loadCompanyDetails());
  const [logo, setLogo] = useState<CustomLogo | null>(loadCustomLogo());
  const [appIcon, setAppIcon] = useState<AppIcon | null>(loadAppIcon());
  const [favicon, setFavicon] = useState<Favicon | null>(loadFavicon());
  const logoInputRef = useRef<HTMLInputElement>(null);
  const appIconInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  // Branch form state
  const [newBranch, setNewBranch] = useState({ name: "", address: "", phone: "", email: "", smsNumber: "", managerName: "", managerEmail: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBranch, setEditBranch] = useState({ name: "", address: "", phone: "", email: "", smsNumber: "", managerName: "", managerEmail: "" });

  // AI Render Pricing state
  const { data: renderPricing } = trpc.globalSettings.getRenderPricing.useQuery();
  const setRenderPricing = trpc.globalSettings.setRenderPricing.useMutation();
  const [pricingForm, setPricingForm] = useState({
    fullRenderCostAud: 0.08,
    quickRenderCostAud: 0.04,
    batchRenderCostAud: 0.06,
    monthlyBudgetAud: 10.0,
  });
  const [pricingLoaded, setPricingLoaded] = useState(false);

  // Load pricing from server
  if (renderPricing && !pricingLoaded) {
    setPricingForm({
      fullRenderCostAud: renderPricing.fullRenderCostAud,
      quickRenderCostAud: renderPricing.quickRenderCostAud,
      batchRenderCostAud: renderPricing.batchRenderCostAud,
      monthlyBudgetAud: renderPricing.monthlyBudgetAud,
    });
    setPricingLoaded(true);
  }

  const handleSaveRenderPricing = async () => {
    try {
      await setRenderPricing.mutateAsync(pricingForm);
      toast.success("AI render pricing saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save pricing");
    }
  };

  // Login Background state
  const { data: loginBgData } = trpc.globalSettings.getLoginBackground.useQuery();
  const uploadLoginBg = trpc.globalSettings.uploadLoginBackground.useMutation();
  const removeLoginBg = trpc.globalSettings.removeLoginBackground.useMutation();
  const loginBgInputRef = useRef<HTMLInputElement>(null);
  const [loginBgUploading, setLoginBgUploading] = useState(false);

  const handleLoginBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Client-side resize/compress to ~300KB max
    setLoginBgUploading(true);
    try {
      const compressed = await compressImage(file, 1920, 1080, 0.8);
      const base64 = await blobToBase64(compressed);
      await uploadLoginBg.mutateAsync({
        fileBase64: base64,
        fileName: file.name,
        mimeType: file.type || "image/jpeg",
      });
      utils.globalSettings.getLoginBackground.invalidate();
      toast.success("Login background updated");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setLoginBgUploading(false);
      if (loginBgInputRef.current) loginBgInputRef.current.value = "";
    }
  };

  const handleRemoveLoginBg = async () => {
    try {
      await removeLoginBg.mutateAsync();
      utils.globalSettings.getLoginBackground.invalidate();
      toast.success("Login background removed (reverted to default)");
    } catch (err: any) {
      toast.error(err.message || "Failed to remove");
    }
  };

  // Login Tagline state
  const { data: taglineData } = trpc.globalSettings.getLoginTagline.useQuery();
  const setTaglineMut = trpc.globalSettings.setLoginTagline.useMutation();
  const [taglineHeadline, setTaglineHeadline] = useState("");
  const [taglineSubtitle, setTaglineSubtitle] = useState("");
  const [taglineSignInPrompt, setTaglineSignInPrompt] = useState("");
  const [taglineLoaded, setTaglineLoaded] = useState(false);

  useEffect(() => {
    if (taglineData && !taglineLoaded) {
      setTaglineHeadline(taglineData.headline || "");
      setTaglineSubtitle(taglineData.subtitle || "");
      setTaglineSignInPrompt(taglineData.signInPrompt || "");
      setTaglineLoaded(true);
    }
  }, [taglineData, taglineLoaded]);

  const handleSaveTagline = async () => {
    try {
      await setTaglineMut.mutateAsync({
        headline: taglineHeadline || "Elevate Every Build",
        subtitle: taglineSubtitle || "The operating platform for outdoor living builders.",
        signInPrompt: taglineSignInPrompt || "Sign in to access your project dashboard.",
      });
      utils.globalSettings.getLoginTagline.invalidate();
      toast.success("Login tagline updated");
    } catch (err: any) {
      toast.error(err.message || "Failed to save tagline");
    }
  };

  // Sidebar + Accordion state
  const [activeSection, setActiveSection] = useState("company-details");
  const [openSections, setOpenSections] = useState<string[]>(["company-details"]);
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

  const handleSaveCompany = () => {
    syncCompanyDetails(company);
    toast.success("Company details saved");
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const logoData = await fileToCustomLogo(file);
      syncCustomLogo(logoData);
      setLogo(logoData);
      toast.success("Logo uploaded");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload logo");
    }
    if (logoInputRef.current) logoInputRef.current.value = "";
  };

  const handleRemoveLogo = () => {
    syncCustomLogo(null);
    setLogo(null);
    toast.success("Logo removed");
  };

  const handleAppIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const iconData = await fileToAppIcon(file);
      syncAppIcon(iconData);
      setAppIcon(iconData);
      toast.success("App icon uploaded");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload app icon");
    }
    if (appIconInputRef.current) appIconInputRef.current.value = "";
  };

  const handleRemoveAppIcon = () => {
    syncAppIcon(null);
    setAppIcon(null);
    toast.success("App logo removed");
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const iconData = await fileToFavicon(file);
      syncFavicon(iconData);
      setFavicon(iconData);
      toast.success("Favicon uploaded");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload favicon");
    }
    if (faviconInputRef.current) faviconInputRef.current.value = "";
  };

  const handleRemoveFavicon = () => {
    syncFavicon(null);
    setFavicon(null);
    toast.success("Favicon removed");
  };

  const handleAddBranch = async () => {
    if (!newBranch.name.trim()) {
      toast.error("Please enter a branch name");
      return;
    }
    try {
      await createBranch.mutateAsync({
        name: newBranch.name.trim(),
        address: newBranch.address.trim() || undefined,
        phone: newBranch.phone.trim() || undefined,
        email: newBranch.email.trim() || undefined,
        smsNumber: newBranch.smsNumber.trim() || undefined,
        managerName: newBranch.managerName.trim() || null,
        managerEmail: newBranch.managerEmail.trim() || null,
      });
      toast.success(`Branch "${newBranch.name}" added`);
      setNewBranch({ name: "", address: "", phone: "", email: "", smsNumber: "", managerName: "", managerEmail: "" });
      utils.branches.list.invalidate();
    } catch (err: any) {
      toast.error(err.message || "Failed to add branch");
    }
  };

  const handleUpdateBranch = async (id: number) => {
    if (!editBranch.name.trim()) {
      toast.error("Please enter a branch name");
      return;
    }
    try {
      await updateBranch.mutateAsync({
        id,
        name: editBranch.name.trim(),
        address: editBranch.address.trim() || undefined,
        phone: editBranch.phone.trim() || undefined,
        email: editBranch.email.trim() || undefined,
        smsNumber: editBranch.smsNumber.trim() || undefined,
        managerName: editBranch.managerName.trim() || null,
        managerEmail: editBranch.managerEmail.trim() || null,
      });
      toast.success(`Branch "${editBranch.name}" updated`);
      setEditingId(null);
      utils.branches.list.invalidate();
    } catch (err: any) {
      toast.error(err.message || "Failed to update branch");
    }
  };

  const handleDeleteBranch = async (branch: Branch) => {
    if (!confirm(`Delete branch "${branch.name}"? This will deactivate it.`)) return;
    try {
      await deleteBranch.mutateAsync({ id: branch.id });
      toast.success(`Branch "${branch.name}" deactivated`);
      utils.branches.list.invalidate();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete branch");
    }
  };

  const startEdit = (branch: Branch) => {
    setEditingId(branch.id);
    setEditBranch({
      name: branch.name,
      address: branch.address || "",
      phone: branch.phone || "",
      email: branch.email || "",
      smsNumber: branch.smsNumber || "",
      managerName: branch.managerName || "",
      managerEmail: branch.managerEmail || "",
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Company Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage company identity, branding, and branch locations
        </p>
      </div>

      {/* Mobile Section Nav */}
      <CompanyMobileSectionNav
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
              const isActive2 = activeSection === section.id;
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                    isActive2
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
            {/* Company Details */}
            <AccordionItem value="company-details" className="border rounded-lg px-4">
              <div ref={(el) => { sectionRefs.current["company-details"] = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-blue-600" />
                    Company Details
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pb-4">
                    <p className="text-xs text-muted-foreground">Appears on proposal cover page and footer</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Company Name</Label>
                        <Input value={company.companyName} onChange={(e) => setCompany({ ...company, companyName: e.target.value })} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">ABN</Label>
                        <Input value={company.abn} onChange={(e) => setCompany({ ...company, abn: e.target.value })} className="h-8 text-sm" placeholder="XX XXX XXX XXX" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Phone</Label>
                        <Input value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Email</Label>
                        <Input value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Website</Label>
                        <Input value={company.website} onChange={(e) => setCompany({ ...company, website: e.target.value })} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Address</Label>
                        <Input value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Licence ACT</Label>
                        <Input value={company.licenceACT} onChange={(e) => setCompany({ ...company, licenceACT: e.target.value })} className="h-8 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Licence NSW</Label>
                        <Input value={company.licenceNSW} onChange={(e) => setCompany({ ...company, licenceNSW: e.target.value })} className="h-8 text-sm" />
                      </div>
                    </div>
                    <div className="flex justify-end pt-2">
                      <Button onClick={handleSaveCompany} size="sm" className="gap-2">
                        <Save className="h-3.5 w-3.5" /> Save Company Details
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </div>
            </AccordionItem>

            {/* Theme & Colours */}
            <AccordionItem value="theme" className="border rounded-lg px-4">
              <div ref={(el) => { sectionRefs.current.theme = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-violet-600" />
                    Theme & Colours
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <CompanyThemeSection />
                </AccordionContent>
              </div>
            </AccordionItem>

            {/* Proposal Logo */}
            <AccordionItem value="logo" className="border rounded-lg px-4">
              <div ref={(el) => { sectionRefs.current.logo = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  <div className="flex items-center gap-2">
                    <Image className="h-4 w-4 text-purple-600" />
                    Proposal Logo
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pb-4">
                    <p className="text-xs text-muted-foreground mb-3">Used on proposal cover page, PDF headers, and as sidebar fallback if no app icon is set (max 2MB, PNG/JPG)</p>
                    {logo ? (
                      <div className="flex items-center gap-4">
                        <div className="border rounded-lg p-3 bg-muted/30">
                          <img src={logo.dataUrl} alt="Company logo" className="max-h-16 max-w-48 object-contain" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">{logo.fileName}</p>
                          <p className="text-xs text-muted-foreground">{logo.width} x {logo.height}px</p>
                          <Button variant="outline" size="sm" onClick={handleRemoveLogo} className="gap-1.5 text-xs text-destructive">
                            <Trash2 className="h-3 w-3" /> Remove
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => logoInputRef.current?.click()}
                      >
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">Click to upload logo</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">PNG or JPG, max 2MB</p>
                      </div>
                    )}
                    <input ref={logoInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleLogoUpload} />
                  </div>
                </AccordionContent>
              </div>
            </AccordionItem>

            {/* App Logo */}
            <AccordionItem value="app-icon" className="border rounded-lg px-4">
              <div ref={(el) => { sectionRefs.current["app-icon"] = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4 text-indigo-600" />
                    App Logo
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pb-4">
                    <p className="text-xs text-muted-foreground mb-3">
                      Logo displayed in the sidebar and login page. Recommended: 128×128px or larger, square aspect ratio (max 1MB, PNG/JPG/SVG)
                    </p>
                    {appIcon ? (
                      <div className="flex items-center gap-4">
                        <div className="border rounded-lg p-3 bg-muted/30">
                          <img src={appIcon.dataUrl} alt="App logo" className="h-16 w-16 object-contain rounded" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">{appIcon.fileName}</p>
                          <p className="text-xs text-muted-foreground">{appIcon.width} × {appIcon.height}px</p>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => appIconInputRef.current?.click()} className="gap-1.5 text-xs">
                              <Upload className="h-3 w-3" /> Replace
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleRemoveAppIcon} className="gap-1.5 text-xs text-destructive">
                              <Trash2 className="h-3 w-3" /> Remove
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => appIconInputRef.current?.click()}
                      >
                        <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">Click to upload app logo</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">Square PNG, JPG, or SVG, max 1MB</p>
                      </div>
                    )}
                    <input ref={appIconInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={handleAppIconUpload} />
                  </div>
                </AccordionContent>
              </div>
            </AccordionItem>

            {/* Favicon */}
            <AccordionItem value="favicon" className="border rounded-lg px-4">
              <div ref={(el) => { sectionRefs.current["favicon"] = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  <div className="flex items-center gap-2">
                    <Image className="h-4 w-4 text-amber-600" />
                    Favicon
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pb-4">
                    <p className="text-xs text-muted-foreground mb-3">
                      Small icon displayed in the browser tab. Recommended: 32×32px or 64×64px, square (max 1MB, PNG/JPG/SVG). Falls back to App Logo if not set.
                    </p>
                    {favicon ? (
                      <div className="flex items-center gap-4">
                        <div className="border rounded-lg p-3 bg-muted/30">
                          <img src={favicon.dataUrl} alt="Favicon" className="h-16 w-16 object-contain rounded" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">{favicon.fileName}</p>
                          <p className="text-xs text-muted-foreground">{favicon.width} × {favicon.height}px</p>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => faviconInputRef.current?.click()} className="gap-1.5 text-xs">
                              <Upload className="h-3 w-3" /> Replace
                            </Button>
                            <Button variant="outline" size="sm" onClick={handleRemoveFavicon} className="gap-1.5 text-xs text-destructive">
                              <Trash2 className="h-3 w-3" /> Remove
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => faviconInputRef.current?.click()}
                      >
                        <Image className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                        <p className="text-sm text-muted-foreground">Click to upload favicon</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">Square PNG, JPG, or SVG, max 1MB</p>
                      </div>
                    )}
                    <input ref={faviconInputRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/x-icon" className="hidden" onChange={handleFaviconUpload} />
                  </div>
                </AccordionContent>
              </div>
            </AccordionItem>

            {/* Branch Offices */}
            <AccordionItem value="branches" className="border rounded-lg px-4">
              <div ref={(el) => { sectionRefs.current.branches = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-emerald-600" />
                    Branch Offices
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pb-4">
                    <p className="text-xs text-muted-foreground">
                      Branch addresses are used for travel allowance calculations. Each branch can have its own phone, email, and SMS number for communications.
                    </p>

                    {/* Existing branches */}
                    {(!branchList || branchList.length === 0) ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Building2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
                        <p>No branches configured yet.</p>
                        <p className="text-xs mt-1">Add your first branch below to enable travel allowance calculations.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {branchList.map((branch) => (
                          <div key={branch.id} className="p-4 rounded-lg border bg-muted/30">
                            {editingId === branch.id ? (
                              <div className="space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Branch Name</Label>
                                    <Input
                                      value={editBranch.name}
                                      onChange={(e) => setEditBranch({ ...editBranch, name: e.target.value })}
                                      placeholder="e.g. Fyshwick"
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Address</Label>
                                    <Input
                                      value={editBranch.address}
                                      onChange={(e) => setEditBranch({ ...editBranch, address: e.target.value })}
                                      placeholder="e.g. 27 Yallourn St, Fyshwick ACT 2609"
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Phone</Label>
                                    <Input
                                      value={editBranch.phone}
                                      onChange={(e) => setEditBranch({ ...editBranch, phone: e.target.value })}
                                      placeholder="e.g. 02 6280 1234"
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Email</Label>
                                    <Input
                                      value={editBranch.email}
                                      onChange={(e) => setEditBranch({ ...editBranch, email: e.target.value })}
                                      placeholder="e.g. fyshwick@altaspan.com"
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">SMS Number</Label>
                                    <Input
                                      value={editBranch.smsNumber}
                                      onChange={(e) => setEditBranch({ ...editBranch, smsNumber: e.target.value })}
                                      placeholder="e.g. +61412345678"
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Manager Name</Label>
                                    <Input
                                      value={editBranch.managerName}
                                      onChange={(e) => setEditBranch({ ...editBranch, managerName: e.target.value })}
                                      placeholder="e.g. John Smith"
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs">Manager Email (for notifications)</Label>
                                    <Input
                                      value={editBranch.managerEmail}
                                      onChange={(e) => setEditBranch({ ...editBranch, managerEmail: e.target.value })}
                                      placeholder="e.g. john.smith@altaspan.com"
                                      className="h-8 text-sm"
                                      type="email"
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => handleUpdateBranch(branch.id)}
                                    disabled={updateBranch.isPending}
                                  >
                                    <Save className="h-3 w-3" /> Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={() => setEditingId(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start gap-3">
                                <MapPin className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm">{branch.name}</p>
                                  {branch.address && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{branch.address}</p>
                                  )}
                                  <div className="flex flex-wrap gap-3 mt-1.5">
                                    {branch.phone && (
                                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                        <Phone className="h-3 w-3" /> {branch.phone}
                                      </span>
                                    )}
                                    {branch.email && (
                                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                        <Mail className="h-3 w-3" /> {branch.email}
                                      </span>
                                    )}
                                    {branch.smsNumber && (
                                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                        <MessageSquare className="h-3 w-3" /> {branch.smsNumber}
                                      </span>
                                    )}
                                  </div>
                                  {branch.managerName && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Manager: {branch.managerName}{branch.managerEmail ? ` (${branch.managerEmail})` : ""}
                                    </p>
                                  )}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    onClick={() => startEdit(branch)}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteBranch(branch)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add new branch */}
                    <div className="border-t pt-4 mt-4">
                      <p className="text-sm font-medium mb-3">Add New Branch</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Branch Name *</Label>
                          <Input
                            value={newBranch.name}
                            onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                            placeholder="e.g. Queanbeyan"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Address</Label>
                          <Input
                            value={newBranch.address}
                            onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })}
                            placeholder="e.g. 15 Smith St, Queanbeyan NSW 2620"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Phone</Label>
                          <Input
                            value={newBranch.phone}
                            onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })}
                            placeholder="e.g. 02 6280 1234"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Email</Label>
                          <Input
                            value={newBranch.email}
                            onChange={(e) => setNewBranch({ ...newBranch, email: e.target.value })}
                            placeholder="e.g. queanbeyan@altaspan.com"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">SMS Number</Label>
                          <Input
                            value={newBranch.smsNumber}
                            onChange={(e) => setNewBranch({ ...newBranch, smsNumber: e.target.value })}
                            placeholder="e.g. +61412345678"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Manager Name</Label>
                          <Input
                            value={newBranch.managerName}
                            onChange={(e) => setNewBranch({ ...newBranch, managerName: e.target.value })}
                            placeholder="e.g. John Smith"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Manager Email</Label>
                          <Input
                            value={newBranch.managerEmail}
                            onChange={(e) => setNewBranch({ ...newBranch, managerEmail: e.target.value })}
                            placeholder="e.g. john.smith@altaspan.com"
                            className="h-8 text-sm"
                            type="email"
                          />
                        </div>
                        <div className="flex items-end">
                          <Button
                            size="sm"
                            className="h-8 text-xs gap-1"
                            onClick={handleAddBranch}
                            disabled={createBranch.isPending || !newBranch.name.trim()}
                          >
                            <Plus className="h-3 w-3" /> Add Branch
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </AccordionContent>
              </div>
            </AccordionItem>
            {/* AI Render Pricing */}
            <AccordionItem value="render-pricing" className="border rounded-lg px-4">
              <div ref={(el) => { sectionRefs.current["render-pricing"] = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    AI Render Pricing
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pb-4">
                    <p className="text-sm text-muted-foreground">
                      Set the cost per render type (AUD) and monthly budget. These rates are used to track AI render generation costs.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs">Full Render Cost (AUD)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="10"
                          value={pricingForm.fullRenderCostAud}
                          onChange={(e) => setPricingForm({ ...pricingForm, fullRenderCostAud: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-sm"
                        />
                        <p className="text-[10px] text-muted-foreground">High-quality detailed render</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Quick Render Cost (AUD)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="10"
                          value={pricingForm.quickRenderCostAud}
                          onChange={(e) => setPricingForm({ ...pricingForm, quickRenderCostAud: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-sm"
                        />
                        <p className="text-[10px] text-muted-foreground">Fast preview render</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Batch Render Cost (AUD)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="10"
                          value={pricingForm.batchRenderCostAud}
                          onChange={(e) => setPricingForm({ ...pricingForm, batchRenderCostAud: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-sm"
                        />
                        <p className="text-[10px] text-muted-foreground">Per render in batch mode</p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Monthly Budget (AUD)</Label>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          max="10000"
                          value={pricingForm.monthlyBudgetAud}
                          onChange={(e) => setPricingForm({ ...pricingForm, monthlyBudgetAud: parseFloat(e.target.value) || 0 })}
                          className="h-8 text-sm"
                        />
                        <p className="text-[10px] text-muted-foreground">Alert threshold for monthly spending</p>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1"
                        onClick={handleSaveRenderPricing}
                        disabled={setRenderPricing.isPending}
                      >
                        <Save className="h-3 w-3" /> Save Pricing
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </div>
            </AccordionItem>

            {/* Login Background */}
            <AccordionItem value="login-background" className="border rounded-lg px-4">
              <div ref={(el) => { sectionRefs.current["login-background"] = el; }}>
                <AccordionTrigger className="text-base font-semibold py-4">
                  <div className="flex items-center gap-2">
                    <Image className="h-4 w-4 text-blue-600" />
                    Login Background
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pb-4">
                    <p className="text-sm text-muted-foreground">
                      Upload a custom background image for the login page. Recommended size: 1920×1080px. Images will be auto-compressed to ~300KB.
                    </p>
                    {loginBgData?.url && (
                      <div className="relative rounded-lg overflow-hidden border">
                        <img
                          src={loginBgData.url}
                          alt="Login background preview"
                          className="w-full h-40 object-cover"
                        />
                        <div className="absolute top-2 right-2">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={handleRemoveLoginBg}
                            disabled={removeLoginBg.isPending}
                          >
                            <Trash2 className="h-3 w-3 mr-1" /> Remove
                          </Button>
                        </div>
                        {loginBgData.originalName && (
                          <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded">
                            {loginBgData.originalName}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <input
                        ref={loginBgInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLoginBgUpload}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1"
                        onClick={() => loginBgInputRef.current?.click()}
                        disabled={loginBgUploading}
                      >
                        <Upload className="h-3 w-3" />
                        {loginBgUploading ? "Uploading..." : loginBgData?.url ? "Replace Image" : "Upload Image"}
                      </Button>
                    </div>

                    {/* Login Tagline */}
                    <div className="border-t pt-4 mt-4 space-y-3">
                      <h4 className="text-sm font-medium">Login Page Tagline</h4>
                      <p className="text-xs text-muted-foreground">
                        Customise the headline and subtitle shown on the login page.
                      </p>
                      <div className="space-y-2">
                        <label className="text-xs font-medium">Headline</label>
                        <Input
                          value={taglineHeadline}
                          onChange={(e) => setTaglineHeadline(e.target.value)}
                          placeholder="Elevate Every Build"
                          maxLength={100}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium">Subtitle</label>
                        <Input
                          value={taglineSubtitle}
                          onChange={(e) => setTaglineSubtitle(e.target.value)}
                          placeholder="The operating platform for outdoor living builders."
                          maxLength={200}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium">Sign-in Prompt</label>
                        <Input
                          value={taglineSignInPrompt}
                          onChange={(e) => setTaglineSignInPrompt(e.target.value)}
                          placeholder="Sign in to access your project dashboard."
                          maxLength={200}
                        />
                        <p className="text-[10px] text-muted-foreground">Shown below the logo, above the sign-in button.</p>
                      </div>
                      <Button
                        size="sm"
                        className="h-8 text-xs"
                        onClick={handleSaveTagline}
                        disabled={setTaglineMut.isPending}
                      >
                        {setTaglineMut.isPending ? "Saving..." : "Save Tagline"}
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </div>
            </AccordionItem>
          </Accordion>
        </div>
      </div>
    </div>
  );
}


// ─── Mobile Section Nav (Sheet overlay for section navigation on mobile) ─────
function CompanyMobileSectionNav({
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
  const CurrentIcon = currentSection?.icon || Building2;

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
            <SheetTitle>Company Settings Navigation</SheetTitle>
            <SheetDescription>Navigate between company settings sections</SheetDescription>
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
