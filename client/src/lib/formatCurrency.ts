/**
 * Format a currency value for KPI display.
 * Uses abbreviated format: $1.2M, $125k, $950
 * Lowercase 'k' per Altaspan convention.
 */
export function formatCurrencyShort(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
  if (value > 0) return `$${value.toFixed(0)}`;
  if (value === 0) return "$0";
  // Negative values
  if (value <= -1_000_000) return `-$${(Math.abs(value) / 1_000_000).toFixed(1)}M`;
  if (value <= -1_000) return `-$${(Math.abs(value) / 1_000).toFixed(0)}k`;
  return `-$${Math.abs(value).toFixed(0)}`;
}

/**
 * Format a currency value in full (non-abbreviated).
 * e.g. $1,234,567
 */
export function formatCurrencyFull(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}
