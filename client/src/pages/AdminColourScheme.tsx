import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Inbox, Contact, LayoutDashboard, HardHat, Factory,
  Warehouse, ClipboardCheck, MapPin, Wallet, BarChart3, Shield,
  MessageSquare, Save, RotateCcw,
  type LucideIcon,
} from "lucide-react";

// ─── Default Palette Values ────────────────────────────────────────────────

const DEFAULT_BRAND_PALETTE: Record<string, { name: string; hex: string; purpose: string }> = {
  primaryNavy: { name: "Primary Navy", hex: "#06162D", purpose: "Logo circles, main backgrounds" },
  secondaryNavy: { name: "Secondary Navy", hex: "#102544", purpose: "Hover states, gradients" },
  brandGold: { name: "Brand Gold", hex: "#C9AB57", purpose: "Logo gold, primary accent" },
  goldHover: { name: "Gold Hover", hex: "#D6BA68", purpose: "Interactive states" },
  offWhite: { name: "Off White", hex: "#FAFAF8", purpose: "Main tile background" },
  lightGrey: { name: "Light Grey", hex: "#E8EAED", purpose: "Borders" },
  mediumGrey: { name: "Medium Grey", hex: "#6B7280", purpose: "Secondary text" },
  darkText: { name: "Dark Text", hex: "#1F2937", purpose: "Descriptions, body text" },
};

const DEFAULT_STATUS_COLOURS: Record<string, { name: string; hex: string; purpose: string }> = {
  success: { name: "Success", hex: "#16A34A", purpose: "Status indicators" },
  warning: { name: "Warning", hex: "#D97706", purpose: "Attention states" },
  error: { name: "Error", hex: "#DC2626", purpose: "Critical items" },
};

const DEFAULT_SIDEBAR_SETTINGS = {
  sidebarSectionHeader: "#C9AB57",
  sidebarSectionHeaderFontSize: "12",
};

type ModuleAccentDef = {
  key: string;
  module: string;
  defaultHex: string;
  icon: LucideIcon;
};

const MODULE_ACCENT_DEFS: ModuleAccentDef[] = [
  { key: "modInbox", module: "Inbox", defaultHex: "#C9AB57", icon: Inbox },
  { key: "modChat", module: "Chat", defaultHex: "#2563EB", icon: MessageSquare },
  { key: "modCrm", module: "CRM", defaultHex: "#2D5B9E", icon: Contact },
  { key: "modSales", module: "Sales", defaultHex: "#16A34A", icon: LayoutDashboard },
  { key: "modBuild", module: "Build", defaultHex: "#D97706", icon: HardHat },
  { key: "modManufacturing", module: "Manufacturing", defaultHex: "#7C3AED", icon: Factory },
  { key: "modInventory", module: "Inventory", defaultHex: "#EA580C", icon: Warehouse },
  { key: "modApprovals", module: "Approvals", defaultHex: "#0891B2", icon: ClipboardCheck },
  { key: "modDaTracker", module: "DA Tracker", defaultHex: "#0284C7", icon: MapPin },
  { key: "modFinance", module: "Finance", defaultHex: "#15803D", icon: Wallet },
  { key: "modReporting", module: "Reporting", defaultHex: "#4F46E5", icon: BarChart3 },
  { key: "modAdmin", module: "Admin", defaultHex: "#475569", icon: Shield },
];

// ─── Helper: build default flat map ────────────────────────────────────────

function buildDefaults(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [key, val] of Object.entries(DEFAULT_BRAND_PALETTE)) map[key] = val.hex;
  for (const [key, val] of Object.entries(DEFAULT_STATUS_COLOURS)) map[key] = val.hex;
  for (const [key, val] of Object.entries(DEFAULT_SIDEBAR_SETTINGS)) map[key] = val;
  for (const m of MODULE_ACCENT_DEFS) map[m.key] = m.defaultHex;
  return map;
}

// ─── Editable Colour Swatch ────────────────────────────────────────────────

function EditableColourSwatch({
  colourKey,
  name,
  purpose,
  hex,
  onChange,
}: {
  colourKey: string;
  name: string;
  purpose: string;
  hex: string;
  onChange: (key: string, val: string) => void;
}) {
  const isValid = /^#[0-9A-Fa-f]{6}$/.test(hex);
  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className="w-12 h-12 rounded-lg border border-[#E8EAED] shadow-sm shrink-0 relative overflow-hidden cursor-pointer"
        style={{ backgroundColor: isValid ? hex : "#fff" }}
      >
        <input
          type="color"
          value={isValid ? hex : "#000000"}
          onChange={(e) => onChange(colourKey, e.target.value.toUpperCase())}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          title="Pick colour"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#1F2937]">{name}</span>
          <Input
            value={hex}
            onChange={(e) => onChange(colourKey, e.target.value.toUpperCase())}
            className={`w-24 h-7 text-xs font-mono px-1.5 ${!isValid ? "border-red-400" : ""}`}
            maxLength={7}
          />
        </div>
        <p className="text-xs text-[#6B7280] mt-0.5">{purpose}</p>
      </div>
    </div>
  );
}

// ─── Editable Module Accent Row ────────────────────────────────────────────

