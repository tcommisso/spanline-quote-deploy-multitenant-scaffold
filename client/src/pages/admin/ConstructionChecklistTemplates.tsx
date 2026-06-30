import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ClipboardCheck, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_FINAL_INSPECTION_TEMPLATE_ITEMS,
  type ConstructionChecklistPriority,
  type ConstructionChecklistTemplateItem,
} from "@shared/construction-checklist-templates";

type DraftItem = ConstructionChecklistTemplateItem & {
  localId: string;
};

const PRIORITY_OPTIONS: Array<{ value: ConstructionChecklistPriority; label: string }> = [
  { value: "normal", label: "Normal" },
  { value: "important", label: "Important" },
  { value: "urgent", label: "Urgent" },
];

function makeDraftItem(item: ConstructionChecklistTemplateItem, index: number): DraftItem {
  return {
    ...item,
    sortOrder: index,
    localId: `${index}-${item.title}`,
  };
}

function makeDraftItems(items: ConstructionChecklistTemplateItem[]): DraftItem[] {
  return items.map(makeDraftItem);
}

function newDraftItem(sortOrder: number): DraftItem {
  return {
    localId: `new-${Date.now()}-${sortOrder}`,
    title: "",
    priority: "normal",
    isBlocking: false,
    visibleToTrade: false,
    sortOrder,
  };
}

function normalizeDraftItems(items: DraftItem[]): DraftItem[] {
  return items.map((item, index) => ({ ...item, sortOrder: index }));
}

export default function ConstructionChecklistTemplates() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.globalSettings.getConstructionChecklistTemplates.useQuery();
  const [items, setItems] = useState<DraftItem[]>([]);

  const saveMutation = trpc.globalSettings.setConstructionChecklistTemplates.useMutation({
    onSuccess: (saved) => {
      setItems(makeDraftItems(saved.finalInspection.items));
      utils.globalSettings.getConstructionChecklistTemplates.invalidate();
      toast.success("Construction checklist templates saved");
    },
    onError: (error) => toast.error(error.message || "Failed to save checklist templates"),
  });

  useEffect(() => {
    if (data?.finalInspection?.items) {
      setItems(makeDraftItems(data.finalInspection.items));
    }
  }, [data]);

  const activeCount = useMemo(() => items.filter((item) => item.title.trim()).length, [items]);

  const updateItem = (localId: string, changes: Partial<DraftItem>) => {
    setItems((current) => current.map((item) => item.localId === localId ? { ...item, ...changes } : item));
  };

  const addItem = () => {
    setItems((current) => [...current, newDraftItem(current.length)]);
  };

  const removeItem = (localId: string) => {
    setItems((current) => normalizeDraftItems(current.filter((item) => item.localId !== localId)));
  };

  const moveItem = (localId: string, direction: -1 | 1) => {
    setItems((current) => {
      const index = current.findIndex((item) => item.localId === localId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return normalizeDraftItems(next);
    });
  };

  const resetRecommendedDefaults = () => {
    setItems(makeDraftItems(DEFAULT_FINAL_INSPECTION_TEMPLATE_ITEMS));
  };

  const save = () => {
    const payloadItems = normalizeDraftItems(items)
      .map((item) => ({
        title: item.title.trim(),
        priority: item.priority,
        isBlocking: item.isBlocking,
        visibleToTrade: item.visibleToTrade,
        sortOrder: item.sortOrder,
      }))
      .filter((item) => item.title.length > 0);

    if (payloadItems.length === 0) {
      toast.error("Add at least one final inspection checklist item before saving.");
      return;
    }

    saveMutation.mutate({
      finalInspection: {
        items: payloadItems,
      },
    });
  };

  if (isLoading) {
    return (
      <div className="container max-w-5xl py-6">
        <div className="h-8 w-72 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-80 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="container max-w-5xl py-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <ClipboardCheck className="h-5 w-5" />
            Construction Checklist Templates
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage tenant default checklist rows loaded into construction job sections.
          </p>
        </div>
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          {activeCount} final inspection item{activeCount === 1 ? "" : "s"}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Final Inspection</CardTitle>
          <CardDescription>
            These rows are loaded when the construction team selects Load Default Checklist on a client job.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={item.localId} className="rounded-md border p-3">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,1fr)_150px_120px_130px_120px] lg:items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Checklist item</Label>
                    <Input
                      value={item.title}
                      onChange={(event) => updateItem(item.localId, { title: event.target.value })}
                      placeholder="Checklist item..."
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Priority</Label>
                    <Select
                      value={item.priority}
                      onValueChange={(priority) => updateItem(item.localId, { priority: priority as ConstructionChecklistPriority })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <Label className="text-xs">Blocking</Label>
                    <Switch checked={item.isBlocking} onCheckedChange={(checked) => updateItem(item.localId, { isBlocking: checked })} />
                  </div>
                  <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border px-3 py-2">
                    <Label className="text-xs">Trade visible</Label>
                    <Switch checked={item.visibleToTrade} onCheckedChange={(checked) => updateItem(item.localId, { visibleToTrade: checked })} />
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <Button type="button" variant="outline" size="icon" onClick={() => moveItem(item.localId, -1)} disabled={index === 0}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" onClick={() => moveItem(item.localId, 1)} disabled={index === items.length - 1}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" onClick={() => removeItem(item.localId)} disabled={items.length <= 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={addItem}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add item
              </Button>
              <Button type="button" variant="outline" onClick={resetRecommendedDefaults}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Reset recommended
              </Button>
            </div>
            <Button type="button" onClick={save} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
              Save template
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
