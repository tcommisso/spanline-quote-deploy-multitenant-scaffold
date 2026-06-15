import { useState, useEffect, useCallback } from "react";

const PUSH_DISMISSED_KEY = "push-notification-dismissed";
const PUSH_SUBSCRIBED_KEY = "push-notification-subscribed";

interface UsePushNotificationsOptions {
  /** The VAPID public key for push subscription */
  vapidPublicKey: string | undefined;
  /** Function to call the subscribe mutation */
  onSubscribe: (params: { endpoint: string; p256dh: string; auth: string }) => Promise<unknown>;
  /** Function to call the unsubscribe mutation */
  onUnsubscribe: (params: { endpoint: string }) => Promise<unknown>;
}

interface UsePushNotificationsReturn {
  /** Whether push notifications are supported by the browser */
  isSupported: boolean;
  /** Whether the user has already subscribed */
  isSubscribed: boolean;
  /** Whether the user dismissed the opt-in prompt */
  isDismissed: boolean;
  /** Whether a subscription operation is in progress */
  isLoading: boolean;
  /** Current notification permission state */
  permission: NotificationPermission | "unsupported";
  /** Subscribe to push notifications */
  subscribe: () => Promise<void>;
  /** Unsubscribe from push notifications */
  unsubscribe: () => Promise<void>;
  /** Dismiss the opt-in prompt */
  dismiss: () => void;
  /** Reset dismissed state (e.g., from settings) */
  resetDismissed: () => void;
}

/**
 * Convert a base64 VAPID key to a Uint8Array for PushManager.subscribe()
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(options: UsePushNotificationsOptions): UsePushNotificationsReturn {
  const { vapidPublicKey, onSubscribe, onUnsubscribe } = options;

  const isSupported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const [isSubscribed, setIsSubscribed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(PUSH_SUBSCRIBED_KEY) === "true";
  });

  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(PUSH_DISMISSED_KEY) === "true";
  });

  const [isLoading, setIsLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => {
    if (!isSupported) return "unsupported";
    return Notification.permission;
  });

  // Check existing subscription on mount
  useEffect(() => {
    if (!isSupported) return;

    const checkExisting = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (existing) {
          setIsSubscribed(true);
          localStorage.setItem(PUSH_SUBSCRIBED_KEY, "true");
        } else {
          setIsSubscribed(false);
          localStorage.removeItem(PUSH_SUBSCRIBED_KEY);
        }
      } catch {
        // Silently fail - SW might not be ready yet
      }
    };

    checkExisting();
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !vapidPublicKey) return;
    setIsLoading(true);

    try {
      // Request notification permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== "granted") {
        setIsLoading(false);
        return;
      }

      // Get the service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });

      // Extract keys
      const json = subscription.toJSON();
      const endpoint = json.endpoint!;
      const p256dh = json.keys!.p256dh!;
      const auth = json.keys!.auth!;

      // Send to server
      await onSubscribe({ endpoint, p256dh, auth });

      setIsSubscribed(true);
      localStorage.setItem(PUSH_SUBSCRIBED_KEY, "true");
      localStorage.removeItem(PUSH_DISMISSED_KEY);
      setIsDismissed(false);
    } catch (err) {
      console.error("[Push] Subscribe failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, vapidPublicKey, onSubscribe]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await onUnsubscribe({ endpoint });
      }

      setIsSubscribed(false);
      localStorage.removeItem(PUSH_SUBSCRIBED_KEY);
    } catch (err) {
      console.error("[Push] Unsubscribe failed:", err);
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, onUnsubscribe]);

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    localStorage.setItem(PUSH_DISMISSED_KEY, "true");
  }, []);

  const resetDismissed = useCallback(() => {
    setIsDismissed(false);
    localStorage.removeItem(PUSH_DISMISSED_KEY);
  }, []);

  return {
    isSupported,
    isSubscribed,
    isDismissed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
    dismiss,
    resetDismissed,
  };
}
