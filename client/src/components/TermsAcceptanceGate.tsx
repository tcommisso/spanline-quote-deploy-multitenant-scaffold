import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { TermsContent, TERMS_VERSION, TERMS_LAST_UPDATED } from "@/pages/TermsAndConditions";
import { Shield } from "lucide-react";
import { toast } from "sonner";

interface TermsAcceptanceGateProps {
  children: React.ReactNode;
}

export function TermsAcceptanceGate({ children }: TermsAcceptanceGateProps) {
  const { user, loading } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const utils = trpc.useUtils();

  const acceptMutation = trpc.auth.acceptTerms.useMutation({
    onSuccess: () => {
      toast.success("Terms accepted. Welcome to AltaSpan.");
      utils.auth.me.invalidate();
    },
    onError: (err) => {
      toast.error("Failed to record acceptance: " + err.message);
    },
  });

  // Still loading auth state
  if (loading || !user) {
    return <>{children}</>;
  }

  // User has already accepted the current version
  if (user.termsAcceptedAt && user.termsVersion === TERMS_VERSION) {
    return <>{children}</>;
  }

  // Show acceptance gate
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-3xl shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">
            {user.termsAcceptedAt ? "Updated Terms and Conditions" : "Terms and Conditions"}
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {user.termsAcceptedAt
              ? `Our terms have been updated to version ${TERMS_VERSION}. Please review and accept the new terms to continue.`
              : "Please review and accept the following terms to continue using the platform."}
          </p>
          <p className="text-xs text-muted-foreground">
            Version {TERMS_VERSION} — Last updated: {TERMS_LAST_UPDATED}
          </p>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg p-4 bg-muted/30">
            <TermsContent maxHeight="h-[400px]" />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <label className="flex items-start gap-3 cursor-pointer w-full">
            <Checkbox
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked === true)}
              className="mt-0.5"
            />
            <span className="text-sm leading-relaxed">
              I have read, understood, and agree to be bound by these Terms and Conditions. I acknowledge that the Platform and all associated intellectual property belong to Anthony Commisso and that unauthorised copying or misuse is prohibited.
            </span>
          </label>
          <Button
            className="w-full"
            size="lg"
            disabled={!agreed || acceptMutation.isPending}
            onClick={() => acceptMutation.mutate({ version: TERMS_VERSION })}
          >
            {acceptMutation.isPending ? "Processing..." : "Accept & Continue"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
