import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users, Plus, Trash2, GripVertical, Calendar } from "lucide-react";

const VIEW_TYPES = [
  { value: "construction_team", label: "Construction Team", description: "Installers, supervisors, and construction staff" },
  { value: "trades", label: "Trades", description: "External trades (no Nylas calendar — internal availability only)" },
  { value: "delivery", label: "Delivery", description: "Delivery drivers and logistics staff" },
  { value: "design_advisors", label: "Design Advisors", description: "Sales and design advisory team" },
  { value: "admin_office", label: "Admin & Office", description: "Office and administrative staff" },
] as const;

type ViewType = (typeof VIEW_TYPES)[number]["value"];

export default function CalendarViewsAdmin() {
  const [activeView, setActiveView] = useState<ViewType>("construction_team");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const utils = trpc.useUtils();

  // Fetch members of the active view
  const { data: members, isLoading } = trpc.calendarViews.getViewMembers.useQuery({ viewType: activeView });

  // Fetch all users for the add dropdown
  const { data: allUsers } = trpc.userManagement.list.useQuery();

  const addMember = trpc.calendarViews.addMember.useMutation({
    onSuccess: () => {
      toast.success("Member added to view");
      utils.calendarViews.getViewMembers.invalidate({ viewType: activeView });
      setSelectedUserId("");
    },
    onError: (err) => toast.error(err.message || "Failed to add member"),
  });

  const removeMember = trpc.calendarViews.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed from view");
      utils.calendarViews.getViewMembers.invalidate({ viewType: activeView });
    },
    onError: (err) => toast.error(err.message || "Failed to remove member"),
  });

  // Filter out users already in this view
  const availableUsers = allUsers?.filter(
    (u) => !members?.some((m) => m.userId === u.id)
  ) || [];

  const handleAdd = () => {
    if (!selectedUserId) return;
    addMember.mutate({ viewType: activeView, userId: parseInt(selectedUserId) });
  };

  const handleRemove = (memberId: number) => {
    removeMember.mutate({ id: memberId });
  };

  const viewInfo = VIEW_TYPES.find((v) => v.value === activeView);

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Calendar className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Calendar Views</h1>
          <p className="text-sm text-muted-foreground">
            Assign users to calendar views. Members appear in the Calendar Availability timeline.
          </p>
        </div>
      </div>

      <Tabs value={activeView} onValueChange={(v) => setActiveView(v as ViewType)}>
        <TabsList className="h-9 w-full justify-start flex-wrap">
          {VIEW_TYPES.map((vt) => (
            <TabsTrigger key={vt.value} value={vt.value} className="text-xs px-3">
              {vt.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {VIEW_TYPES.map((vt) => (
          <TabsContent key={vt.value} value={vt.value} className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> {vt.label} Members
                </CardTitle>
                <CardDescription className="text-xs">{vt.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Add member */}
                <div className="flex items-center gap-2">
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger className="flex-1 h-9 text-sm">
                      <SelectValue placeholder="Select a user to add..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableUsers.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.name || u.email} {u.role && <span className="text-muted-foreground ml-1">({u.role.replace(/_/g, " ")})</span>}
                        </SelectItem>
                      ))}
                      {availableUsers.length === 0 && (
                        <SelectItem value="__none" disabled>
                          All users already added
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-9 gap-1"
                    onClick={handleAdd}
                    disabled={!selectedUserId || addMember.isPending}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>

                {/* Members list */}
                {isLoading ? (
                  <div className="py-8 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-muted border-t-foreground mx-auto" />
                  </div>
                ) : members && members.length > 0 ? (
                  <div className="space-y-1">
                    {members.map((member, idx) => (
                      <div
                        key={member.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/10 hover:bg-muted/30"
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{member.userName || "Unknown"}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{member.userEmail}</p>
                        </div>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {member.userRole?.replace(/_/g, " ") || "user"}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleRemove(member.id)}
                          disabled={removeMember.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center border rounded-lg bg-muted/10">
                    <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No members in this view yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Add users above to make them visible in the Calendar Availability timeline.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
