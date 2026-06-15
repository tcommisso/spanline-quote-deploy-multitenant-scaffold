/**
 * CompanyThemeSection — Hybrid theme selector for Company Settings.
 * Shows preset palettes as quick-start options, plus an "Advanced" toggle
 * with custom colour pickers for primary, accent, and sidebar.
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Save, Check, RotateCcw, Palette } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { type ColorScheme, COLOR_SCHEME_LABELS } from "@/contexts/ThemeContext";

// Preset swatches — hex colours for display
const PRESET_COLORS: Record<string, { primary: string; accent: string; sidebar: string; label: string }> = {
  altaspan: { primary: "#06162D", accent: "#C9AB57", sidebar: "#102544", label: "Altaspan" },
  spanline: { primary: "#004677", accent: "#DA291C", sidebar: "#004677", label: "Spanline" },
  default: { primary: "#1A8A7A", accent: "#1A8A7A", sidebar: "#0F2D2A", label: "Teal" },
  purple: { primary: "#7C3AED", accent: "#7C3AED", sidebar: "#1E0A3E", label: "Purple" },
  forest: { primary: "#166534", accent: "#166534", sidebar: "#0A2E18", label: "Forest Green" },
  slate: { primary: "#475569", accent: "#475569", sidebar: "#1E293B", label: "Slate Grey" },
};

const PRESET_ORDER: ColorScheme[] = ["altaspan", "spanline", "default", "purple", "forest", "slate"];

export interface CompanyThemeData {
  preset: ColorScheme;
  customEnabled: boolean;
  customColors: {
    primary: string;
    accent: string;
    sidebar: string;
  };
}

const DEFAULT_THEME: CompanyThemeData = {
  preset: "altaspan",
  customEnabled: false,
  customColors: { primary: "#06162D", accent: "#C9AB57", sidebar: "#102544" },
};

export function CompanyThemeSection() {
  const utils = trpc.useUtils();
  const { data: companyTheme } = trpc.userSettings.getCompanyTheme.useQuery();
  const saveMutation = trpc.userSettings.save.useMutation({
    onSuccess: () => {
      toast.success("Company theme saved — all users will see this on next load");
      utils.userSettings.getCompanyTheme.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to save theme"),
  });

  const [theme, setTheme] = useState<CompanyThemeData>(DEFAULT_THEME);
  const [loaded, setLoaded] = useState(false);

  // Load from server
  useEffect(() => {
    if (companyTheme && !loaded) {
      const ct = companyTheme as unknown as CompanyThemeData;
      setTheme({
        preset: ct.preset || "altaspan",
        customEnabled: ct.customEnabled || false,
        customColors: ct.customColors || DEFAULT_THEME.customColors,
      });
      setLoaded(true);
    } else if (companyTheme === null && !loaded) {
      setLoaded(true);
    }
  }, [companyTheme, loaded]);

  const selectPreset = useCallback((preset: ColorScheme) => {
    const colors = PRESET_COLORS[preset];
    setTheme(prev => ({
      ...prev,
      preset,
      customColors: { primary: colors.primary, accent: colors.accent, sidebar: colors.sidebar },
    }));
  }, []);

  const handleSave = () => {
    saveMutation.mutate({ companyTheme: theme });
  };

  const handleReset = () => {
    setTheme(DEFAULT_THEME);
    toast.info("Reset to Altaspan default — click Save to apply");
  };

  return (
    <div className="space-y-5 pb-4">
      <p className="text-xs text-muted-foreground">
        Choose a colour scheme for the entire application. This applies to all users and both portals.
      </p>

      {/* Preset Palette Grid */}
      <div>
        <Label className="text-xs font-medium mb-2 block">Preset Palettes</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {PRESET_ORDER.map((scheme) => {
            const colors = PRESET_COLORS[scheme];
            const isActive = theme.preset === scheme && !theme.customEnabled;
            return (
              <button
                key={scheme}
                onClick={() => selectPreset(scheme)}
                className={`relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                  isActive
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                    : "border-border hover:border-primary/40 hover:bg-muted/50"
                }`}
              >
                {/* Colour swatches */}
                <div className="flex gap-1.5">
                  <div
                    className="w-6 h-6 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: colors.primary }}
                    title="Primary"
                  />
                  <div
                    className="w-6 h-6 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: colors.accent }}
                    title="Accent"
                  />
                  <div
                    className="w-6 h-6 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: colors.sidebar }}
                    title="Sidebar"
                  />
                </div>
                <span className="text-xs font-medium text-foreground">{colors.label}</span>
                {isActive && (
                  <div className="absolute top-1.5 right-1.5">
                    <Check className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Advanced Custom Colours Toggle */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Advanced: Custom Colours</Label>
          </div>
          <Switch
            checked={theme.customEnabled}
            onCheckedChange={(checked) => setTheme(prev => ({ ...prev, customEnabled: checked }))}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Fine-tune the primary, accent, and sidebar colours. The preset populates these as a starting point.
        </p>
      </div>

      {/* Custom Colour Pickers (shown when advanced is enabled) */}
      {theme.customEnabled && (
        <div className="space-y-4 pl-1 border-l-2 border-primary/20 ml-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pl-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Primary Colour</Label>
              <p className="text-[10px] text-muted-foreground">Buttons, headers, nav highlights</p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={theme.customColors.primary}
                  onChange={(e) => setTheme(prev => ({
                    ...prev,
                    customColors: { ...prev.customColors, primary: e.target.value },
                  }))}
                  className="w-10 h-8 rounded border cursor-pointer"
                />
                <Input
                  value={theme.customColors.primary}
                  onChange={(e) => setTheme(prev => ({
                    ...prev,
                    customColors: { ...prev.customColors, primary: e.target.value },
                  }))}
                  className="h-8 text-xs font-mono w-24"
                  placeholder="#000000"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Accent Colour</Label>
              <p className="text-[10px] text-muted-foreground">Highlights, badges, active states</p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={theme.customColors.accent}
                  onChange={(e) => setTheme(prev => ({
                    ...prev,
                    customColors: { ...prev.customColors, accent: e.target.value },
                  }))}
                  className="w-10 h-8 rounded border cursor-pointer"
                />
                <Input
                  value={theme.customColors.accent}
                  onChange={(e) => setTheme(prev => ({
                    ...prev,
                    customColors: { ...prev.customColors, accent: e.target.value },
                  }))}
                  className="h-8 text-xs font-mono w-24"
                  placeholder="#000000"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sidebar Colour</Label>
              <p className="text-[10px] text-muted-foreground">Navigation sidebar background</p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={theme.customColors.sidebar}
                  onChange={(e) => setTheme(prev => ({
                    ...prev,
                    customColors: { ...prev.customColors, sidebar: e.target.value },
                  }))}
                  className="w-10 h-8 rounded border cursor-pointer"
                />
                <Input
                  value={theme.customColors.sidebar}
                  onChange={(e) => setTheme(prev => ({
                    ...prev,
                    customColors: { ...prev.customColors, sidebar: e.target.value },
                  }))}
                  className="h-8 text-xs font-mono w-24"
                  placeholder="#000000"
                />
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div className="pl-3">
            <Label className="text-xs mb-2 block">Preview</Label>
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-24 h-7 rounded-md flex items-center justify-center text-[10px] font-medium text-white"
                    style={{ backgroundColor: theme.customColors.primary }}>
                    Primary
                  </div>
                  <div className="w-24 h-7 rounded-md flex items-center justify-center text-[10px] font-medium text-white"
                    style={{ backgroundColor: theme.customColors.accent }}>
                    Accent
                  </div>
                  <div className="w-24 h-7 rounded-md flex items-center justify-center text-[10px] font-medium text-white"
                    style={{ backgroundColor: theme.customColors.sidebar }}>
                    Sidebar
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3 pt-4">
        <Button
          size="lg"
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="w-full gap-2 font-medium bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Save className="h-4 w-4" /> Save Theme
        </Button>
        <Button variant="outline" size="sm" onClick={handleReset} className="w-full gap-1.5 text-xs">
          <RotateCcw className="h-3 w-3" /> Reset to Default
        </Button>
      </div>

      {/* Info badge */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs">
        <Badge variant="outline" className="shrink-0 text-[10px] border-blue-300">Note</Badge>
        <span>
          Changes apply to all users on their next page load. Both the Client Portal and Trade Portal will inherit this theme automatically.
        </span>
      </div>
    </div>
  );
}
