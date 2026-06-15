import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, DollarSign, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  projectId: number;
}

export function ApprovalFeesTab({ projectId }: Props) {
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ feeType: "", description: "", amount: "" });

  const { data: fees, isLoading } = trpc.approvals.fees.list.useQuery({ projectId });
  const utils = trpc.useUtils();

  const createFee = trpc.approvals.fees.create.useMutation({
    onSuccess: () => {
      toast.success("Fee added");
      setShowNew(false);
      setNewForm({ feeType: "", description: "", amount: "" });
      utils.approvals.fees.list.invalidate({ projectId });
    },
    onError: (err) => toast.error(err.message),
  });

  const updateFee = trpc.approvals.fees.update.useMutation({
    onSuccess: () => {
      toast.success("Fee updated");
      utils.approvals.fees.list.invalidate({ projectId });
    },
  });

  const handleCreate = () => {
    if (!newForm.feeType || !newForm.description || !newForm.amount) {
      toast.error("All fields are required");
      return;
    }
    createFee.mutate({
      projectId,
      feeType: newForm.feeType,
      description: newForm.description,
      amount: newForm.amount,
    });
  };

  const markPaid = (fee: any) => {
    updateFee.mutate({
      id: fee.id,
      data: { isPaid: true, paidAt: new Date().toISOString() },
    });
  };

  const totalFees = (fees || []).reduce((sum: number, f: any) => sum + Number(f.amount || 0), 0);
  const paidFees = (fees || []).filter((f: any) => f.isPaid).reduce((sum: number, f: any) => sum + Number(f.amount || 0), 0);

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Fees & Levies</h3>
          <p className="text-sm text-muted-foreground">
            Total: ${totalFees.toLocaleString()} | Paid: ${paidFees.toLocaleString()} | Outstanding: ${(totalFees - paidFees).toLocaleString()}
          </p>
        </div>
        <Dialog open={showNew} onOpenChange={setShowNew}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Add Fee
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Fee</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Fee Type *</Label>
                <Input
                  placeholder="e.g. da_fee, section_94_levy"
                  value={newForm.feeType}
                  onChange={(e) => setNewForm({ ...newForm, feeType: e.target.value })}
                />
              </div>
              <div>
                <Label>Description *</Label>
                <Input
                  placeholder="e.g. DA Application Fee"
                  value={newForm.description}
                  onChange={(e) => setNewForm({ ...newForm, description: e.target.value })}
                />
              </div>
              <div>
                <Label>Amount ($) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={newForm.amount}
                  onChange={(e) => setNewForm({ ...newForm, amount: e.target.value })}
                />
              </div>
              <Button onClick={handleCreate} disabled={createFee.isPending} className="w-full">
                {createFee.isPending ? "Adding..." : "Add Fee"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : !fees || fees.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No fees recorded. Add fees and levies as they become known.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {fees.map((fee: any) => (
            <Card key={fee.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <DollarSign className={`h-5 w-5 ${fee.isPaid ? "text-green-500" : "text-muted-foreground"}`} />
                  <div>
                    <p className="font-medium text-sm">{fee.description}</p>
                    <p className="text-xs text-muted-foreground">{fee.feeType}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">${Number(fee.amount).toLocaleString()}</span>
                  {fee.isPaid ? (
                    <Badge variant="outline" className="bg-green-100 text-green-800">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Paid
                    </Badge>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => markPaid(fee)}>
                      Mark Paid
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
