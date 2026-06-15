import { HelpCircle } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HelpLinkProps {
  /** The section ID to scroll to on the Help Guide page (e.g., "work-schedule") */
  section: string;
  /** Optional tooltip text */
  tooltip?: string;
  /** Optional className for custom styling */
  className?: string;
}

/**
 * A contextual help icon that navigates to the Help Guide page
 * and scrolls to the relevant section.
 */
export function HelpLink({ section, tooltip = "View help for this section", className }: HelpLinkProps) {
  const [, setLocation] = useLocation();

  const handleClick = () => {
    setLocation(`/help?section=${section}`);
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 text-muted-foreground hover:text-foreground ${className || ""}`}
          onClick={handleClick}
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
