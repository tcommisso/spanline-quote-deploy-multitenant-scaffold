import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const { canAccessPath, loading: permissionsLoading } = useEffectivePermissions();
  const allowed = user ? canAccessPath(location) : false;

  useEffect(() => {
    if (!loading && !permissionsLoading && user && !allowed) {
      setLocation("/");
    }
  }, [user, loading, permissionsLoading, allowed, setLocation]);

  if (loading || permissionsLoading) return null;
  if (!user || !allowed) return null;

  return <>{children}</>;
}
