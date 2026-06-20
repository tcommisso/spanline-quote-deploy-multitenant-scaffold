import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Plus, ClipboardCheck, XCircle, Trash2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import ConfirmDeleteDialog from "@/components/ConfirmDeleteDialog";

const statusColors: Record<string, string> = {
  in_progress: "bg-blue-100 text-blue-800",
  review: "bg-yellow-100 text-yellow-800",
  pending_approval: "bg-orange-100 text-orange-800",
  finalised: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-800",
};

export default function StocktakeList() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [newBranchId, setNewBranchId] = useState<string>("");
  const [newNotes, setNewNotes] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; stocktakeNumber: string } | null>(null);
  const isSuperAdmin = user?.role === "super_admin";

  const branches = trpc.manufacturing.branches.useQuery();
  const stocktakes = trpc.stocktake.list.useQuery({
    branchId: filterBranch !== "all" ? Number(filterBranch) : undefined,
    status: filterStatus !== "all" ? filterStatus as any : undefined,
  });

  const createMutation = trpc.stocktake.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Stocktake ${data.stocktakeNumber} created with ${data.totalItems} items`);
      setShowCreate(false);
      setNewBranchId("");
      setNewNotes("");
      stocktakes.refetch();
      navigate(`/inventory/stocktake/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelMutation = trpc.stocktake.cancel.useMutation({
    onSuccess: () => {
      toast.success("Stocktake cancelled");
      stocktakes.refetch();
    },
  });

  const deleteMutation = trpc.stocktake.deleteStocktake.useMutation({
    onSuccess: () => {
      toast.success("Stocktake deleted");
      setDeleteTarget(null);
      stocktakes.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stocktakes</h1>
          <p className="text-muted-foreground">Physical stock count workflow with variance tracking</p>
        </div>
        <Button variant="brand" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" /> New Stocktake
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={filterBranch} onValueChange={setFilterBranch}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Branches" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.data?.map((b: any) => (
              <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="review">Review</SelectItem>
            <SelectItem value="pending_approval">Pending Approval</SelectItem>
            <SelectItem value="finalised">Finalised</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stocktake List */}
      <div className="space-y-3">
        {stocktakes.data?.length === 0 && (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            No stocktakes found. Create one to begin counting.
          </CardContent></Card>
        )}
        {stocktakes.data?.map((st: any) => {
          const branch = branches.data?.find((b: any) => b.id === st.branchId);
          const progress = st.totalItems > 0 ? Math.round((st.itemsCounted / st.totalItems) * 100) : 0;
          return (
            <Card key={st.id} className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/inventory/stocktake/${st.id}`)}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <ClipboardCheck className="w-8 h-8 text-muted-foreground" />
                    <div>
                      <div className="font-semibold">{st.stocktakeNumber}</div>
                      <div className="text-sm text-muted-foreground">
                        {branch?.name || "Unknown Branch"} &middot; {new Date(st.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm">
                      <div>{st.itemsCounted}/{st.totalItems} counted</div>
                      <div className="w-24 h-2 bg-gray-200 rounded-full mt-1">
                        <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                    <Badge className={statusColors[st.status] || ""}>{st.status.replace("_", " ")}</Badge>
                    {st.status === "in_progress" && (
                      <Button variant="ghost" size="sm" onClick={(e) => {
                        e.stopPropagation();
                        cancelMutation.mutate({ id: st.id });
                      }}><XCircle className="w-4 h-4" /></Button>
                    )}
                    {isSuperAdmin && st.status !== "finalised" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        title="Delete stocktake"
                        aria-label={`Delete stocktake ${st.stocktakeNumber}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({ id: st.id, stocktakeNumber: st.stocktakeNumber });
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Stocktake</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Branch *</label>
              <Select value={newBranchId} onValueChange={setNewBranchId}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {branches.data?.map((b: any) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea value={newNotes} onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Optional notes about this stocktake..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button disabled={!newBranchId || createMutation.isPending}
              onClick={() => createMutation.mutate({ branchId: Number(newBranchId), notes: newNotes || undefined })}>
              {createMutation.isPending ? "Creating..." : "Create Stocktake"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate({ id: deleteTarget.id });
        }}
        title="Delete Stocktake"
        description={`Delete ${deleteTarget?.stocktakeNumber || "this stocktake"} and all its count lines? This cannot be undone.`}
        confirmLabel="Delete Stocktake"
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
