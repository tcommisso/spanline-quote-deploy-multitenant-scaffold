import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, UserCog } from "lucide-react";

const UNASSIGNED = "__unassigned";
const MANUAL = "__manual";
const USER_PREFIX = "user:";

type AssignableUser = {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
};

export type ProjectTeamValue = {
  constructionManagerId?: number | null;
  constructionManagerName?: string | null;
  technicalDesignerId?: number | null;
  technicalDesignerName?: string | null;
};

export type ProjectTeamPayload = {
  constructionManagerId: number | null;
  constructionManagerName: string | null;
  technicalDesignerId: number | null;
  technicalDesignerName: string | null;
};

type RoleValue = {
  mode: string;
  manualName: string;
};

type ProjectTeamFieldsProps = {
  value?: ProjectTeamValue | null;
  onSave: (payload: ProjectTeamPayload) => void;
  saving?: boolean;
  disabled?: boolean;
  description?: string;
  linkedJobLabel?: string;
};

function displayName(user: AssignableUser) {
  return user.name || user.email || `User #${user.id}`;
}

function roleLabel(role?: string | null) {
  return String(role || "user").replace(/_/g, " ");
}

function initialRole(userId?: number | null, name?: string | null): RoleValue {
  if (userId != null) return { mode: `${USER_PREFIX}${userId}`, manualName: name || "" };
  if (String(name || "").trim()) return { mode: MANUAL, manualName: String(name || "") };
  return { mode: UNASSIGNED, manualName: "" };
}

function resolveRole(value: RoleValue, users: AssignableUser[]) {
  if (value.mode === UNASSIGNED) return { userId: null, name: null };
  if (value.mode === MANUAL) {
    const name = value.manualName.trim();
    return { userId: null, name: name || null };
  }
  if (value.mode.startsWith(USER_PREFIX)) {
    const userId = Number(value.mode.slice(USER_PREFIX.length));
    const user = users.find((candidate) => candidate.id === userId);
    return { userId, name: user ? displayName(user) : value.manualName.trim() || null };
  }
  return { userId: null, name: null };
}

function RolePicker({
  label,
  value,
  onChange,
  users,
  disabled,
}: {
  label: string;
  value: RoleValue;
  onChange: (next: RoleValue) => void;
  users: AssignableUser[];
  disabled?: boolean;
}) {
  const selectedUserId = value.mode.startsWith(USER_PREFIX)
    ? Number(value.mode.slice(USER_PREFIX.length))
    : null;
  const selectedUser = selectedUserId != null ? users.find((user) => user.id === selectedUserId) : null;
  const missingSelectedUser = selectedUserId != null && !selectedUser;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={value.mode}
        disabled={disabled}
        onValueChange={(mode) => onChange({
          mode,
          manualName: mode === MANUAL || mode.startsWith(USER_PREFIX) ? value.manualName : "",
        })}
      >
        <SelectTrigger>
          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
          <SelectItem value={MANUAL}>Manual / non-user</SelectItem>
          {missingSelectedUser && (
            <SelectItem value={`${USER_PREFIX}${selectedUserId}`}>
              {value.manualName || `User #${selectedUserId}`}
            </SelectItem>
          )}
          {users.map((user) => (
            <SelectItem key={user.id} value={`${USER_PREFIX}${user.id}`}>
              {displayName(user)} ({roleLabel(user.role)})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value.mode === MANUAL && (
        <Input
          value={value.manualName}
          disabled={disabled}
          placeholder={`Enter ${label.toLowerCase()} name`}
          onChange={(event) => onChange({ ...value, manualName: event.target.value })}
        />
      )}
    </div>
  );
}

export default function ProjectTeamFields({
  value,
  onSave,
  saving = false,
  disabled = false,
  description = "Assign the post-sale project team from users, or enter an external non-user name.",
  linkedJobLabel,
}: ProjectTeamFieldsProps) {
  const usersQuery = trpc.constructionClients.assignableUsers.useQuery();
  const users = useMemo(
    () => [...(usersQuery.data || [])].sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [usersQuery.data],
  );
  const [constructionManager, setConstructionManager] = useState<RoleValue>(() =>
    initialRole(value?.constructionManagerId, value?.constructionManagerName)
  );
  const [technicalDesigner, setTechnicalDesigner] = useState<RoleValue>(() =>
    initialRole(value?.technicalDesignerId, value?.technicalDesignerName)
  );

  useEffect(() => {
    setConstructionManager(initialRole(value?.constructionManagerId, value?.constructionManagerName));
    setTechnicalDesigner(initialRole(value?.technicalDesignerId, value?.technicalDesignerName));
  }, [
    value?.constructionManagerId,
    value?.constructionManagerName,
    value?.technicalDesignerId,
    value?.technicalDesignerName,
  ]);

  const handleSave = () => {
    const manager = resolveRole(constructionManager, users);
    const designer = resolveRole(technicalDesigner, users);
    onSave({
      constructionManagerId: manager.userId,
      constructionManagerName: manager.name,
      technicalDesignerId: designer.userId,
      technicalDesignerName: designer.name,
    });
  };

  const controlsDisabled = disabled || saving || usersQuery.isLoading;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <UserCog className="h-4 w-4" />
              Project Team
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            {linkedJobLabel && <p className="mt-1 text-[11px] text-muted-foreground">{linkedJobLabel}</p>}
          </div>
          <Button size="sm" onClick={handleSave} disabled={controlsDisabled} className="gap-1.5">
            {saving || usersQuery.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Team
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <RolePicker
          label="Construction Manager"
          value={constructionManager}
          onChange={setConstructionManager}
          users={users}
          disabled={controlsDisabled}
        />
        <RolePicker
          label="Technical Designer (Specifier)"
          value={technicalDesigner}
          onChange={setTechnicalDesigner}
          users={users}
          disabled={controlsDisabled}
        />
      </CardContent>
    </Card>
  );
}
