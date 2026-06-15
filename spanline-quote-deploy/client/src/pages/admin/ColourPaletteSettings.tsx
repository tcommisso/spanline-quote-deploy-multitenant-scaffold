import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Palette, Info } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

const COLOUR_SECTIONS = [
  { key: "brackets", label: "Brackets & Pop-ups" },
  { key: "posts", label: "Posts" },
  { key: "gutter", label: "Gutter & Downpipe" },
  { key: "walls", label: "Walls" },
  { key: "beams", label: "Beams, Channels & Flashings" },
  { key: "roof", label: "Roof" },
  { key: "windows", label: "Windows, Doors & Finishes" },
];

export default function ColourPaletteSettings() {
  const { data: paletteConfig, isLoading } = trpc.globalSettings.getColourPalette.useQuery();
  const { data: colourGroups } = trpc.colourGroups.getAll.useQuery();
  const utils = trpc.useUtils();

  const saveMutation = trpc.globalSettings.setColourPalette.useMutation({
    onSuccess: () => {
      toast.success("Colour palette settings saved");
      utils.globalSettings.getColourPalette.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [defaultGroup, setDefaultGroup] = useState("");
  const [sectionOverrides, setSectionOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    if (paletteConfig) {
      setDefaultGroup(paletteConfig.defaultGroup || "");
      setSectionOverrides(paletteConfig.sectionOverrides || {});
    }
  }, [paletteConfig]);

  const handleSave = () => {
    saveMutation.mutate({ defaultGroup, sectionOverrides });
  };

  const toggleGroupForSection = (sectionKey: string, groupName: string) => {
    const current = sectionOverrides[sectionKey] || "";
    const groups = current.split(",").map(s => s.trim()).filter(Boolean);
    const idx = groups.indexOf(groupName);
    if (idx >= 0) {
      groups.splice(idx, 1);
    } else {
      groups.push(groupName);
    }
    setSectionOverrides(prev => ({
      ...prev,
      [sectionKey]: groups.join(","),
    }));
  };

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading colour palette settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Colour Palette Settings
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure the default colour groups used across all Spec Sheets. Individual quotes can override these settings.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saveMutation.isPending}>
          <Save className="w-4 h-4 mr-2" />
          Save Settings
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default Colour Group</CardTitle>
          <CardDescription>
            The fallback colour group used for any section that doesn't have specific groups assigned below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select value={defaultGroup || "__none__"} onValueChange={(v) => setDefaultGroup(v === "__none__" ? "" : v)}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select default group..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— No default —</SelectItem>
              {colourGroups?.map(g => (
                <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-Section Colour Groups</CardTitle>
          <CardDescription>
            Assign one or more colour groups to each spec section. When multiple groups are assigned, all their colours appear in the dropdown with group name prefixes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {COLOUR_SECTIONS.map(section => {
            const currentGroups = (sectionOverrides[section.key] || "").split(",").map(s => s.trim()).filter(Boolean);
            return (
              <div key={section.key} className="space-y-2">
                <Label className="font-medium">{section.label}</Label>
                <div className="flex flex-wrap gap-2">
                  {colourGroups?.map(g => {
                    const isSelected = currentGroups.includes(g.name);
                    return (
                      <Badge
                        key={g.id}
                        variant={isSelected ? "default" : "outline"}
                        className={`cursor-pointer transition-colors ${isSelected ? "" : "hover:bg-accent"}`}
                        onClick={() => toggleGroupForSection(section.key, g.name)}
                      >
                        {g.name}
                      </Badge>
                    );
                  })}
                </div>
                {currentGroups.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Selected: {currentGroups.join(", ")}
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="pt-4">
          <div className="flex gap-2 text-sm text-blue-700">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">How this works</p>
              <p className="mt-1">
                These settings define the <strong>global defaults</strong> for all new quotes. When a quote's Spec Sheet is opened, it will use these colour group assignments unless the quote has its own per-section overrides saved.
              </p>
              <p className="mt-1">
                Combination colours (e.g. "Monument / Thredbo White") are automatically rendered as split 50/50 circles showing both colours.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
