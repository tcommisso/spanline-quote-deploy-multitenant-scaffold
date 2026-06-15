import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MapPin, Plus, Trash2, Edit2, Building2, Search, X } from "lucide-react";

export default function TerritoryManagement() {
  const utils = trpc.useUtils();
  const { data: territories = [], isLoading } = trpc.territory.list.useQuery();
  const { data: branchesList = [] } = trpc.branches.list.useQuery();

  const [searchTerm, setSearchTerm] = useState("");
  const [newTerritoryName, setNewTerritoryName] = useState("");
  const [newTerritoryBranch, setNewTerritoryBranch] = useState("");
  const [newPostcodes, setNewPostcodes] = useState("");
  const [addPostcodesTerritory, setAddPostcodesTerritory] = useState<string | null>(null);
  const [addPostcodesInput, setAddPostcodesInput] = useState("");
  const [editingTerritory, setEditingTerritory] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editBranch, setEditBranch] = useState("");

  const addPostcodesMut = trpc.territory.addPostcodes.useMutation({
    onSuccess: () => {
      utils.territory.list.invalidate();
      toast.success("Postcodes added");
      setNewTerritoryName("");
      setNewTerritoryBranch("");
      setNewPostcodes("");
      setAddPostcodesInput("");
      setAddPostcodesTerritory(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const removePostcodesMut = trpc.territory.removePostcodes.useMutation({
    onSuccess: () => {
      utils.territory.list.invalidate();
      toast.success("Postcodes removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const renameMut = trpc.territory.rename.useMutation({
    onSuccess: () => {
      utils.territory.list.invalidate();
      toast.success("Territory renamed");
      setEditingTerritory(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const changeBranchMut = trpc.territory.changeBranch.useMutation({
    onSuccess: () => {
      utils.territory.list.invalidate();
      toast.success("Branch updated");
      setEditingTerritory(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteTerritoryMut = trpc.territory.deleteTerritory.useMutation({
    onSuccess: () => {
      utils.territory.list.invalidate();
      toast.success("Territory deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const filteredTerritories = useMemo(() => {
    if (!searchTerm) return territories;
    const lower = searchTerm.toLowerCase();
    return territories.filter(
      (t) =>
        t.territory.toLowerCase().includes(lower) ||
        t.postcodes.some((p) => p.postcode.includes(searchTerm))
    );
  }, [territories, searchTerm]);

  const branchName = (branchId: number) =>
    branchesList.find((b: any) => b.id === branchId)?.name || `Branch #${branchId}`;

  function handleCreateTerritory() {
    if (!newTerritoryName.trim() || !newTerritoryBranch || !newPostcodes.trim()) {
      toast.error("Please fill in all fields");
      return;
    }
    const postcodes = newPostcodes
      .split(/[,\s\n]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (postcodes.length === 0) {
      toast.error("Enter at least one postcode");
      return;
    }
    addPostcodesMut.mutate({
      territory: newTerritoryName.trim(),
      branchId: Number(newTerritoryBranch),
      postcodes,
    });
  }

  function handleAddPostcodes(territory: string, branchId: number) {
    const postcodes = addPostcodesInput
      .split(/[,\s\n]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (postcodes.length === 0) {
      toast.error("Enter at least one postcode");
      return;
    }
    addPostcodesMut.mutate({ territory, branchId, postcodes });
  }

  function handleSaveEdit(territory: string, currentBranchId: number) {
    if (editName && editName !== territory) {
      renameMut.mutate({ oldName: territory, newName: editName });
    }
    if (editBranch && Number(editBranch) !== currentBranchId) {
      changeBranchMut.mutate({ territory: editName || territory, branchId: Number(editBranch) });
    }
    if (!editName && !editBranch) {
      setEditingTerritory(null);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MapPin className="h-6 w-6" /> Territory Management
        </h1>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MapPin className="h-6 w-6" /> Territory Management
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search territory or postcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-64"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Create New Territory */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Create New Territory</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Territory name (e.g. ACT, Riverina)"
              value={newTerritoryName}
              onChange={(e) => setNewTerritoryName(e.target.value)}
              className="sm:w-48"
            />
            <Select value={newTerritoryBranch} onValueChange={setNewTerritoryBranch}>
              <SelectTrigger className="sm:w-48">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {branchesList.map((b: any) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Postcodes (comma or space separated)"
              value={newPostcodes}
              onChange={(e) => setNewPostcodes(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={handleCreateTerritory}
              disabled={addPostcodesMut.isPending}
            >
              <Plus className="h-4 w-4 mr-1" /> Create
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Territory List */}
      <div className="space-y-4">
        {filteredTerritories.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {searchTerm ? "No territories match your search." : "No territories configured yet."}
          </div>
        )}
        {filteredTerritories.map((t) => (
          <Card key={t.territory}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {editingTerritory === t.territory ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-48 h-8"
                        placeholder="Territory name"
                      />
                      <Select
                        value={editBranch || String(t.branchId)}
                        onValueChange={setEditBranch}
                      >
                        <SelectTrigger className="w-48 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {branchesList.map((b: any) => (
                            <SelectItem key={b.id} value={String(b.id)}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={() => handleSaveEdit(t.territory, t.branchId)}
                        disabled={renameMut.isPending || changeBranchMut.isPending}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingTerritory(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <CardTitle className="text-lg">{t.territory}</CardTitle>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {branchName(t.branchId)}
                      </Badge>
                      <Badge variant="secondary">{t.postcodes.length} postcodes</Badge>
                    </>
                  )}
                </div>
                {editingTerritory !== t.territory && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingTerritory(t.territory);
                        setEditName(t.territory);
                        setEditBranch(String(t.branchId));
                      }}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Territory</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove the territory "{t.territory}" and all its {t.postcodes.length} postcode mappings. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteTerritoryMut.mutate({ territory: t.territory })}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {t.postcodes.map((p) => (
                  <Badge
                    key={p.id}
                    variant="secondary"
                    className="group cursor-default hover:bg-destructive/10"
                  >
                    {p.postcode}
                    <button
                      onClick={() => removePostcodesMut.mutate({ ids: [p.id] })}
                      className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove postcode"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              {addPostcodesTerritory === t.territory ? (
                <div className="flex gap-2">
                  <Input
                    placeholder="Add postcodes (comma separated)"
                    value={addPostcodesInput}
                    onChange={(e) => setAddPostcodesInput(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddPostcodes(t.territory, t.branchId);
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => handleAddPostcodes(t.territory, t.branchId)}
                    disabled={addPostcodesMut.isPending}
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAddPostcodesTerritory(null);
                      setAddPostcodesInput("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAddPostcodesTerritory(t.territory)}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add Postcodes
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
