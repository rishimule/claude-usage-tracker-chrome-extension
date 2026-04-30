export type ColorTier = "green" | "yellow" | "orange" | "red";

export function usageColor(pct: number): ColorTier {
  if (pct >= 90) return "red";
  if (pct >= 70) return "orange";
  if (pct >= 50) return "yellow";
  return "green";
}
