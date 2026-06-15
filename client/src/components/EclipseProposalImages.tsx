/**
 * EclipseProposalImages — Admin component for managing Eclipse proposal/appendix images.
 * Uses the existing productImages infrastructure with category "Eclipse Proposal".
 * Supports: upload, reorder, toggle enabled, edit label/caption, delete, reset to defaults.
 */
import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ChevronUp, ChevronDown, Plus, Trash2, Pencil, RotateCcw, Image as ImageIcon } from "lucide-react";

const ECLIPSE_CATEGORY = "Eclipse Proposal";

// Default diagrams (from standalone app) — used for seeding and reset
const DEFAULT_DIAGRAMS = [
  {
    code: "pergola-details",
    name: "Pergola Details (Open & Closed)",
    description: "Fig 1: Eclipse Opening Roof — Open & Closed Positions with Section Details",
    imageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663452203922/mg62hRDmECX7DuJwEdrsV4/pergola-details_41ecd617.png",
  },
  {
    code: "louvre-section",
    name: "Louvre Blade Cross-Section",
    description: "Fig 2: Extruded Aluminium Louvre Blade — Cross-Section Profile & Weight Specification",
    imageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663452203922/mg62hRDmECX7DuJwEdrsV4/louvre-section_ab5fc6bd.png",
  },
  {
    code: "gutter-layout",
    name: "General Layout of Louvres & Gutter (HV0011)",
    description: "Fig 3: General Layout of Louvres & Gutter — Isometric Assembly View (HV0011 Rev B)",
    imageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663452203922/mg62hRDmECX7DuJwEdrsV4/hv0011-louvre-gutter-layout_d27ba173.png",
  },
  {
    code: "louvre-position",
    name: "Louvre Positions (HV0014)",
    description: "Fig 4: Louvre Blade Positions — Fully Closed, Vertical & Fully Rotated (HV0014 Rev B)",
    imageUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663452203922/mg62hRDmECX7DuJwEdrsV4/hv0014-louvre-position_29091437.png",
  },
];

interface ProposalImage {
  id: number;
  code: string;
  name: string;
  description: string | null;
  imageUrl: string;
  sortOrder: number | null;
  tags: string[] | null;
}

