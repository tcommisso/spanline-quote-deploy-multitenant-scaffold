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
import { Textarea } from "@/components/ui/textarea";
import {
  CONSTRUCTION_CHECKLIST_HELP_TEXT_MAX_LENGTH,
  DEFAULT_FINAL_INSPECTION_TEMPLATE_ITEMS,
  isConstructionChecklistDisplayResponseType,
  type ConstructionChecklistPriority,
  type ConstructionChecklistResponseType,
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

const RESPONSE_TYPE_OPTIONS: Array<{ value: ConstructionChecklistResponseType; label: string }> = [
  { value: "section_header", label: "Section header" },
  { value: "divider", label: "Divider line" },
  { value: "check", label: "Checklist tick" },
  { value: "yes_no", label: "Yes / No" },
  { value: "dropdown", label: "Dropdown" },
  { value: "multi_select", label: "Multi-select" },
  { value: "short_text", label: "Short text" },
  { value: "long_text", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "performance_matrix", label: "Performance matrix" },
  { value: "signature", label: "Signature" },
  { value: "image_upload", label: "Image upload" },
  { value: "file_upload", label: "File upload" },
  { value: "client_lookup", label: "Client / job lookup" },
  { value: "trade_user_lookup", label: "Trade portal user lookup" },
  { value: "user_lookup", label: "System user lookup" },
];

const RESPONSE_TYPES_WITH_OPTIONS = new Set<ConstructionChecklistResponseType>(["dropdown", "multi_select", "performance_matrix"]);
const DEFAULT_PERFORMANCE_MATRIX_ROWS = ["Quality of work", "Timeliness", "Communication", "Site cleanliness", "Safety / WH&S"];
const CLIENT_LOOKUP_OPTIONS = [
  { value: "client_name", label: "Client canonical name" },
  { value: "site_address", label: "Site / delivery address" },
  { value: "account_number", label: "Client account number" },
];
const NO_SEND_TO_USER = "__none__";

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

function newDraftItem(sortOrder: number, responseType: ConstructionChecklistResponseType = "check"): DraftItem {
  return {
    localId: `new-${Date.now()}-${sortOrder}`,
    title: responseType === "section_header" ? "New section" : responseType === "divider" ? "Divider" : "",
    priority: "normal",
    isBlocking: false,
    visibleToTrade: false,
    responseType,
    responseOptions: [],
    responseRequired: false,
    visibleToClient: false,
    sendToUserId: null,
    responseHelpText: null,
    sortOrder,
  };
}

function normalizeDraftItems(items: DraftItem[]): DraftItem[] {
  return items.map((item, index) => ({ ...item, sortOrder: index }));
}

function isDisplayOnlyItem(item: Pick<ConstructionChecklistTemplateItem, "responseType">) {
  return isConstructionChecklistDisplayResponseType(item.responseType);
}

function titleForSave(item: DraftItem) {
  const title = item.title.trim();
  return item.responseType === "divider" ? title || "Divider" : title;
}

function optionsText(options: string[] = []) {
  return options.join("\n");
}

function parseOptionsText(value: string) {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const rawOption of value.split(/\r?\n|,/)) {
    const option = rawOption.trim();
    const key = option.toLowerCase();
    if (!option || seen.has(key)) continue;
    seen.add(key);
    options.push(option.slice(0, 120));
    if (options.length >= 30) break;
  }
  return options;
}

