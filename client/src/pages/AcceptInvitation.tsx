import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { CheckCircle2, XCircle, Loader2, UserPlus } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";

export default function AcceptInvitation({ token }: { token: string }) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const [accepted, setAccepted] = useState(false);

  const { data, isLoading, error } = trpc.invitations.validateToken.useQuery({ token });

  const acceptMutation = trpc.invitations.accept.useMutation({
    onSuccess: (result) => {
      setAccepted(true);
      toast.success(`Welcome! You've been assigned the ${result.role.replace(/_/g, " ")} role.`);
      setTimeout(() => navigate("/"), 3000);
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.valid || !data.invitation) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="py-8 text-center">
            <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-semibold mb-2">Invalid Invitation</h2>
            <p className="text-muted-foreground">
              This invitation link is invalid, has expired, or has already been used.
            </p>
            <Button className="mt-6" onClick={() => navigate("/")}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="py-8 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-600" />
            <h2 className="text-xl font-semibold mb-2">Invitation Accepted!</h2>
            <p className="text-muted-foreground">
              Your account has been set up. Redirecting to the dashboard...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const inv = data.invitation;

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <UserPlus className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-xl">You're Invited!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Invited by</span>
              <span className="text-sm font-medium">{inv.invitedByName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Your role</span>
              <Badge variant="secondary">{inv.role.replace(/_/g, " ")}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm">{inv.email}</span>
            </div>
          </div>

          {user && (
            <p className="text-sm text-muted-foreground text-center">
              Logged in as <strong>{user.name || user.email}</strong>
            </p>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={() => acceptMutation.mutate({ token })}
            disabled={acceptMutation.isPending}
          >
            {acceptMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Accepting...</>
            ) : (
              "Accept Invitation"
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            By accepting, your account will be assigned the <strong>{inv.role.replace(/_/g, " ")}</strong> role with the associated permissions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
