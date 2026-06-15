import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";
import { Plus, Trash2, Image, Calendar, Pencil, Copy, Shield } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminRole } from "@shared/const";

export default function PatioPlanner() {
  const [, navigate] = useLocation();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>("");
  const [quoteSearch, setQuoteSearch] = useState("");
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.role || "");
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const { data: projects, isLoading, refetch } = trpc.patioPlanner.list.useQuery(
    undefined,
    { enabled: !showAllProjects }
  );
  const { data: allProjects, isLoading: isLoadingAll, refetch: refetchAll } = trpc.patioPlanner.adminList.useQuery(
    undefined,
    { enabled: isAdmin && showAllProjects }
  );

  const displayProjects = showAllProjects ? allProjects : projects;
  const displayLoading = showAllProjects ? isLoadingAll : isLoading;
  const { data: quotes } = trpc.quotes.list.useQuery(
    { search: quoteSearch, status: "all" },
    { enabled: createOpen }
  );

  const createProject = trpc.patioPlanner.create.useMutation({
    onSuccess: (data) => {
      toast.success("Project created");
      setCreateOpen(false);
      setNewName("");
      setSelectedQuoteId("");
      navigate(`/patio-planner/${data.id}`);
    },
  });
  const deleteProject = trpc.patioPlanner.delete.useMutation({
    onSuccess: () => {
      toast.success("Project deleted");
      setDeleteTarget(null);
      refetch();
    },
  });
  const adminDeleteProject = trpc.patioPlanner.adminDelete.useMutation({
    onSuccess: () => {
      toast.success("Project deleted (admin)");
      setDeleteTarget(null);
      refetchAll();
      refetch();
    },
  });

  // Filter quotes for the selector
  const filteredQuotes = useMemo(() => {
    if (!quotes) return [];
    return quotes.slice(0, 20); // Show top 20 most recent
  }, [quotes]);

  const handleCreate = () => {
    const quoteId = selectedQuoteId ? Number(selectedQuoteId) : undefined;
    createProject.mutate({ name: newName.trim(), quoteId });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    if (isAdmin && showAllProjects) {
      adminDeleteProject.mutate({ id: deleteTarget.id });
    } else {
      deleteProject.mutate({ id: deleteTarget.id });
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Patio Planner</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overlay patio structures on site photos with colour finishes and roof styles
          </p>
          {isAdmin && (
            <Button
              variant={showAllProjects ? "secondary" : "outline"}
              size="sm"
              className="mt-1 h-6 text-[10px] gap-1"
              onClick={() => setShowAllProjects(!showAllProjects)}
            >
              <Shield className="h-3 w-3" />
              {showAllProjects ? "Showing All" : "Show All (Admin)"}
            </Button>
          )}
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="brand">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Patio Planner Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Project Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Smith Residence - Flyover Patio"
                />
              </div>

              {/* Copy from Quote selector */}
              <div>
                <Label className="flex items-center gap-1.5">
                  <Copy className="h-3.5 w-3.5" />
                  Copy from Quote (optional)
                </Label>
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  Pre-fill dimensions, colours, and openings from an existing quote spec sheet
                </p>
                <Input
                  value={quoteSearch}
                  onChange={(e) => setQuoteSearch(e.target.value)}
                  placeholder="Search quotes by client or number..."
                  className="mb-2 h-8 text-xs"
                />
                <Select value={selectedQuoteId} onValueChange={setSelectedQuoteId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a quote to copy from..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No quote (start fresh)</SelectItem>
                    {filteredQuotes.map((q: any) => (
                      <SelectItem key={q.id} value={String(q.id)}>
                        {q.quoteNumber} — {q.clientName}
                        {q.specWidth ? ` (${q.specWidth}×${q.specLength}mm)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedQuoteId && selectedQuoteId !== "none" && (
                  <p className="text-[10px] text-green-600 mt-1">
                    Will pre-fill: dimensions, roof style, colours, posts, windows & doors from spec sheet
                  </p>
                )}
              </div>

              <Button
                className="w-full"
                disabled={!newName.trim() || createProject.isPending}
                onClick={handleCreate}
              >
                {createProject.isPending ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {displayLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="h-32 bg-muted rounded" />
                <div className="h-4 bg-muted rounded mt-3 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !displayProjects?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Image className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-medium text-lg">No projects yet</h3>
            <p className="text-sm text-muted-foreground mt-1 text-center max-w-sm">
              Create a project to start overlaying patio structures on site photos with Colorbond colour finishes.
            </p>
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayProjects.map((project) => (
            <Card
              key={project.id}
              className="group cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/patio-planner/${project.id}`)}
            >
              <CardContent className="p-0">
                {/* Thumbnail */}
                <div className="relative h-36 bg-muted rounded-t-lg overflow-hidden">
                  {project.photoUrl ? (
                    <img src={project.photoUrl} alt={project.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <Image className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  )}
                  {/* Roof style badge */}
                  <span className="absolute top-2 left-2 text-[10px] font-medium bg-black/60 text-white px-2 py-0.5 rounded">
                    {project.roofStyle === "popup-skillion" ? "Pop-up Skillion" : (project.roofStyle || "Flyover").charAt(0).toUpperCase() + (project.roofStyle || "flyover").slice(1)}
                  </span>
                  {/* Delete button - always visible in top-right corner */}
                  {(isAdmin || project.userId === user?.id) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 h-7 w-7 p-0 bg-black/50 hover:bg-destructive text-white hover:text-white rounded-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: project.id, name: project.name });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {/* Info */}
                <div className="p-3">
                  <h3 className="font-medium text-sm truncate">{project.name}</h3>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); navigate(`/patio-planner/${project.id}`); }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open: boolean) => { if (!open) setDeleteTarget(null); }}
        onConfirm={handleDelete}
        title="Delete Patio Project"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete Project"
        isPending={deleteProject.isPending || adminDeleteProject.isPending}
      />
    </div>
  );
}