export default function ConstructionChecklistTemplates() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.globalSettings.getConstructionChecklistTemplates.useQuery();
  const usersQuery = trpc.constructionClients.assignableUsers.useQuery();
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

  const activeCount = useMemo(() => items.filter((item) => titleForSave(item)).length, [items]);
  const sendToUsers = useMemo(() => {
    return [...(usersQuery.data || [])].sort((a: any, b: any) =>
      String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""))
    );
  }, [usersQuery.data]);

  const updateItem = (localId: string, changes: Partial<DraftItem>) => {
    setItems((current) => current.map((item) => item.localId === localId ? { ...item, ...changes } : item));
  };

  const addItem = (responseType: ConstructionChecklistResponseType = "check") => {
    setItems((current) => [...current, newDraftItem(current.length, responseType)]);
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
      .map((item) => {
        const responseType = item.responseType || "check";
        const isDisplayOnly = isConstructionChecklistDisplayResponseType(responseType);
        return {
          title: titleForSave(item),
          priority: item.priority,
          isBlocking: isDisplayOnly ? false : item.isBlocking,
          visibleToTrade: item.visibleToTrade,
          visibleToClient: item.visibleToClient,
          sendToUserId: isDisplayOnly ? null : item.sendToUserId ?? null,
          responseType,
          responseOptions: isDisplayOnly ? [] : responseType === "client_lookup"
            ? [item.responseOptions?.[0] || "client_name"]
            : RESPONSE_TYPES_WITH_OPTIONS.has(responseType) ? item.responseOptions : [],
          responseRequired: isDisplayOnly ? false : Boolean(item.responseRequired),
          responseHelpText: responseType === "divider"
            ? null
            : item.responseHelpText?.trim().slice(0, CONSTRUCTION_CHECKLIST_HELP_TEXT_MAX_LENGTH) || null,
          sortOrder: item.sortOrder,
        };
      })
      .filter((item) => item.title.length > 0);

    if (payloadItems.length === 0) {
      toast.error("Add at least one final inspection checklist item before saving.");
      return;
    }
    const itemMissingOptions = payloadItems.find((item) => RESPONSE_TYPES_WITH_OPTIONS.has(item.responseType) && item.responseOptions.length === 0);
    if (itemMissingOptions) {
      toast.error(`Add at least one option for "${itemMissingOptions.title}".`);
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
              <div key={item.localId} className={`rounded-md border p-3 ${item.responseType === "section_header" ? "bg-muted/30" : item.responseType === "divider" ? "bg-background" : ""}`}>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(260px,1fr)_180px_150px] lg:items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">{item.responseType === "section_header" ? "Section header" : item.responseType === "divider" ? "Divider label" : "Checklist item"}</Label>
                    <Input
                      value={item.title}
                      onChange={(event) => updateItem(item.localId, { title: event.target.value })}
                      placeholder={item.responseType === "section_header" ? "e.g. Site completion" : item.responseType === "divider" ? "Divider" : "Checklist item..."}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Question type</Label>
                    <Select
                      value={item.responseType || "check"}
                      onValueChange={(responseType) => {
                        const nextType = responseType as ConstructionChecklistResponseType;
                        const isDisplayOnly = isConstructionChecklistDisplayResponseType(nextType);
                        updateItem(item.localId, {
                          responseType: nextType,
                          title: nextType === "divider" && !item.title.trim() ? "Divider" : item.title,
                          isBlocking: isDisplayOnly ? false : item.isBlocking,
                          responseRequired: isDisplayOnly ? false : item.responseRequired,
                          sendToUserId: isDisplayOnly ? null : item.sendToUserId,
                          responseOptions: nextType === "client_lookup"
                            ? [item.responseOptions?.[0] || "client_name"]
                            : nextType === "performance_matrix"
                              ? item.responseOptions.length > 0 ? item.responseOptions : DEFAULT_PERFORMANCE_MATRIX_ROWS
                            : isDisplayOnly ? [] : RESPONSE_TYPES_WITH_OPTIONS.has(nextType) ? item.responseOptions : [],
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RESPONSE_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className={isDisplayOnlyItem(item) ? "hidden" : "space-y-1"}>
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
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    {!isDisplayOnlyItem(item) && (
                      <>
                        <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border px-3 py-2">
                          <Label className="text-xs">Required</Label>
                          <Switch checked={item.responseRequired} onCheckedChange={(checked) => updateItem(item.localId, { responseRequired: checked })} />
                        </div>
                        <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border px-3 py-2">
                          <Label className="text-xs">Blocking</Label>
                          <Switch checked={item.isBlocking} onCheckedChange={(checked) => updateItem(item.localId, { isBlocking: checked })} />
                        </div>
                      </>
                    )}
                    <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border px-3 py-2">
                      <Label className="text-xs">Trade visible</Label>
                      <Switch checked={item.visibleToTrade} onCheckedChange={(checked) => updateItem(item.localId, { visibleToTrade: checked })} />
                    </div>
                    <div className="flex min-h-10 items-center justify-between gap-3 rounded-md border px-3 py-2">
                      <Label className="text-xs">Client visible</Label>
                      <Switch checked={item.visibleToClient} onCheckedChange={(checked) => updateItem(item.localId, { visibleToClient: checked })} />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1 sm:ml-auto">
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
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {!isDisplayOnlyItem(item) && item.responseType === "client_lookup" && (
                    <div className="space-y-1">
                      <Label className="text-xs">Client lookup value</Label>
                      <Select
                        value={item.responseOptions?.[0] || "client_name"}
                        onValueChange={(value) => updateItem(item.localId, { responseOptions: [value] })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CLIENT_LOOKUP_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {!isDisplayOnlyItem(item) && (
                  <div className="space-y-1">
                    <Label className="text-xs">Send to</Label>
                    <Select
                      value={item.sendToUserId ? String(item.sendToUserId) : NO_SEND_TO_USER}
                      onValueChange={(value) => updateItem(item.localId, {
                        sendToUserId: value === NO_SEND_TO_USER ? null : Number(value),
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No default recipient" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_SEND_TO_USER}>No default recipient</SelectItem>
                        {sendToUsers.map((user: any) => (
                          <SelectItem key={user.id} value={String(user.id)}>
                            {user.name || user.email || `User #${user.id}`}{user.role ? ` (${String(user.role).replace(/_/g, " ")})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  )}
                  {!isDisplayOnlyItem(item) && RESPONSE_TYPES_WITH_OPTIONS.has(item.responseType) && (
                    <div className="space-y-1">
                      <Label className="text-xs">{item.responseType === "performance_matrix" ? "Matrix criteria" : "Options"}</Label>
                      <Textarea
                        value={optionsText(item.responseOptions)}
                        onChange={(event) => updateItem(item.localId, { responseOptions: parseOptionsText(event.target.value) })}
                        placeholder={item.responseType === "performance_matrix" ? "One performance criterion per line..." : "One option per line..."}
                        rows={3}
                      />
                      {item.responseType === "performance_matrix" && (
                        <p className="text-[11px] text-muted-foreground">Each criterion is rated 1-5 or N/A on the job checklist.</p>
                      )}
                    </div>
                  )}
                  {item.responseType !== "divider" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Help text</Label>
                    <Textarea
                      value={item.responseHelpText || ""}
                      onChange={(event) => updateItem(item.localId, { responseHelpText: event.target.value })}
                      placeholder="Optional guidance shown on the job checklist..."
                      rows={3}
                    />
                  </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => addItem()}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add item
              </Button>
              <Button type="button" variant="outline" onClick={() => addItem("section_header")}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add section
              </Button>
              <Button type="button" variant="outline" onClick={() => addItem("divider")}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add divider
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
