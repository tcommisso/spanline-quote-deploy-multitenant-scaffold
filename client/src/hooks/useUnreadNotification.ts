/**
 * useUnreadNotification — Plays a subtle notification sound and triggers
 * haptic vibration when the unread message count increases while the app is open.
 */
import { useEffect, useRef } from "react";

const NOTIFICATION_SOUND_URL = "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgipGBcGBkbICRj4F1aGd2hIuEfHh3fIKFg4B+fYCDhIOBf36AgoODgoGAgIGCg4KBgYCBgoKCgoGBgYGCgoKBgYGBgoKCgYGBgYKCgoGBgYGBgoKBgYGBgYGCgoGBgYGBgYKCgYGBgYGBgoKBgYGBgYGCgoGBgYGBgYGCgYGBgYGBgYKBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgQ==";

export function useUnreadNotification(currentCount: number) {
  const prevCountRef = useRef<number>(currentCount);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isFirstRender = useRef(true);

  // Initialize audio element once
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    audioRef.current.volume = 0.3;
    return () => {
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    // Skip the first render to avoid notification on page load
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevCountRef.current = currentCount;
      return;
    }

    // Only notify when count increases (not decreases from reading messages)
    if (currentCount > prevCountRef.current) {
      // Play sound
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {
          // Browser may block autoplay — silently ignore
        });
      }

      // Haptic vibration (mobile)
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    }

    prevCountRef.current = currentCount;
  }, [currentCount]);
}
