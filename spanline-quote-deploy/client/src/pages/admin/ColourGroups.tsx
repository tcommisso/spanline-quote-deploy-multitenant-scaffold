import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Save, Plus, Trash2, Palette, Edit2, ShieldCheck } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { ColourSelectPreview } from "@/components/ColourSwatch";

export default function ColourGroups() {
  const utils = trpc.useUtils();
  const { data: groups } = trpc.colourGroups.getAll.useQuery();
  const { data: allMembers } = trpc.colourGroups.getAllMembers.useQuery();
  const { data: allColours } = trpc.masterData.getByCategory.useQuery({ category: "colour" });

  const upsertMutation = trpc.colourGroups.upsert.useMutation({
    onSuccess: () => {
      toast.success("Colour group saved");
      utils.colourGroups.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.colourGroups.delete.useMutation({
    onSuccess: () => {
      toast.success("Colour group deleted");
      utils.colourGroups.getAll.invalidate();
      utils.colourGroups.getAllMembers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const setMembersMutation = trpc.colourGroups.setMembers.useMutation({
    onSuccess: () => {
      toast.success("Colour group members updated");
      utils.colourGroups.getAllMembers.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateStandardColoursMutation = trpc.colourGroups.updateStandardColours.useMutation({
    onSuccess: () => {
      toast.success("Standard colours updated");
      utils.colourGroups.getAll.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const cleanupMutation = trpc.colourGroups.cleanupOrphaned.useMutation({
    onSuccess: (data) => {
      if (data.removed > 0) {
        toast.success(`Removed ${data.removed} orphaned colour${data.removed > 1 ? "s" : ""} from groups`);
        utils.colourGroups.getAllMembers.invalidate();
      } else {
        toast.info("No orphaned colours found — all group members are valid");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const [editGroup, setEditGroup] = useState<{ id?: number; name: string; description: string; sortOrder: number } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [membersDialog, setMembersDialog] = useState<{ groupId: number; groupName: string } | null>(null);
  const [standardDialog, setStandardDialog] = useState<{ groupId: number; groupName: string } | null>(null);
  const [selectedColours, setSelectedColours] = useState<string[]>([]);
  const [selectedStandard, setSelectedStandard] = useState<string[]>([]);

  // Build a map of groupId -> colour values
  const membersByGroup = useMemo(() => {
    const map: Record<number, string[]> = {};
    if (allMembers) {
      for (const m of allMembers) {
        if (!map[m.colourGroupId]) map[m.colourGroupId] = [];
        map[m.colourGroupId].push(m.colourValue);
      }
    }
    return map;
  }, [allMembers]);

  // Build a map of groupId -> standard colours
  const standardByGroup = useMemo(() => {
    const map: Record<number, string[]> = {};
    if (groups) {
      for (const g of groups) {
        map[g.id] = (g.standardColours as string[] | null) || [];
      }
    }
    return map;
  }, [groups]);

  const availableColours = useMemo(() => {
    if (!allColours) return [];
    return allColours.map(c => c.value).sort();
  }, [allColours]);

  const openAddGroup = () => {
    setEditGroup({ name: "", description: "", sortOrder: (groups?.length ?? 0) });
  };

  const openEditGroup = (g: any) => {
    setEditGroup({ id: g.id, name: g.name, description: g.description || "", sortOrder: g.sortOrder ?? 0 });
  };

  const saveGroup = () => {
    if (!editGroup || !editGroup.name.trim()) {
      toast.error("Group name is required");
      return;
    }
    upsertMutation.mutate({
      id: editGroup.id,
      name: editGroup.name.trim(),
      description: editGroup.description || null,
      sortOrder: editGroup.sortOrder,
    }, {
      onSuccess: () => setEditGroup(null),
    });
  };

  const openMembersDialog = (groupId: number, groupName: string) => {
    setSelectedColours(membersByGroup[groupId] || []);
    setMembersDialog({ groupId, groupName });
  };

  const openStandardDialog = (groupId: number, groupName: string) => {
    setSelectedStandard(standardByGroup[groupId] || []);
    setStandardDialog({ groupId, groupName });
  };

  const saveMembers = () => {
    if (!membersDialog) return;
    setMembersMutation.mutate({
      colourGroupId: membersDialog.groupId,
      colours: selectedColours,
    }, {
      onSuccess: () => setMembersDialog(null),
    });
  };

  const saveStandardColours = () => {
    if (!standardDialog) return;
    updateStandardColoursMutation.mutate({
      id: standardDialog.groupId,
      standardColours: selectedStandard,
    }, {
      onSuccess: () => setStandardDialog(null),
    });
  };

  const toggleColour = (colour: string) => {
    setSelectedColours(prev =>
      prev.includes(colour) ? prev.filter(c => c !== colour) : [...prev, colour]
    );
  };

  const toggleStandard = (colour: string) => {
    setSelectedStandard(prev =>
      prev.includes(colour) ? prev.filter(c => c !== colour) : [...prev, colour]
    );
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ id: deleteTarget.id });
    setDeleteTarget(null);
  };

  // Get the members for the standard dialog (only show colours that are in the group)
  const standardDialogMembers = useMemo(() => {
    if (!standardDialog) return [];
    return membersByGroup[standardDialog.groupId] || [];
  }, [standardDialog, membersByGroup]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Colour Groups</h1>
          <p className="text-sm text-muted-foreground">
            Manage colour palettes that can be assigned to products. Mark standard colours to control automatic powder coat surcharge.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Groups</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => cleanupMutation.mutate()}
                disabled={cleanupMutation.isPending}
                className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" /> {cleanupMutation.isPending ? "Cleaning..." : "Cleanup Orphaned"}
              </Button>
              <Button variant="outline" size="sm" onClick={openAddGroup} className="h-7 text-xs gap-1.5">
                <Plus className="h-3 w-3" /> Add Group
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!groups || groups.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No colour groups defined. Click "Add Group" to create one.</p>
          ) : (
            <div className="space-y-2">
              {groups.map((g) => {
                const members = membersByGroup[g.id] || [];
                const standard = standardByGroup[g.id] || [];
                return (
                  <div key={g.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary">
                        <Palette className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm">{g.name}</div>
                        {g.description && <div className="text-xs text-muted-foreground truncate">{g.description}</div>}
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {members.length === 0 ? (
                            <span className="text-xs text-muted-foreground italic">No colours assigned</span>
                          ) : (
                            <>
                              {members.slice(0, 6).map(c => (
                                <Badge key={c} variant={standard.includes(c) ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 h-4">
                                  {standard.includes(c) && <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />}
                                  {c}
                                </Badge>
                              ))}
                              {members.length > 6 && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">+{members.length - 6} more</Badge>
                              )}
                            </>
                          )}
                        </div>
                        {standard.length > 0 && (
                          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {standard.length} standard (no PC surcharge)
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <Button variant="ghost" size="sm" onClick={() => openStandardDialog(g.id, g.name)} className="h-7 text-xs gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950" title="Set standard colours (no PC surcharge)">
                        <ShieldCheck className="h-3 w-3" /> Standard
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openMembersDialog(g.id, g.name)} className="h-7 text-xs gap-1" title="Manage colours in this group">
                        <Palette className="h-3 w-3" /> Colours
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEditGroup(g)} className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground">
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteTarget({ id: g.id, name: g.name })} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Group Dialog */}
      <Dialog open={!!editGroup} onOpenChange={() => setEditGroup(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editGroup?.id ? "Edit" : "Add"} Colour Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Group Name</Label>
              <Input
                value={editGroup?.name || ""}
                onChange={(e) => setEditGroup(prev => prev ? { ...prev, name: e.target.value } : null)}
                placeholder="e.g. Standard Colorbond"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Input
                value={editGroup?.description || ""}
                onChange={(e) => setEditGroup(prev => prev ? { ...prev, description: e.target.value } : null)}
                placeholder="e.g. Standard Colorbond range colours"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sort Order</Label>
              <Input
                type="number"
                value={editGroup?.sortOrder ?? 0}
                onChange={(e) => setEditGroup(prev => prev ? { ...prev, sortOrder: parseInt(e.target.value) || 0 } : null)}
                className="h-8 text-sm w-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditGroup(null)}>Cancel</Button>
            <Button size="sm" onClick={saveGroup} disabled={upsertMutation.isPending} className="gap-1.5">
              <Save className="h-3 w-3" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Members Dialog */}
      <Dialog open={!!membersDialog} onOpenChange={() => setMembersDialog(null)}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Colours in "{membersDialog?.groupName}"</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Select which colours belong to this group. Products assigned to this colour group will show only these colours in the Spec Sheet.
          </p>
          <div className="flex-1 overflow-y-auto border rounded-md p-2 space-y-1 min-h-0 max-h-[50vh]">
            {availableColours.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No colours defined in master data. Add colours under General first.</p>
            ) : (
              availableColours.map(colour => (
                <label key={colour} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer">
                  <Checkbox
                    checked={selectedColours.includes(colour)}
                    onCheckedChange={() => toggleColour(colour)}
                  />
                  <ColourSelectPreview colour={colour} />
                </label>
              ))
            )}
          </div>
          <div className="text-xs text-muted-foreground pt-1">
            {selectedColours.length} colour{selectedColours.length !== 1 ? "s" : ""} selected
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setMembersDialog(null)}>Cancel</Button>
            <Button size="sm" onClick={saveMembers} disabled={setMembersMutation.isPending} className="gap-1.5">
              <Save className="h-3 w-3" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Standard Colours Dialog (No PC Surcharge) */}
      <Dialog open={!!standardDialog} onOpenChange={() => setStandardDialog(null)}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Standard Colours — "{standardDialog?.groupName}"</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Mark which colours are <strong>standard</strong> (no powder coat surcharge). Any colour NOT marked as standard will automatically trigger the PC surcharge when selected in a quote.
          </p>
          <div className="flex-1 overflow-y-auto border rounded-md p-2 space-y-1 min-h-0 max-h-[50vh]">
            {standardDialogMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No colours in this group yet. Add colours via the "Colours" button first.</p>
            ) : (
              standardDialogMembers.map(colour => (
                <label key={colour} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer">
                  <Checkbox
                    checked={selectedStandard.includes(colour)}
                    onCheckedChange={() => toggleStandard(colour)}
                  />
                  <ColourSelectPreview colour={colour} />
                  {selectedStandard.includes(colour) && (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 ml-auto bg-emerald-600">
                      <ShieldCheck className="h-2.5 w-2.5 mr-0.5" /> No PC
                    </Badge>
                  )}
                </label>
              ))
            )}
          </div>
          <div className="flex items-center justify-between pt-1">
            <div className="text-xs text-muted-foreground">
              {selectedStandard.length} of {standardDialogMembers.length} marked as standard
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setSelectedStandard(standardDialogMembers)}>
                Select All
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setSelectedStandard([])}>
                Clear All
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setStandardDialog(null)}>Cancel</Button>
            <Button size="sm" onClick={saveStandardColours} disabled={updateStandardColoursMutation.isPending} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
              <Save className="h-3 w-3" /> Save Standard Colours
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Colour Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the colour group <strong>"{deleteTarget?.name}"</strong>? Products assigned to this group will no longer have a colour group filter. This action cannot be undone.
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
