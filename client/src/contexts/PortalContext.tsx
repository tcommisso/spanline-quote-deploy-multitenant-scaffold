import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";

interface PortalUser {
  clientName: string;
  clientEmail: string;
  jobId: number;
  jobStatus: string;
}

interface PortalContextType {
  user: PortalUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionToken: string | null;
  login: (token: string) => void;
  logout: () => void;
}

const PortalContext = createContext<PortalContextType | null>(null);

export function PortalProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(() =>
    localStorage.getItem("portal_session_token")
  );

  const meQuery = trpc.portal.me.useQuery(undefined, {
    enabled: !!sessionToken,
    retry: false,
  });

  const user: PortalUser | null = meQuery.data
    ? {
        clientName: meQuery.data.clientName || meQuery.data.job?.clientName || "Client",
        clientEmail: meQuery.data.clientEmail || "",
        jobId: meQuery.data.job?.id || 0,
        jobStatus: meQuery.data.job?.status || "unknown",
      }
    : null;

  function login(token: string) {
    localStorage.setItem("portal_session_token", token);
    setSessionToken(token);
  }

  function logout() {
    localStorage.removeItem("portal_session_token");
    setSessionToken(null);
  }

  return (
    <PortalContext.Provider
      value={{
        user,
        isLoading: meQuery.isLoading,
        isAuthenticated: !!user,
        sessionToken,
        login,
        logout,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
}

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal must be used within PortalProvider");
  return ctx;
}
