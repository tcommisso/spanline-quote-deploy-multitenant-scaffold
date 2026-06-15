import { createContext, useContext, useState, type ReactNode } from "react";
import { trpc } from "@/lib/trpc";

interface TradePortalUser {
  installerId: number;
  installerName: string;
  installerEmail: string;
  phone: string | null;
  tradeType: string | null;
  speciality: string | null;
}

interface TradePortalContextType {
  user: TradePortalUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionToken: string | null;
  login: (token: string) => void;
  logout: () => void;
}

const TradePortalContext = createContext<TradePortalContextType | null>(null);

export function TradePortalProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(() =>
    localStorage.getItem("trade_portal_session_token")
  );

  const meQuery = trpc.tradePortal.me.useQuery(undefined, {
    enabled: !!sessionToken,
    retry: false,
  });

  const user: TradePortalUser | null = meQuery.data
    ? {
        installerId: meQuery.data.installerId,
        installerName: meQuery.data.installerName,
        installerEmail: meQuery.data.installerEmail,
        phone: meQuery.data.phone,
        tradeType: meQuery.data.tradeType,
        speciality: meQuery.data.speciality,
      }
    : null;

  function login(token: string) {
    localStorage.setItem("trade_portal_session_token", token);
    setSessionToken(token);
  }

  function logout() {
    localStorage.removeItem("trade_portal_session_token");
    setSessionToken(null);
  }

  return (
    <TradePortalContext.Provider
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
    </TradePortalContext.Provider>
  );
}

export function useTradePortal() {
  const ctx = useContext(TradePortalContext);
  if (!ctx) throw new Error("useTradePortal must be used within TradePortalProvider");
  return ctx;
}
