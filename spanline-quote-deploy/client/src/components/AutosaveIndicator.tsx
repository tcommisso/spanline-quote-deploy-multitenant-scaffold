/**
 * AutosaveIndicator — small inline status badge showing autosave state.
 */
import { type AutosaveStatus } from "@/hooks/useAutosave";
import { Check, Loader2, AlertCircle, Cloud } from "lucide-react";

interface AutosaveIndicatorProps {
  status: AutosaveStatus;
  className?: string;
}

export function AutosaveIndicator({ status, className = "" }: AutosaveIndicatorProps) {
  if (status === "idle") return null;

  return (
    <span className={`inline-flex items-center gap-1 text-xs ${className}`}>
      {status === "saving" && (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Saving...</span>
        </>
      )}
      {status === "saved" && (
        <>
          <Check className="h-3 w-3 text-green-600" />
          <span className="text-green-600">Saved</span>
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle className="h-3 w-3 text-destructive" />
          <span className="text-destructive">Save failed</span>
        </>
      )}
    </span>
  );
}
