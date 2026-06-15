import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";

export type ColorScheme = "default" | "altaspan" | "spanline" | "purple" | "forest" | "slate" | "custom";
export type ThemeMode = "light" | "dark";

interface ThemeContextType {
  mode: ThemeMode;
  colorScheme: ColorScheme;
  setMode: (mode: ThemeMode) => void;
  setColorScheme: (scheme: ColorScheme) => void;
  /** Legacy compat */
  theme: ThemeMode;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const SCHEME_KEY = "color-scheme";
const MODE_KEY = "theme";

/** Migrate legacy 'default' (teal) to 'altaspan' as the new default */
function migrateColorScheme(stored: string | null): ColorScheme {
  if (!stored || stored === "default") return "altaspan";
  return stored as ColorScheme;
}

export const COLOR_SCHEME_LABELS: Record<ColorScheme, string> = {
  default: "Teal",
  altaspan: "Altaspan",
  spanline: "Spanline",
  purple: "Purple",
  forest: "Forest Green",
  slate: "Slate Grey",
  custom: "Custom",
};

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemeMode;
  switchable?: boolean;
}

/**
 * Convert a hex colour (#RRGGBB) to an oklch() string.
 * Uses the correct linear sRGB → LMS → OKLab → OKLCH pipeline.
 */
function hexToOklch(hex: string): string {
  // Parse hex
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // sRGB to linear RGB
  const rl = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const gl = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const bl = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  // Linear RGB to LMS (using the correct OKLab matrix)
  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

  // LMS to OKLab (cube root then matrix)
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bVal = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  // OKLab to OKLCH
  const C = Math.sqrt(a * a + bVal * bVal);
  const H = (Math.atan2(bVal, a) * 180) / Math.PI;
  const hue = H < 0 ? H + 360 : H;

  return `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${hue.toFixed(1)})`;
}

/**
 * Lighten an oklch string by adding to the L component.
 */
function lightenOklch(oklchStr: string, amount: number): string {
  const match = oklchStr.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
  if (!match) return oklchStr;
  const L = Math.min(1, parseFloat(match[1]) + amount);
  return `oklch(${L.toFixed(3)} ${match[2]} ${match[3]})`;
}

/**
 * Darken an oklch string by subtracting from the L component.
 */
function darkenOklch(oklchStr: string, amount: number): string {
  const match = oklchStr.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
  if (!match) return oklchStr;
  const L = Math.max(0, parseFloat(match[1]) - amount);
  return `oklch(${L.toFixed(3)} ${match[2]} ${match[3]})`;
}

/**
 * Apply custom colour overrides to CSS variables on :root
 */
function applyCustomColors(colors: { primary: string; accent: string; sidebar: string }) {
  const root = document.documentElement;
  
  // Convert hex to oklch values for CSS variables
  const primaryOklch = hexToOklch(colors.primary);
  const accentOklch = hexToOklch(colors.accent);
  const sidebarOklch = hexToOklch(colors.sidebar);

  // Derive sidebar variants
  const sidebarAccentOklch = lightenOklch(sidebarOklch, 0.06);
  const sidebarBorderOklch = darkenOklch(sidebarOklch, 0.05);

  // Apply all custom colour overrides
  root.style.setProperty("--primary", primaryOklch);
  root.style.setProperty("--primary-foreground", "oklch(0.98 0 0)");
  root.style.setProperty("--ring", primaryOklch);
  root.style.setProperty("--accent", accentOklch);
  root.style.setProperty("--accent-foreground", "oklch(0.98 0 0)");
  root.style.setProperty("--sidebar", sidebarOklch);
  root.style.setProperty("--sidebar-foreground", "oklch(0.92 0.008 80)");
  root.style.setProperty("--sidebar-primary", accentOklch);
  root.style.setProperty("--sidebar-primary-foreground", "oklch(0.98 0 0)");
  root.style.setProperty("--sidebar-accent", sidebarAccentOklch);
  root.style.setProperty("--sidebar-accent-foreground", "oklch(0.95 0.005 240)");
  root.style.setProperty("--sidebar-border", sidebarBorderOklch);
  root.style.setProperty("--sidebar-ring", accentOklch);
}

/**
 * Remove custom colour overrides from :root
 */
function clearCustomColors() {
  const root = document.documentElement;
  const props = [
    "--primary", "--primary-foreground", "--ring",
    "--accent", "--accent-foreground",
    "--sidebar", "--sidebar-foreground", "--sidebar-primary",
    "--sidebar-primary-foreground", "--sidebar-accent",
    "--sidebar-accent-foreground", "--sidebar-border", "--sidebar-ring",
  ];
  props.forEach(p => root.style.removeProperty(p));
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = true,
}: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(MODE_KEY);
    return (stored as ThemeMode) || defaultTheme;
  });

  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(() => {
    const stored = localStorage.getItem(SCHEME_KEY);
    const migrated = migrateColorScheme(stored);
    if (stored !== migrated) {
      localStorage.setItem(SCHEME_KEY, migrated);
    }
    return migrated;
  });

  // Fetch company-wide theme (public endpoint, works for all users + portals)
  const { data: companyTheme } = trpc.userSettings.getCompanyTheme.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const hasAppliedCompanyTheme = useRef(false);

  // Apply company theme on first load
  useEffect(() => {
    if (companyTheme && !hasAppliedCompanyTheme.current) {
      hasAppliedCompanyTheme.current = true;
      const ct = companyTheme as { preset?: string; customEnabled?: boolean; customColors?: { primary: string; accent: string; sidebar: string } };
      
      if (ct.customEnabled && ct.customColors) {
        // Apply custom colours + set scheme class to the preset as base
        const baseScheme = (ct.preset as ColorScheme) || "altaspan";
        setColorSchemeState(baseScheme);
        localStorage.setItem(SCHEME_KEY, baseScheme);
        // Apply custom overrides after a tick so scheme class is set first
        setTimeout(() => applyCustomColors(ct.customColors!), 0);
      } else if (ct.preset) {
        const scheme = ct.preset as ColorScheme;
        if (scheme !== colorScheme) {
          setColorSchemeState(scheme);
          localStorage.setItem(SCHEME_KEY, scheme);
        }
        clearCustomColors();
      }
    }
  }, [companyTheme]);

  // Also re-apply custom colours when companyTheme changes (e.g. admin saves new theme)
  useEffect(() => {
    if (companyTheme && hasAppliedCompanyTheme.current) {
      const ct = companyTheme as { preset?: string; customEnabled?: boolean; customColors?: { primary: string; accent: string; sidebar: string } };
      if (ct.customEnabled && ct.customColors) {
        applyCustomColors(ct.customColors);
      } else {
        clearCustomColors();
      }
    }
  }, [companyTheme]);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  useEffect(() => {
    const root = document.documentElement;
    // Remove all scheme classes
    root.classList.remove("scheme-default", "scheme-altaspan", "scheme-spanline", "scheme-purple", "scheme-forest", "scheme-slate", "scheme-custom");
    root.classList.add(`scheme-${colorScheme}`);
    localStorage.setItem(SCHEME_KEY, colorScheme);
  }, [colorScheme]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
  }, []);

  const setColorScheme = useCallback((s: ColorScheme) => {
    setColorSchemeState(s);
  }, []);

  const toggleTheme = switchable
    ? () => {
        const newMode = mode === "light" ? "dark" : "light";
        setMode(newMode);
      }
    : undefined;

  return (
    <ThemeContext.Provider
      value={{
        mode,
        colorScheme,
        setMode,
        setColorScheme,
        theme: mode,
        toggleTheme,
        switchable,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
