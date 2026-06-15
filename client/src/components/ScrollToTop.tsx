import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp } from "lucide-react";
import { useIsMobile } from "@/hooks/useMobile";

/**
 * Floating "scroll to top" button that appears when the user scrolls down.
 * On mobile, positioned above the bottom navigation bar.
 */
export function ScrollToTop({ threshold = 300 }: { threshold?: number }) {
  const [visible, setVisible] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > threshold);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [threshold]);

  const scrollToTop = () => {
    if (isMobile && navigator.vibrate) navigator.vibrate(10);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!visible) return null;

  return (
    <Button
      variant="secondary"
      size="icon"
      className={`fixed z-50 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 h-10 w-10 opacity-80 hover:opacity-100 ${
        isMobile ? "bottom-20 right-4" : "bottom-6 right-6"
      }`}
      onClick={scrollToTop}
      aria-label="Scroll to top"
    >
      <ArrowUp className="h-5 w-5" />
    </Button>
  );
}
