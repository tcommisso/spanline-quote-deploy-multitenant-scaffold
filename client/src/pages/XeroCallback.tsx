import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function XeroCallback() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState("");

  const handleCallback = trpc.xero.handleCallback.useMutation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");

    if (error) {
      setStatus("error");
      setErrorMessage(params.get("error_description") || "Xero authorization was denied");
      setTimeout(() => navigate("/xero-settings"), 3000);
      return;
    }

    if (!code) {
      setStatus("error");
      setErrorMessage("No authorization code received from Xero");
      setTimeout(() => navigate("/xero-settings"), 3000);
      return;
    }

    // Exchange the code for tokens
    handleCallback.mutateAsync({
      code,
      origin: window.location.origin,
    }).then(() => {
      setStatus("success");
      setTimeout(() => navigate("/xero-settings"), 2000);
    }).catch((err) => {
      setStatus("error");
      setErrorMessage(err.message || "Failed to complete Xero connection");
      setTimeout(() => navigate("/xero-settings"), 3000);
    });
  }, []);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center space-y-4">
        {status === "processing" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <h2 className="text-xl font-semibold">Connecting to Xero...</h2>
            <p className="text-muted-foreground">Please wait while we complete the connection.</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
            <h2 className="text-xl font-semibold">Connected Successfully!</h2>
            <p className="text-muted-foreground">Redirecting to Xero settings...</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle className="h-12 w-12 mx-auto text-destructive" />
            <h2 className="text-xl font-semibold">Connection Failed</h2>
            <p className="text-muted-foreground">{errorMessage}</p>
            <p className="text-sm text-muted-foreground">Redirecting back to settings...</p>
          </>
        )}
      </div>
    </div>
  );
}
