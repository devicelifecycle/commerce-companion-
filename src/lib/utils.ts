import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Convert a snake_case or lowercase status string to Title Case display.
 *  e.g. "pending" → "Pending", "in_stock" → "In Stock", "revenue_only" → "Revenue Only"
 */
export function formatStatus(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