function EditableModuleAccentRow({
  colourKey,
  module,
  hex,
  icon: Icon,
  onChange,
}: {
  colourKey: string;
  module: string;
  hex: string;
  icon: LucideIcon;
  onChange: (key: string, val: string) => void;
}) {
  const isValid = /^#[0-9A-Fa-f]{6}$/.test(hex);
  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-sm shrink-0 relative overflow-hidden cursor-pointer"
        style={{ backgroundColor: isValid ? hex : "#999" }}
      >
        <Icon className="h-5 w-5 relative z-10 pointer-events-none" />
        <input
          type="color"
          value={isValid ? hex : "#000000"}
          onChange={(e) => onChange(colourKey, e.target.value.toUpperCase())}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          title="Pick colour"
        />
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-[#1F2937]">{module}</span>
        <Input
          value={hex}
          onChange={(e) => onChange(colourKey, e.target.value.toUpperCase())}
          className={`w-24 h-7 text-xs font-mono px-1.5 ${!isValid ? "border-red-400" : ""}`}
          maxLength={7}
        />
      </div>
    </div>
  );
}

// ─── Page Component ─────────────────────────────────────────────────────────

export default function AdminColourScheme() {

  const defaults = buildDefaults();
  const [colours, setColours] = useState<Record<string, string>>(defaults);
  const [isDirty, setIsDirty] = useState(false);

  const { data: saved, isLoading } = trpc.globalSettings.getColourScheme.useQuery();
  const saveMutation = trpc.globalSettings.setColourScheme.useMutation({
    onSuccess: () => {
      setIsDirty(false);
      toast.success("Colour scheme updated successfully.");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  useEffect(() => {
    if (saved) {
      setColours({ ...defaults, ...saved });
    }
  }, [saved]);

  const handleChange = (key: string, value: string) => {
    setColours((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    saveMutation.mutate(colours);
  };

  const handleReset = () => {
    setColours(defaults);
    setIsDirty(true);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1F2937]">Colour Scheme</h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Brand palette and module accent colours used across the application. Click any swatch or hex code to edit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={!isDirty && !saved}
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset to Defaults
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || saveMutation.isPending}
          >
            <Save className="h-4 w-4 mr-1" />
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Brand Palette */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Brand Palette</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
            {Object.entries(DEFAULT_BRAND_PALETTE).map(([key, def]) => (
              <EditableColourSwatch
                key={key}
                colourKey={key}
                name={def.name}
                purpose={def.purpose}
                hex={colours[key] || def.hex}
                onChange={handleChange}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Status Colours */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Status Colours</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-1">
            {Object.entries(DEFAULT_STATUS_COLOURS).map(([key, def]) => (
              <EditableColourSwatch
                key={key}
                colourKey={key}
                name={def.name}
                purpose={def.purpose}
                hex={colours[key] || def.hex}
                onChange={handleChange}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sidebar Readability */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sidebar Readability</CardTitle>
          <p className="text-xs text-[#6B7280] mt-1">
            Controls the uppercase section header shown at the top of the sidebar, such as Construction, CRM, and Admin.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <EditableColourSwatch
              colourKey="sidebarSectionHeader"
              name="Section Header Colour"
              purpose="Sidebar section header text and fallback accent"
              hex={colours.sidebarSectionHeader || DEFAULT_SIDEBAR_SETTINGS.sidebarSectionHeader}
              onChange={handleChange}
            />
            <div className="space-y-1.5 py-2">
              <span className="text-sm font-semibold text-[#1F2937]">Section Header Size</span>
              <p className="text-xs text-[#6B7280]">Font size in pixels. Recommended range: 11-14.</p>
              <Input
                type="number"
                min={10}
                max={16}
                step={1}
                value={colours.sidebarSectionHeaderFontSize || DEFAULT_SIDEBAR_SETTINGS.sidebarSectionHeaderFontSize}
                onChange={(e) => handleChange("sidebarSectionHeaderFontSize", e.target.value)}
                className="w-28 h-8 text-xs"
              />
              <div
                className="rounded-md bg-[#06162D] px-4 py-3 border border-[#102544]"
                style={{ color: colours.sidebarSectionHeader || DEFAULT_SIDEBAR_SETTINGS.sidebarSectionHeader }}
              >
                <span
                  className="font-semibold uppercase tracking-widest"
                  style={{ fontSize: `${Number(colours.sidebarSectionHeaderFontSize || DEFAULT_SIDEBAR_SETTINGS.sidebarSectionHeaderFontSize)}px` }}
                >
                  Construction
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Module Accent Colours */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Module Accent Colours</CardTitle>
          <p className="text-xs text-[#6B7280] mt-1">
            Each module uses a neutral tile background with a coloured accent stripe and icon.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1">
            {MODULE_ACCENT_DEFS.map((m) => (
              <EditableModuleAccentRow
                key={m.key}
                colourKey={m.key}
                module={m.module}
                hex={colours[m.key] || m.defaultHex}
                icon={m.icon}
                onChange={handleChange}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Usage Guidelines */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Usage Guidelines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-[#1F2937]">
          <div>
            <p className="font-medium">Tile Design</p>
            <p className="text-[#6B7280] text-xs mt-0.5">
              All module tiles use Off White ({colours.offWhite || "#FAFAF8"}) background with a 3px coloured top border
              in the module's accent colour. Icons sit on a rounded square filled with the accent colour.
            </p>
          </div>
          <div>
            <p className="font-medium">Text Hierarchy</p>
            <p className="text-[#6B7280] text-xs mt-0.5">
              Primary headings and labels use Dark Text ({colours.darkText || "#1F2937"}). Secondary descriptions and
              metadata use Medium Grey ({colours.mediumGrey || "#6B7280"}). Interactive gold text uses Brand Gold ({colours.brandGold || "#C9AB57"}).
            </p>
          </div>
          <div>
            <p className="font-medium">Dark Backgrounds</p>
            <p className="text-[#6B7280] text-xs mt-0.5">
              Headers, sidebars, and overlays use Primary Navy ({colours.primaryNavy || "#06162D"}). Hover and gradient
              transitions use Secondary Navy ({colours.secondaryNavy || "#102544"}). Text on dark backgrounds is always white.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
