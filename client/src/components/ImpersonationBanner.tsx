import { trpc } from "@/lib/trpc";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Persistent banner shown at the top of the page when an admin is impersonating another user.
 * Provides the impersonated user's name and a button to stop impersonating.
 */
export function ImpersonationBanner() {
  const { data: status } = trpc.userManagement.getImpersonationStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const utils = trpc.useUtils();
  const stopMut = trpc.userManagement.stopImpersonation.useMutation({
    onSuccess: () => {
      // Invalidate all queries and reload to restore admin view
      utils.invalidate();
      window.location.reload();
    },
  });

  if (!status?.isImpersonating) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="h-4 w-4" />
        <span>
          Impersonating <strong>{status.impersonatedUser?.name || "Unknown"}</strong>
          {status.impersonatedUser?.role && (
            <span className="ml-1 opacity-75">({status.impersonatedUser.role})</span>
          )}
          {status.realUser && (
            <span className="ml-2 opacity-75">— Logged in as {status.realUser.name}</span>
          )}
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 bg-amber-600 border-amber-700 text-white hover:bg-amber-700 hover:text-white text-xs"
        onClick={() => stopMut.mutate()}
        disabled={stopMut.isPending}
      >
        <X className="h-3 w-3 mr-1" />
        {stopMut.isPending ? "Stopping..." : "Stop Impersonating"}
      </Button>
    </div>
  );
}
