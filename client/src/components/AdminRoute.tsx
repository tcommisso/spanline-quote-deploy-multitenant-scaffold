import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { isAdminRole } from "@shared/const";

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && user && !isAdminRole(user.role)) {
      setLocation("/");
    }
  }, [user, loading, setLocation]);

  if (loading) return null;
  if (!user || !isAdminRole(user.role)) return null;

  return <>{children}</>;
}
