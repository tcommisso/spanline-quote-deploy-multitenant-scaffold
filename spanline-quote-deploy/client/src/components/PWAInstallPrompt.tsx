import { useState, useEffect } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "pwa-install-dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Check if dismissed recently
    const dismissedAt = localStorage.getItem(DISMISSED_KEY);
    if (dismissedAt && Date.now() - parseInt(dismissedAt) < DISMISS_DURATION_MS) return;

    // Detect iOS (Safari doesn't support beforeinstallprompt)
    const ua = navigator.userAgent;
    const isiOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(isiOS);

    if (isiOS) {
      // Show iOS-specific instructions after a short delay
      const timer = setTimeout(() => setShowBanner(true), 3000);
      return () => clearTimeout(timer);
    }

    // Listen for the beforeinstallprompt event (Chrome, Edge, etc.)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowBanner(true), 2000);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setShowBanner(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowBanner(false);
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:bottom-6 md:w-80 z-[70] animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card border border-border rounded-xl shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Download className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm text-foreground">Install App</h4>
            {isIOS ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                Tap the share button <span className="inline-block align-middle">⎙</span> then "Add to Home Screen" for the best experience.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">
                Install for quick access, offline support, and a native app experience.
              </p>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 rounded-md hover:bg-muted text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {!isIOS && (
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="outline" className="flex-1" onClick={handleDismiss}>
              Not now
            </Button>
            <Button size="sm" className="flex-1" onClick={handleInstall}>
              Install
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
