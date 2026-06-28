import { useEffect, useMemo, useState } from "react";
import { Clock, ListChecks, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  WORK_CHECKLIST_SECTIONS,
  WORK_CHECKLIST_UNITS,
  type WorkChecklistResponsibility,
} from "@shared/spec-checklist-defaults";

type ChecklistDefaultDraft = {
  id?: number;
  section: string;
  label: string;
  unit: string;
  responsibility: WorkChecklistResponsibility;
  productMatch: string;
  notes: string;
  sortOrder: number;
  isActive: boolean;
  isNew?: boolean;
};

const RESPONSIBILITY_OPTIONS: Array<{ value: WorkChecklistResponsibility; label: string }> = [
  { value: "", label: "No default" },
  { value: "By Builder", label: "Builder" },
  { value: "By Client", label: "Client" },
];

function newDraft(section: string, sortOrder: number): ChecklistDefaultDraft {
  return {
    section,
    label: "",
    unit: "ea",
    responsibility: "",
    productMatch: "",
    notes: "",
    sortOrder,
    isActive: true,
    isNew: true,
  };
}

export default function ChecklistDefaults() {
  const utils = trpc.useUtils();
  const [selectedSection, setSelectedSection] = useState<string>("all");
  const [rows, setRows] = useState<ChecklistDefaultDraft[]>([]);
  const { data = [], isLoading } = trpc.checklistDefaults.listAll.useQuery();

  const createMutation = trpc.checklistDefaults.create.useMutation();
  const updateMutation = trpc.checklistDefaults.update.useMutation();
  const deleteMutation = trpc.checklistDefaults.delete.useMutation({
    onSuccess: () => {
      toast.success("Checklist default deleted");
      utils.checklistDefaults.listAll.invalidate();
      utils.checklistDefaults.listActive.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const seedMutation = trpc.checklistDefaults.seedBuiltIns.useMutation({
    onSuccess: (result) => {
      toast.success(result.inserted > 0 ? `Seeded ${result.inserted} default item${result.inserted === 1 ? "" : "s"}` : "Defaults already exist");
      utils.checklistDefaults.listAll.invalidate();
      utils.checklistDefaults.listActive.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    setRows(data.map((row) => ({
      id: row.id,
      section: row.section,
      label: row.label,
      unit: row.unit || "ea",
      responsibility: (row.responsibility || "") as WorkChecklistResponsibility,
      productMatch: row.productMatch || "",
      notes: row.notes || "",
      sortOrder: row.sortOrder ?? 0,
      isActive: !!row.isActive,
    })));
  }, [data]);

  const visibleRows = useMemo(() => {
    return rows
      .filter((row) => selectedSection === "all" || row.section === selectedSection)
      .sort((a, b) => a.section.localeCompare(b.section) || a.sortOrder - b.sortOrder || (a.id ?? 0) - (b.id ?? 0));
  }, [rows, selectedSection]);

  const lastUpdated = useMemo(() => {
    return data.reduce((latest, row) => {
      const timestamp = new Date(row.updatedAt).getTime();
      return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest;
    }, 0);
  }, [data]);

  const updateRow = (rowKey: string, changes: Partial<ChecklistDefaultDraft>) => {
    setRows((current) => current.map((row, index) => {
      const key = row.id ? `id-${row.id}` : `new-${index}`;
      return key === rowKey ? { ...row, ...changes } : row;
    }));
  };

  const addRow = () => {
    const section = selectedSection === "all" ? WORK_CHECKLIST_SECTIONS[0].id : selectedSection;
    const nextOrder = rows.filter((row) => row.section === section).length;
    setRows((current) => [...current, newDraft(section, nextOrder)]);
  };

  const removeRow = (row: ChecklistDefaultDraft, rowIndex: number) => {
    if (!row.id) {
      setRows((current) => current.filter((_, index) => index !== rowIndex));
      return;
    }
    deleteMutation.mutate({ id: row.id });
  };

  const saveAll = async () => {
    const invalid = rows.find((row) => !row.section || !row.label.trim());
    if (invalid) {
      toast.error("Every checklist default needs a section and label before saving.");
      return;
    }

    try {
      const savePayload = rows.map((row, index) => ({
        ...row,
        sortOrder: Number.isFinite(row.sortOrder) ? row.sortOrder : index,
        label: row.label.trim(),
        productMatch: row.productMatch.trim(),
        notes: row.notes.trim(),
      }));

      await Promise.all(savePayload.map((row) => {
        const data = {
          section: row.section,
          label: row.label,
          unit: row.unit as any,
          responsibility: row.responsibility,
          productMatch: row.productMatch,
          notes: row.notes,
          sortOrder: row.sortOrder,
          isActive: row.isActive,
        };
        return row.id
          ? updateMutation.mutateAsync({ id: row.id, data })
          : createMutation.mutateAsync(data);
      }));

      toast.success("Checklist defaults saved");
      await Promise.all([
        utils.checklistDefaults.listAll.invalidate(),
        utils.checklistDefaults.listActive.invalidate(),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save checklist defaults");
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Checklist Defaults</h1>
          <p className="text-sm text-muted-foreground">
            Manage tenant default rows loaded into spec sheet work checklists.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lastUpdated > 0 && (
            <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Last updated: {new Date(lastUpdated).toLocaleString()}</span>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => seedMutation.mutate({ section: selectedSection === "all" ? undefined : selectedSection })}
            disabled={seedMutation.isPending}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Seed Missing Defaults
          </Button>
          <Button size="sm" className="gap-1.5" onClick={saveAll} disabled={isSaving}>
            <Save className="h-3.5 w-3.5" /> Save Defaults
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <ListChecks className="h-4 w-4" /> Spec Sheet Work Checklist Rows
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Product Match is optional. Leave it blank to match by the default description.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-[220px]">
                <Label className="sr-only">Section</Label>
                <Select value={selectedSection} onValueChange={setSelectedSection}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sections</SelectItem>
                    {WORK_CHECKLIST_SECTIONS.map((section) => (
                      <SelectItem key={section.id} value={section.id}>{section.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={addRow}>
                <Plus className="h-3.5 w-3.5" /> Add Row
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading checklist defaults...</p>
          ) : visibleRows.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm font-medium">No checklist defaults yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Seed the built-in defaults, then edit them for this tenant.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="w-44 py-2 pr-2 font-medium">Section</th>
                    <th className="min-w-64 py-2 pr-2 font-medium">Default Item</th>
                    <th className="w-24 py-2 pr-2 font-medium">Unit</th>
                    <th className="w-36 py-2 pr-2 font-medium">Responsibility</th>
                    <th className="w-56 py-2 pr-2 font-medium">Product Match</th>
                    <th className="w-56 py-2 pr-2 font-medium">Notes</th>
                    <th className="w-20 py-2 pr-2 text-right font-medium">Order</th>
                    <th className="w-20 py-2 pr-2 font-medium">Active</th>
                    <th className="w-8 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const rowIndex = rows.indexOf(row);
                    const rowKey = row.id ? `id-${row.id}` : `new-${rowIndex}`;
                    return (
                      <tr key={rowKey} className="border-b border-border/40">
                        <td className="py-1 pr-2">
                          <Select value={row.section} onValueChange={(value) => updateRow(rowKey, { section: value })}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {WORK_CHECKLIST_SECTIONS.map((section) => (
                                <SelectItem key={section.id} value={section.id}>{section.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-1 pr-2">
                          <Input className="h-8 text-xs" value={row.label} onChange={(event) => updateRow(rowKey, { label: event.target.value })} />
                        </td>
                        <td className="py-1 pr-2">
                          <Select value={row.unit || "ea"} onValueChange={(value) => updateRow(rowKey, { unit: value })}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {WORK_CHECKLIST_UNITS.map((unit) => (
                                <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-1 pr-2">
                          <Select value={row.responsibility || "__none__"} onValueChange={(value) => updateRow(rowKey, { responsibility: value === "__none__" ? "" : value as WorkChecklistResponsibility })}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RESPONSIBILITY_OPTIONS.map((option) => (
                                <SelectItem key={option.value || "__none__"} value={option.value || "__none__"}>{option.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-1 pr-2">
                          <Input className="h-8 text-xs" value={row.productMatch} onChange={(event) => updateRow(rowKey, { productMatch: event.target.value })} placeholder="Optional override" />
                        </td>
                        <td className="py-1 pr-2">
                          <Input className="h-8 text-xs" value={row.notes} onChange={(event) => updateRow(rowKey, { notes: event.target.value })} placeholder="Optional notes" />
                        </td>
                        <td className="py-1 pr-2">
                          <Input className="h-8 text-right text-xs" type="number" value={row.sortOrder} onChange={(event) => updateRow(rowKey, { sortOrder: Number.parseInt(event.target.value, 10) || 0 })} />
                        </td>
                        <td className="py-1 pr-2">
                          <Switch checked={row.isActive} onCheckedChange={(checked) => updateRow(rowKey, { isActive: checked })} />
                        </td>
                        <td className="py-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeRow(row, rowIndex)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