export default function EclipseProposalImages() {
  const utils = trpc.useUtils();
  const { data: images = [], isLoading } = trpc.planConverter.listProductImages.useQuery({ category: ECLIPSE_CATEGORY });
  const createMutation = trpc.planConverter.createProductImage.useMutation({
    onSuccess: () => utils.planConverter.listProductImages.invalidate(),
  });
  const updateMutation = trpc.planConverter.updateProductImage.useMutation({
    onSuccess: () => utils.planConverter.listProductImages.invalidate(),
  });
  const deleteMutation = trpc.planConverter.deleteProductImage.useMutation({
    onSuccess: () => utils.planConverter.listProductImages.invalidate(),
  });
  const reorderMutation = trpc.planConverter.reorderProductImages.useMutation({
    onSuccess: () => utils.planConverter.listProductImages.invalidate(),
  });

  const [editItem, setEditItem] = useState<ProposalImage | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedImages = [...(images as ProposalImage[])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  // Check if image is "enabled" via tags
  const isEnabled = (img: ProposalImage) => !img.tags?.includes("disabled");

  const toggleEnabled = async (img: ProposalImage) => {
    const currentTags = img.tags || [];
    const newTags = isEnabled(img)
      ? [...currentTags, "disabled"]
      : currentTags.filter(t => t !== "disabled");
    await updateMutation.mutateAsync({ id: img.id, tags: newTags });
  };

  const moveUp = async (idx: number) => {
    if (idx === 0) return;
    const newOrder = [...sortedImages];
    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    await reorderMutation.mutateAsync({ ids: newOrder.map(i => i.id) });
  };

  const moveDown = async (idx: number) => {
    if (idx === sortedImages.length - 1) return;
    const newOrder = [...sortedImages];
    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    await reorderMutation.mutateAsync({ ids: newOrder.map(i => i.id) });
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this diagram?")) return;
    await deleteMutation.mutateAsync({ id });
    toast.success("Diagram removed.");
  };

  const handleUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5MB)");
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      await createMutation.mutateAsync({
        category: ECLIPSE_CATEGORY,
        code: `custom-${Date.now()}`,
        name: file.name.replace(/\.[^.]+$/, ""),
        description: `Custom Diagram: ${file.name.replace(/\.[^.]+$/, "")}`,
        imageBase64: base64,
        fileName: file.name,
        mimeType: file.type,
        tags: [],
        sortOrder: sortedImages.length,
      });
      toast.success("Custom diagram added.");
    };
    reader.readAsDataURL(file);
  };

  const handleReset = async () => {
    if (!confirm("Reset to default Eclipse diagrams? This will remove all custom diagrams and restore the 4 standard diagrams.")) return;
    // Delete all existing
    for (const img of sortedImages) {
      await deleteMutation.mutateAsync({ id: img.id });
    }
    // Re-create defaults with directImageUrl (CDN-hosted, no base64 upload needed)
    for (let i = 0; i < DEFAULT_DIAGRAMS.length; i++) {
      const d = DEFAULT_DIAGRAMS[i];
      await createMutation.mutateAsync({
        category: ECLIPSE_CATEGORY,
        code: d.code,
        name: d.name,
        description: d.description,
        imageBase64: "",
        fileName: `${d.code}.png`,
        mimeType: "image/png",
        tags: [],
        sortOrder: i,
        directImageUrl: d.imageUrl,
      });
    }
    toast.success("Diagrams reset to defaults.");
  };

  const handleEditSave = async () => {
    if (!editItem) return;
    await updateMutation.mutateAsync({
      id: editItem.id,
      name: editName,
      description: editDescription,
    });
    setEditItem(null);
    toast.success("Diagram updated.");
  };

  // Seed defaults if no images exist yet
  const handleSeedDefaults = async () => {
    for (let i = 0; i < DEFAULT_DIAGRAMS.length; i++) {
      const d = DEFAULT_DIAGRAMS[i];
      await createMutation.mutateAsync({
        category: ECLIPSE_CATEGORY,
        code: d.code,
        name: d.name,
        description: d.description,
        imageBase64: "",
        fileName: `${d.code}.png`,
        mimeType: "image/png",
        tags: [],
        sortOrder: i,
        directImageUrl: d.imageUrl,
      });
    }
    toast.success("Default Eclipse diagrams seeded.");
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Proposal Diagrams</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">Loading...</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ImageIcon className="w-4 h-4" />
          Proposal Diagrams
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Toggle which diagrams appear in the Eclipse Quote PDF technical appendix, reorder, or upload custom diagrams.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedImages.length === 0 ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-muted-foreground">No proposal diagrams configured.</p>
            <Button variant="outline" size="sm" onClick={handleSeedDefaults}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Seed Default Diagrams
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {sortedImages.map((img, idx) => (
                <div key={img.id} className="flex items-center gap-3 p-2 rounded-md border border-border/40 bg-secondary/20">
                  {/* Reorder buttons */}
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      disabled={idx === 0}
                      className="p-0.5 rounded hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                      onClick={() => moveUp(idx)}
                      title="Move up"
                    >
                      <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === sortedImages.length - 1}
                      className="p-0.5 rounded hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                      onClick={() => moveDown(idx)}
                      title="Move down"
                    >
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>

                  {/* Enable/Disable toggle */}
                  <Switch
                    checked={isEnabled(img)}
                    onCheckedChange={() => toggleEnabled(img)}
                    className="scale-75"
                  />

                  {/* Thumbnail */}
                  <div className="w-10 h-10 rounded border border-border/40 overflow-hidden flex-shrink-0 bg-white">
                    <img
                      src={img.imageUrl}
                      alt={img.name}
                      className="w-full h-full object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>

                  {/* Label + caption */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${!isEnabled(img) ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {img.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{img.description || ""}</p>
                  </div>

                  {/* Edit button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditItem(img);
                      setEditName(img.name);
                      setEditDescription(img.description || "");
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>

                  {/* Delete button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(img.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium border border-border/60 rounded-md cursor-pointer hover:bg-secondary/40 transition-colors">
                <Plus className="w-3.5 h-3.5" />
                Add Custom Diagram
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUpload(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <Button variant="outline" size="sm" className="text-xs" onClick={handleReset}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Reset to Defaults
              </Button>
            </div>
          </>
        )}

        {/* Edit dialog */}
        <Dialog open={!!editItem} onOpenChange={(open) => { if (!open) setEditItem(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Diagram</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-sm">Name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">Caption / Description</Label>
                <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
              <Button onClick={handleEditSave}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
