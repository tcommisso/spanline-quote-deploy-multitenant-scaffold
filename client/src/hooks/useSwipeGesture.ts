import { useEffect, useRef, useCallback } from "react";

interface SwipeOptions {
  /** Minimum distance in px to qualify as a swipe (default: 50) */
  threshold?: number;
  /** Maximum vertical movement allowed (default: 100) */
  maxVertical?: number;
  /** Element ref to attach listeners to. If not provided, uses document */
  elementRef?: React.RefObject<HTMLElement | null>;
  /** Whether the swipe detection is enabled */
  enabled?: boolean;
}

interface SwipeCallbacks {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

/**
 * Hook to detect horizontal swipe gestures on touch devices.
 * Useful for opening/closing mobile navigation panels.
 */
export function useSwipeGesture(
  callbacks: SwipeCallbacks,
  options: SwipeOptions = {}
) {
  const { threshold = 50, maxVertical = 100, elementRef, enabled = true } = options;
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchStart.current) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStart.current.x;
    const deltaY = Math.abs(touch.clientY - touchStart.current.y);

    // Only trigger if horizontal movement exceeds threshold
    // and vertical movement is within tolerance
    if (Math.abs(deltaX) >= threshold && deltaY <= maxVertical) {
      if (deltaX > 0) {
        callbacksRef.current.onSwipeRight?.();
      } else {
        callbacksRef.current.onSwipeLeft?.();
      }
    }

    touchStart.current = null;
  }, [threshold, maxVertical]);

  useEffect(() => {
    if (!enabled) return;

    const target = elementRef?.current || document;
    target.addEventListener("touchstart", handleTouchStart as EventListener, { passive: true });
    target.addEventListener("touchend", handleTouchEnd as EventListener, { passive: true });

    return () => {
      target.removeEventListener("touchstart", handleTouchStart as EventListener);
      target.removeEventListener("touchend", handleTouchEnd as EventListener);
    };
  }, [enabled, elementRef, handleTouchStart, handleTouchEnd]);
}

/**
 * Hook specifically for mobile nav panels.
 * Swipe right from left edge opens nav, swipe left closes it.
 */
export function useNavSwipe(
  isOpen: boolean,
  setOpen: (open: boolean) => void,
  options: { edgeWidth?: number; enabled?: boolean } = {}
) {
  const { edgeWidth = 30, enabled = true } = options;
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      const x = e.touches[0].clientX;
      touchStartX.current = x;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null) return;
      const startX = touchStartX.current;
      const endX = e.changedTouches[0].clientX;
      const deltaX = endX - startX;
      const deltaY = Math.abs(e.changedTouches[0].clientY - e.touches?.[0]?.clientY || 0);

      // Swipe right from left edge to open
      if (!isOpen && startX <= edgeWidth && deltaX > 50) {
        setOpen(true);
      }

      touchStartX.current = null;
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isOpen, setOpen, edgeWidth, enabled]);
}
