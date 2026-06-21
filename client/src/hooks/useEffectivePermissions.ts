import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  canAccessPathWithPermissions,
  defaultPermissionsForRole,
  hasEffectivePermission,
  type PermissionKey,
} from "@shared/const";
import { useCallback, useMemo } from "react";

export function useEffectivePermissions() {
  const { user, loading: authLoading } = useAuth();
  const role = user?.role || "user";
  const permissionsQuery = trpc.userManagement.myPermissions.useQuery(undefined, {
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const permissions = useMemo(
    () => permissionsQuery.data?.permissions ?? defaultPermissionsForRole(role),
    [permissionsQuery.data?.permissions, role],
  );

  const hasPermission = useCallback(
    (permission: PermissionKey) => hasEffectivePermission(permissions, permission),
    [permissions],
  );

  const canAccessPath = useCallback(
    (path: string) => canAccessPathWithPermissions(permissions, path),
    [permissions],
  );

  return {
    permissions,
    hasPermission,
    canAccessPath,
    loading: authLoading || (Boolean(user) && permissionsQuery.isLoading),
    refetch: permissionsQuery.refetch,
  };
}
