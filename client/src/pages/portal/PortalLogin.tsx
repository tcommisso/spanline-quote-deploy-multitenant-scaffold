import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { usePortal } from "@/contexts/PortalContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Mail, Loader2, CheckCircle } from "lucide-react";

export default function PortalLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [, setLocation] = useLocation();
  const { login, isAuthenticated } = usePortal();

  // Handle token from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const magicToken = params.get("magic");
    
    if (magicToken) {
      // Magic link token (from email)
      verifyMagicLink(magicToken);
    } else if (token) {
      // Direct access token from portal link (admin-generated)
      verifyDirectToken(token);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/portal/dashboard");
    }
  }, [isAuthenticated]);

  const requestMagicLink = trpc.portal.requestMagicLink.useMutation({
    onSuccess: () => {
      setSent(true);
      toast.success("Magic link sent! Check your email.");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to send magic link");
    },
  });

  const verifyMagicLinkMutation = trpc.portal.verifyMagicLink.useMutation({
    onSuccess: (data) => {
      if (data) {
        login(data.sessionToken);
        toast.success("Welcome back!");
        setLocation("/portal/dashboard");
      }
    },
    onError: () => {
      toast.error("Invalid or expired link. Please request a new one.");
    },
  });

  const verifyPortalToken = trpc.portal.verifyPortalToken.useMutation({
    onSuccess: (data) => {
      if (data) {
        login(data.sessionToken);
        toast.success(`Welcome, ${data.clientName}!`);
        setLocation("/portal/dashboard");
      }
    },
    onError: () => {
      toast.error("Invalid portal access link. Please contact your project team.");
    },
  });

  function verifyMagicLink(token: string) {
    verifyMagicLinkMutation.mutate({ token });
  }

  function verifyDirectToken(token: string) {
    verifyPortalToken.mutate({ token });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    requestMagicLink.mutate({ email, origin: window.location.origin });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-primary/10 to-accent/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {import.meta.env.VITE_APP_LOGO ? (
            <img src={import.meta.env.VITE_APP_LOGO} alt="Altaspan" className="mx-auto mb-4 h-14 w-auto object-contain" />
          ) : (
            <div className="mx-auto mb-4 w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Mail className="w-8 h-8 text-primary" />
            </div>
          )}
          <CardTitle className="text-2xl">Client Portal</CardTitle>
          <CardDescription>
            Access your project status, documents, invoices and more
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="text-center space-y-4">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <p className="text-sm text-muted-foreground">
                We've sent a login link to <strong>{email}</strong>. Check your inbox and click the link to access your portal.
              </p>
              <Button variant="ghost" onClick={() => setSent(false)}>
                Try a different email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  type="email"
                  placeholder="Enter your email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={requestMagicLink.isPending}
              >
                {requestMagicLink.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
                ) : (
                  "Send Login Link"
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Enter the email address associated with your project to receive a secure login link.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
