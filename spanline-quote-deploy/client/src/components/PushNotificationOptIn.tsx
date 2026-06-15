import { Bell, X } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { Button } from "@/components/ui/button";

interface PushNotificationOptInProps {
  vapidPublicKey: string | undefined;
  onSubscribe: (params: { endpoint: string; p256dh: string; auth: string }) => Promise<unknown>;
  onUnsubscribe: (params: { endpoint: string }) => Promise<unknown>;
}

/**
 * A subtle opt-in banner for push notifications.
 * Shows only when:
 * - Push is supported
 * - User hasn't already subscribed
 * - User hasn't dismissed the prompt
 * - Permission hasn't been denied
 */
export function PushNotificationOptIn({ vapidPublicKey, onSubscribe, onUnsubscribe }: PushNotificationOptInProps) {
  const {
    isSupported,
    isSubscribed,
    isDismissed,
    isLoading,
    permission,
    subscribe,
    dismiss,
  } = usePushNotifications({ vapidPublicKey, onSubscribe, onUnsubscribe });

  // Don't show if not supported, already subscribed, dismissed, or permission denied
  if (!isSupported || isSubscribed || isDismissed || permission === "denied" || !vapidPublicKey) {
    return null;
  }

  return (
    <div className="mx-3 mb-3 rounded-lg border border-border bg-card p-3 shadow-sm animate-in slide-in-from-top-2 duration-300">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Bell className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Enable notifications</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Get instant updates on project progress, documents, and messages.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Button
              size="sm"
              onClick={subscribe}
              disabled={isLoading}
              className="h-7 text-xs px-3"
            >
              {isLoading ? "Enabling..." : "Enable"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={dismiss}
              className="h-7 text-xs px-2 text-muted-foreground"
            >
              Not now
            </Button>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
