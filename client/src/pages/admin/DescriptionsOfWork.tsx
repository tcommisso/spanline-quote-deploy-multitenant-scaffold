import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Edit2, GripVertical, ChevronDown, ChevronRight, Copy } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

interface DowGroup {
  id?: number;
  key: string;
  value: string;
  sortOrder: number;
}

interface DowItem {
  id?: number;
  key: string;
  value: string;
  sortOrder: number;
  metadata: { groupKey: string } | null;
}

export default function DescriptionsOfWork() {
  const utils = trpc.useUtils();
  const { data: allMasterData } = trpc.masterData.getAll.useQuery();
  const masterDataRows = useMemo(() => Array.isArray(allMasterData) ? allMasterData : [], [allMasterData]);

  const upsertMutation = trpc.masterData.upsert.useMutation({
    onSuccess: () => {
      utils.masterData.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.masterData.delete.useMutation({
    onSuccess: () => {
      utils.masterData.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Parse groups and items from master data
  const groups = useMemo(() => {
    return masterDataRows
      .filter(d => d.category === "dow_group")
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map(d => ({ id: d.id, key: d.key, value: d.value, sortOrder: d.sortOrder ?? 0 }));
  }, [masterDataRows]);

  const items = useMemo(() => {
    return masterDataRows
      .filter(d => d.category === "dow_item")
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map(d => ({
        id: d.id,
        key: d.key,
        value: d.value,
        sortOrder: d.sortOrder ?? 0,
        metadata: d.metadata as { groupKey: string } | null,
      }));
  }, [masterDataRows]);

  const itemsByGroup = useMemo(() => {
    const map: Record<string, DowItem[]> = {};
    for (const g of groups) {
      map[g.key] = [];
    }
    for (const item of items) {
      const gk = item.metadata?.groupKey;
      if (gk && map[gk]) {
        map[gk].push(item);
      }
    }
    return map;
  }, [groups, items]);

  // State
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editGroup, setEditGroup] = useState<{ id?: number; key: string; name: string; sortOrder: number } | null>(null);
  const [editItem, setEditItem] = useState<{ id?: number; groupKey: string; description: string; sortOrder: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; type: "group" | "item"; label: string } | null>(null);

  const toggleExpand = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedGroups(new Set(groups.map(g => g.key)));
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  // Group CRUD
  const openAddGroup = () => {
    setEditGroup({ key: "", name: "", sortOrder: groups.length });
  };

  const openEditGroup = (g: DowGroup) => {
    setEditGroup({ id: g.id, key: g.key, name: g.value, sortOrder: g.sortOrder });
  };

  const saveGroup = () => {
    if (!editGroup || !editGroup.name.trim()) {
      toast.error("Group name is required");
      return;
    }
    const key = editGroup.key || editGroup.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
    upsertMutation.mutate({
      id: editGroup.id,
      category: "dow_group",
      key,
      value: editGroup.name.trim(),
      sortOrder: editGroup.sortOrder,
    }, {
      onSuccess: () => {
        toast.success(editGroup.id ? "Group updated" : "Group added");
        setEditGroup(null);
        // Auto-expand the new group
        setExpandedGroups(prev => { const next = new Set(prev); next.add(key); return next; });
      },
    });
  };

  // Item CRUD
  const openAddItem = (groupKey: string) => {
    const groupItems = itemsByGroup[groupKey] || [];
    setEditItem({ groupKey, description: "", sortOrder: groupItems.length });
  };

  const openEditItem = (item: DowItem) => {
    setEditItem({
      id: item.id,
      groupKey: item.metadata?.groupKey || "",
      description: item.value,
      sortOrder: item.sortOrder,
    });
  };

  const saveItem = () => {
    if (!editItem || !editItem.description.trim()) {
      toast.error("Description is required");
      return;
    }
    const key = editItem.id
      ? `dow_${editItem.id}`
      : `dow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    upsertMutation.mutate({
      id: editItem.id,
      category: "dow_item",
      key: editItem.id ? `dow_${editItem.id}` : key,
      value: editItem.description.trim(),
      sortOrder: editItem.sortOrder,
      metadata: { groupKey: editItem.groupKey },
    }, {
      onSuccess: () => {
        toast.success(editItem.id ? "Description updated" : "Description added");
        setEditItem(null);
      },
    });
  };

  // Duplicate Group
  const duplicateGroup = (group: DowGroup) => {
    const newKey = `${group.key}_copy_${Date.now()}`;
    const newName = `${group.value} (Copy)`;
    // First create the new group
    upsertMutation.mutate({
      category: "dow_group",
      key: newKey,
      value: newName,
      sortOrder: group.sortOrder + 1,
    }, {
      onSuccess: () => {
        // Then duplicate all items in the group
        const groupItems = itemsByGroup[group.key] || [];
        const promises = groupItems.map((item, idx) =>
          upsertMutation.mutateAsync({
            category: "dow_item",
            key: `dow_${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${idx}`,
            value: item.value,
            sortOrder: item.sortOrder,
            metadata: { groupKey: newKey },
          })
        );
        Promise.all(promises).then(() => {
          toast.success(`Duplicated "${group.value}" with ${groupItems.length} items`);
          utils.masterData.getAll.invalidate();
          setExpandedGroups(prev => { const next = new Set(prev); next.add(newKey); return next; });
        });
      },
    });
  };

  // Delete
  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "group") {
      // Delete all items in this group first
      const groupItems = items.filter(i => i.metadata?.groupKey === deleteTarget.label);
      const deletePromises = groupItems.map(item =>
        deleteMutation.mutateAsync({ id: item.id! })
      );
      Promise.all(deletePromises).then(() => {
        deleteMutation.mutate({ id: deleteTarget.id }, {
          onSuccess: () => {
            toast.success("Group and all its descriptions deleted");
            setDeleteTarget(null);
          },
        });
      });
    } else {
      deleteMutation.mutate({ id: deleteTarget.id }, {
        onSuccess: () => {
          toast.success("Description deleted");
          setDeleteTarget(null);
        },
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Descriptions of Work</h1>
          <p className="text-sm text-muted-foreground">
            Manage standard descriptions of work grouped by roof shape. These can be selected when building proposals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={expandAll} className="h-7 text-xs">
            Expand All
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAll} className="h-7 text-xs">
            Collapse All
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Roof Shape Groups
              <Badge variant="secondary" className="ml-2 text-[10px]">{groups.length}</Badge>
            </CardTitle>
            <Button variant="outline" size="sm" onClick={openAddGroup} className="h-7 text-xs gap-1.5">
              <Plus className="h-3 w-3" /> Add Group
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {groups.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No roof shape groups defined. Click "Add Group" to create one (e.g. Gable, Flat, Skillion, Hip).
            </p>
          ) : (
            groups.map(group => {
              const expanded = expandedGroups.has(group.key);
              const groupItems = itemsByGroup[group.key] || [];
              return (
                <div key={group.key} className="border rounded-lg overflow-hidden">
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors">
                    <button
                      onClick={() => toggleExpand(group.key)}
                      className="flex items-center gap-2 flex-1 text-left"
                    >
                      {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium">{group.value}</span>
                      <Badge variant="secondary" className="text-[10px] ml-1">
                        {groupItems.length} item{groupItems.length !== 1 ? "s" : ""}
                      </Badge>
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openAddItem(group.key)}
                      className="h-6 text-[11px] gap-1 px-2"
                    >
                      <Plus className="h-3 w-3" /> Add
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => duplicateGroup(group)}
                      className="h-6 w-6 p-0"
                      title="Duplicate group"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditGroup(group)}
                      className="h-6 w-6 p-0"
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget({ id: group.id!, type: "group", label: group.key })}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Group items */}
                  {expanded && (
                    <div className="divide-y">
                      {groupItems.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-3 px-4 text-center italic">
                          No descriptions yet. Click "Add" to create one.
                        </p>
                      ) : (
                        groupItems.map((item, idx) => (
                          <div
                            key={item.id || idx}
                            className="flex items-center gap-2 px-4 py-2 hover:bg-muted/20 group"
                          >
                            <GripVertical className="h-3 w-3 text-muted-foreground/40" />
                            <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                            <span className="flex-1 text-sm">{item.value}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditItem(item)}
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget({ id: item.id!, type: "item", label: item.value })}
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Edit/Add Group Dialog */}
      <Dialog open={!!editGroup} onOpenChange={(open) => !open && setEditGroup(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editGroup?.id ? "Edit Group" : "Add Roof Shape Group"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Group Name (Roof Shape)</label>
              <Input
                value={editGroup?.name || ""}
                onChange={(e) => setEditGroup(prev => prev ? { ...prev, name: e.target.value } : null)}
                placeholder="e.g. Gable, Flat, Skillion, Hip"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Sort Order</label>
              <Input
                type="number"
                value={editGroup?.sortOrder ?? 0}
                onChange={(e) => setEditGroup(prev => prev ? { ...prev, sortOrder: Number(e.target.value) } : null)}
                className="mt-1 w-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditGroup(null)}>Cancel</Button>
            <Button size="sm" onClick={saveGroup} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit/Add Item Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem?.id ? "Edit Description" : "Add Description of Work"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Roof Shape Group</label>
              <Select
                value={editItem?.groupKey || ""}
                onValueChange={(val) => setEditItem(prev => prev ? { ...prev, groupKey: val } : null)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select group" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map(g => (
                    <SelectItem key={g.key} value={g.key}>{g.value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <Textarea
                value={editItem?.description || ""}
                onChange={(e) => setEditItem(prev => prev ? { ...prev, description: e.target.value } : null)}
                placeholder="e.g. Supply and install Colorbond roof sheeting to gable roof structure"
                className="mt-1 min-h-[80px]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Sort Order</label>
              <Input
                type="number"
                value={editItem?.sortOrder ?? 0}
                onChange={(e) => setEditItem(prev => prev ? { ...prev, sortOrder: Number(e.target.value) } : null)}
                className="mt-1 w-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button size="sm" onClick={saveItem} disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.type === "group" ? "Group" : "Description"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "group"
                ? "This will delete the group and ALL descriptions within it. This action cannot be undone."
                : `Delete "${deleteTarget?.label}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
