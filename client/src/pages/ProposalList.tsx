/**
 * ProposalList — Displays all proposals with filtering, status badges, and actions.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreVertical, Eye, Pencil, Trash2, CheckCircle, XCircle, FileText } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  sent: "bg-blue-100 text-blue-800",
  viewed: "bg-purple-100 text-purple-800",
  accepted: "bg-green-100 text-green-800",
  declined: "bg-red-100 text-red-800",
  expired: "bg-orange-100 text-orange-800",
};

export default function ProposalList() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: proposals, refetch } = trpc.proposals.list.useQuery({
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const deleteMutation = trpc.proposals.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Proposal deleted"); },
  });
  const acceptMutation = trpc.proposals.markAccepted.useMutation({
    onSuccess: () => { refetch(); toast.success("Proposal marked as accepted"); },
  });
  const declineMutation = trpc.proposals.markDeclined.useMutation({
    onSuccess: () => { refetch(); toast.success("Proposal marked as declined"); },
  });

  const fmt = (val: string | null) => {
    if (!val) return "—";
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(parseFloat(val));
  };

  const fmtDate = (d: Date | string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <div className="container max-w-5xl py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-6 w-6" /> Proposals
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Centralised proposal management — consolidate sections, set pricing, and track status.
          </p>
        </div>
        <Button variant="brand" onClick={() => setLocation("/proposals/new")}>
          <Plus className="h-4 w-4 mr-1" /> New Proposal
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search proposals..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="viewed">Viewed</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Proposals Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Proposal #</th>
                  <th className="text-left px-4 py-3 font-medium">Client</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Total (inc GST)</th>
                  <th className="text-left px-4 py-3 font-medium">Created</th>
                  <th className="text-left px-4 py-3 font-medium">Sent</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(!proposals || proposals.length === 0) ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground">
                      No proposals found. Create your first proposal to get started.
                    </td>
                  </tr>
                ) : (
                  proposals.map((p: any) => (
                    <tr key={p.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{p.proposalNumber}</td>
                      <td className="px-4 py-3">{p.clientName || p.sentTo || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge className={STATUS_COLORS[p.status] || ""} variant="secondary">
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{fmt(p.grandTotalIncGst)}</td>
                      <td className="px-4 py-3 text-xs">{fmtDate(p.createdAt)}</td>
                      <td className="px-4 py-3 text-xs">{fmtDate(p.sentAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setLocation(`/proposals/edit/${p.id}`)}>
                              <Pencil className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            {p.status === "sent" && (
                              <>
                                <DropdownMenuItem onClick={() => acceptMutation.mutate({ id: p.id })}>
                                  <CheckCircle className="h-4 w-4 mr-2" /> Mark Accepted
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => declineMutation.mutate({ id: p.id })}>
                                  <XCircle className="h-4 w-4 mr-2" /> Mark Declined
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                if (confirm("Delete this proposal?")) deleteMutation.mutate({ id: p.id });
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
