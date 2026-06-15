import { useTheme, type ColorScheme, COLOR_SCHEME_LABELS } from "@/contexts/ThemeContext";
import { Palette, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

const SCHEME_SWATCHES: Record<string, string> = {
  default: "bg-[oklch(0.45_0.12_200)]",    // teal
  altaspan: "bg-[oklch(0.76_0.10_80)]",    // gold #C9AB57
  spanline: "bg-[oklch(0.38_0.10_248)]",   // navy #004677
  purple: "bg-[oklch(0.50_0.18_290)]",     // purple
  forest: "bg-[oklch(0.45_0.14_155)]",     // green
  slate: "bg-[oklch(0.42_0.01_260)]",      // grey
};

const SCHEMES: ColorScheme[] = ["altaspan", "spanline", "default", "purple", "forest", "slate"];

export function ThemeSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { colorScheme, setColorScheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-sidebar-accent/50 transition-colors w-full text-left focus:outline-none"
          title="Change colour scheme"
        >
          <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 border border-sidebar-border/50">
            <Palette className="h-3.5 w-3.5 text-sidebar-foreground/70" />
          </div>
          {!collapsed && (
            <span className="text-[12px] text-sidebar-foreground/60 truncate">
              Theme
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-52">
        <DropdownMenuLabel className="text-xs font-medium">Colour Scheme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SCHEMES.map((scheme) => (
          <DropdownMenuItem
            key={scheme}
            onClick={() => setColorScheme(scheme)}
            className="flex items-center gap-3 cursor-pointer"
          >
            <div className={`h-4 w-4 rounded-full ${SCHEME_SWATCHES[scheme]} shrink-0 ring-1 ring-border/30`} />
            <span className="flex-1 text-sm">{COLOR_SCHEME_LABELS[scheme]}</span>
            {colorScheme === scheme && (
              <Check className="h-3.5 w-3.5 text-primary shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
