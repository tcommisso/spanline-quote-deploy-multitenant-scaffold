import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { X, ChevronLeft, ChevronRight, HelpCircle } from "lucide-react";
import { createPortal } from "react-dom";

export interface TourStep {
  /** CSS selector for the target element to highlight */
  target: string;
  /** Title of the step */
  title: string;
  /** Description/content of the step */
  content: string;
  /** Position of the tooltip relative to the target */
  position?: "top" | "bottom" | "left" | "right";
}

interface OnboardingTourProps {
  /** Unique key for persisting completion state */
  tourId: string;
  /** Steps to show in the tour */
  steps: TourStep[];
  /** Whether the tour is currently active */
  active: boolean;
  /** Callback when tour is completed or dismissed */
  onComplete: () => void;
}

function getElementRect(selector: string): DOMRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  return el.getBoundingClientRect();
}

function TooltipOverlay({
  steps,
  currentStep,
  onNext,
  onPrev,
  onClose,
}: {
  steps: TourStep[];
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const step = steps[currentStep];
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateRect = () => {
      const r = getElementRect(step.target);
      setRect(r);
      // Scroll element into view if needed
      if (r) {
        const el = document.querySelector(step.target);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
    updateRect();
    // Re-measure on resize/scroll
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [step.target, currentStep]);

  // Recalculate after scroll settles
  useEffect(() => {
    const timer = setTimeout(() => {
      const r = getElementRect(step.target);
      setRect(r);
    }, 400);
    return () => clearTimeout(timer);
  }, [currentStep, step.target]);

  const position = step.position || "bottom";

  // Calculate tooltip position
  const getTooltipStyle = (): React.CSSProperties => {
    if (!rect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

    const padding = 12;
    const tooltipWidth = 320;

    switch (position) {
      case "top":
        return {
          bottom: window.innerHeight - rect.top + padding,
          left: Math.max(16, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 16)),
        };
      case "bottom":
        return {
          top: rect.bottom + padding,
          left: Math.max(16, Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 16)),
        };
      case "left":
        return {
          top: rect.top + rect.height / 2 - 60,
          right: window.innerWidth - rect.left + padding,
        };
      case "right":
        return {
          top: rect.top + rect.height / 2 - 60,
          left: rect.right + padding,
        };
      default:
        return {
          top: rect.bottom + padding,
          left: Math.max(16, rect.left + rect.width / 2 - tooltipWidth / 2),
        };
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop overlay */}
      <div className="absolute inset-0 bg-black/50 transition-opacity" onClick={onClose} />

      {/* Highlight cutout */}
      {rect && (
        <div
          className="absolute border-2 border-primary rounded-lg shadow-lg shadow-primary/20 pointer-events-none transition-all duration-300"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
            background: "transparent",
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute bg-popover text-popover-foreground border rounded-xl shadow-xl p-4 w-[320px] animate-in fade-in slide-in-from-bottom-2 duration-200"
        style={getTooltipStyle()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 p-1 rounded-md hover:bg-muted text-muted-foreground"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Step counter */}
        <div className="text-xs text-muted-foreground mb-1">
          Step {currentStep + 1} of {steps.length}
        </div>

        {/* Content */}
        <h4 className="font-semibold text-sm mb-1">{step.title}</h4>
        <p className="text-sm text-muted-foreground leading-relaxed">{step.content}</p>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPrev}
            disabled={currentStep === 0}
            className="h-8"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="flex gap-1">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  idx === currentStep ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
          {currentStep < steps.length - 1 ? (
            <Button size="sm" onClick={onNext} className="h-8">
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={onClose} className="h-8">
              Done
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function OnboardingTour({ tourId, steps, active, onComplete }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      handleClose();
    }
  }, [currentStep, steps.length]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const handleClose = useCallback(() => {
    setCurrentStep(0);
    // Mark as completed in localStorage
    localStorage.setItem(`tour_completed_${tourId}`, "true");
    onComplete();
  }, [tourId, onComplete]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, handleClose, handleNext, handlePrev]);

  if (!active) return null;

  return (
    <TooltipOverlay
      steps={steps}
      currentStep={currentStep}
      onNext={handleNext}
      onPrev={handlePrev}
      onClose={handleClose}
    />
  );
}

/** Check if a tour has been completed */
export function isTourCompleted(tourId: string): boolean {
  return localStorage.getItem(`tour_completed_${tourId}`) === "true";
}

/** Reset a tour so it can be shown again */
export function resetTour(tourId: string): void {
  localStorage.removeItem(`tour_completed_${tourId}`);
}

/** Help button that triggers a tour */
export function TourHelpButton({
  onClick,
  label = "Take a Tour",
  className,
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className={`gap-1.5 ${className || ''}`}>
      <HelpCircle className="w-4 h-4" />
      {label}
    </Button>
  );
}
