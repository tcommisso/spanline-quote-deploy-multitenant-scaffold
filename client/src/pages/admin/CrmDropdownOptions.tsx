import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, GripVertical, ArrowUp, ArrowDown } from "lucide-react";

const CATEGORY_LABELS: Record<string, string> = {
  lead_status: "Lead Status",
  product_type: "Product Type",
  lead_source: "Lead Source",
  outcome: "Outcome",
  appointment: "Appointment Type",
  building_authority: "Approvals Status",
  council_letter_type: "Council Letter Type",
};

export default function CrmDropdownOptions() {
  const [selectedCategory, setSelectedCategory] = useState("lead_status");
  const [editingItem, setEditingItem] = useState<{ id: number; value: string; label: string; sortOrder: number; active: boolean } | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const utils = trpc.useUtils();
  const { data: options, isLoading } = trpc.crmDropdowns.list.useQuery({ category: selectedCategory, activeOnly: false });
  const { data: categories } = trpc.crmDropdowns.categories.useQuery();
  const optionRows = useMemo(() => Array.isArray(options) ? options : [], [options]);
  const categoryRows = useMemo(() => Array.isArray(categories) ? categories : [], [categories]);

  const createMut = trpc.crmDropdowns.create.useMutation({
    onSuccess: () => {
      utils.crmDropdowns.list.invalidate();
      toast.success("Option added");
      setShowAddDialog(false);
      setNewValue("");
      setNewLabel("");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMut = trpc.crmDropdowns.update.useMutation({
    onSuccess: () => {
      utils.crmDropdowns.list.invalidate();
      toast.success("Option updated");
      setEditingItem(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMut = trpc.crmDropdowns.delete.useMutation({
    onSuccess: () => {
      utils.crmDropdowns.list.invalidate();
      toast.success("Option deleted");
    },
    onError: (err) => toast.error(err.message),
  });

  const reorderMut = trpc.crmDropdowns.reorder.useMutation({
    onSuccess: () => {
      utils.crmDropdowns.list.invalidate();
    },
  });

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const items = [...optionRows];
    const temp = items[index - 1];
    items[index - 1] = items[index];
    items[index] = temp;
    reorderMut.mutate({
      items: items.map((item, i) => ({ id: item.id, sortOrder: i + 1 })),
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === optionRows.length - 1) return;
    const items = [...optionRows];
    const temp = items[index + 1];
    items[index + 1] = items[index];
    items[index] = temp;
    reorderMut.mutate({
      items: items.map((item, i) => ({ id: item.id, sortOrder: i + 1 })),
    });
  };

  const handleAdd = () => {
    if (!newValue.trim() || !newLabel.trim()) {
      toast.error("Both value and label are required");
      return;
    }
    const maxSort = optionRows.reduce((max, o) => Math.max(max, o.sortOrder), 0);
    createMut.mutate({
      category: selectedCategory,
      value: newValue.trim(),
      label: newLabel.trim(),
      sortOrder: maxSort + 1,
    });
  };

  const handleSaveEdit = () => {
    if (!editingItem) return;
    updateMut.mutate({
      id: editingItem.id,
      value: editingItem.value,
      label: editingItem.label,
      active: editingItem.active,
    });
  };

  const allCategories = categoryRows.length > 0 ? categoryRows : Object.keys(CATEGORY_LABELS);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">CRM Dropdown Options</h2>
          <p className="text-sm text-muted-foreground">Manage the dropdown choices used in leads and CRM forms.</p>
        </div>
        <Button size="sm" onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Option
        </Button>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 flex-wrap">
        {allCategories.map((cat) => (
          <Button
            key={cat}
            variant={selectedCategory === cat ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(cat)}
          >
            {CATEGORY_LABELS[cat] || cat}
          </Button>
        ))}
      </div>

      {/* Options List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {CATEGORY_LABELS[selectedCategory] || selectedCategory} Options
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : optionRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No options defined for this category.</p>
          ) : (
            <div className="space-y-1">
              {optionRows.map((opt, idx) => (
                <div
                  key={opt.id}
                  className={`flex items-center gap-2 p-2 rounded border ${!opt.active ? "opacity-50 bg-muted" : "bg-background"}`}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{opt.label}</span>
                    {opt.value !== opt.label && (
                      <span className="text-xs text-muted-foreground ml-2">({opt.value})</span>
                    )}
                  </div>
                  {!opt.active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveUp(idx)} disabled={idx === 0}>
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMoveDown(idx)} disabled={idx === optionRows.length - 1}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingItem({ id: opt.id, value: opt.value, label: opt.label, sortOrder: opt.sortOrder, active: opt.active })}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => {
                      if (confirm(`Delete "${opt.label}"? This cannot be undone.`)) {
                        deleteMut.mutate({ id: opt.id });
                      }
                    }}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Dropdown Option</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {allCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>{CATEGORY_LABELS[cat] || cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Value (stored in database)</Label>
              <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="e.g. follow_up" />
            </div>
            <div>
              <Label>Label (displayed to users)</Label>
              <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Follow Up" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={createMut.isPending}>
              {createMut.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => { if (!open) setEditingItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Option</DialogTitle>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-4 py-2">
              <div>
                <Label>Value</Label>
                <Input value={editingItem.value} onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })} />
              </div>
              <div>
                <Label>Label</Label>
                <Input value={editingItem.label} onChange={(e) => setEditingItem({ ...editingItem, label: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editingItem.active} onCheckedChange={(checked) => setEditingItem({ ...editingItem, active: checked })} />
                <Label>Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={updateMut.isPending}>
              {updateMut.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
