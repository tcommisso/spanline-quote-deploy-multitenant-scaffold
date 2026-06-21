import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useTradePortal } from "@/contexts/TradePortalContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, CheckCircle } from "lucide-react";

const DEFAULT_ALTASPAN_ICON = "/icons/icon-192.png";

export default function TradePortalLogin() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [, setLocation] = useLocation();
  const { login, isAuthenticated } = useTradePortal();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const magicToken = params.get("magic");

    if (magicToken) {
      verifyMagicLink(magicToken);
    } else if (token) {
      verifyDirectToken(token);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/trade-portal/dashboard");
    }
  }, [isAuthenticated]);

  const requestMagicLink = trpc.tradePortal.requestMagicLink.useMutation({
    onSuccess: () => {
      setSent(true);
      toast.success("Login link sent! Check your email.");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to send login link");
    },
  });

  const verifyMagicLinkMutation = trpc.tradePortal.verifyMagicLink.useMutation({
    onSuccess: (data) => {
      if (data) {
        login(data.sessionToken);
        toast.success(`Welcome, ${data.installerName}!`);
        setLocation("/trade-portal/dashboard");
      }
    },
    onError: () => {
      toast.error("Invalid or expired link. Please request a new one.");
    },
  });

  const verifyTokenMutation = trpc.tradePortal.verifyToken.useMutation({
    onSuccess: (data) => {
      if (data) {
        login(data.sessionToken);
        toast.success(`Welcome, ${data.installerName}!`);
        setLocation("/trade-portal/dashboard");
      }
    },
    onError: () => {
      toast.error("Invalid access link. Please contact the office.");
    },
  });

  function verifyMagicLink(token: string) {
    verifyMagicLinkMutation.mutate({ token });
  }

  function verifyDirectToken(token: string) {
    verifyTokenMutation.mutate({ token });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    requestMagicLink.mutate({ email, origin: window.location.origin });
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-primary/5 via-primary/10 to-accent/5 flex items-center justify-center p-4 safe-area-inset">
      <Card className="w-full max-w-md border-primary/20 shadow-xl">
        <CardHeader className="text-center px-5 sm:px-6">
          <div className="mx-auto mb-3 sm:mb-4 flex flex-col items-center gap-2">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <img src={DEFAULT_ALTASPAN_ICON} alt="Altaspan" className="h-9 w-9 sm:h-10 sm:w-10 object-contain rounded" />
            </div>
            <span className="text-base sm:text-lg font-semibold tracking-wide text-primary">Altaspan</span>
          </div>
          <CardTitle className="text-xl sm:text-2xl">Trade Portal</CardTitle>
          <CardDescription className="text-sm">
            Access your schedule, submit invoices, upload photos and more
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 sm:px-6">
          {sent ? (
            <div className="text-center space-y-4 py-2">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
              <p className="text-sm text-muted-foreground">
                We've sent a login link to <strong className="break-all">{email}</strong>. Check your inbox and click the link to access your portal.
              </p>
              <Button variant="ghost" onClick={() => setSent(false)} className="h-11">
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
                  className="border-primary/20 focus-visible:ring-primary h-12 text-base"
                  required
                  autoComplete="email"
                  inputMode="email"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 text-base"
                disabled={requestMagicLink.isPending}
              >
                {requestMagicLink.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>
                ) : (
                  "Send Login Link"
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground px-2">
                Enter the email address registered with your trade account to receive a secure login link.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
