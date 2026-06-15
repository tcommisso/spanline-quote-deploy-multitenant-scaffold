/**
 * Vanilla (non-React) tRPC client for imperative calls
 * Used in PDF generation and other non-hook contexts.
 */
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";

export const trpcVanilla = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        const headers: Record<string, string> = {};
        const portalToken = localStorage.getItem("portal_session_token");
        if (portalToken) {
          headers["x-portal-session"] = portalToken;
        }
        const tradePortalToken = localStorage.getItem("trade_portal_session_token");
        if (tradePortalToken) {
          headers["x-trade-portal-session"] = tradePortalToken;
        }
        return headers;
      },
    }),
  ],
});
