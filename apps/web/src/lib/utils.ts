import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** ₹10,00,000 from paise. */
export function formatPaise(paise: number | null | undefined) {
  if (paise == null) return "—";
  return inr.format(Math.round(paise / 100));
}

/** ₹1,284 cr / ₹35 L style short amounts. */
export function formatCrore(paise: number) {
  const rupees = paise / 100;
  if (rupees >= 1e7) return `₹${(rupees / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 2 })} cr`;
  if (rupees >= 1e5) return `₹${(rupees / 1e5).toLocaleString("en-IN", { maximumFractionDigits: 2 })} L`;
  return inr.format(rupees);
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Kolkata",
});

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return dateFmt.format(typeof d === "string" ? new Date(`${d.length === 10 ? `${d}T00:00:00+05:30` : d}`) : d);
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "—";
  return `${dateTimeFmt.format(typeof d === "string" ? new Date(d) : d)} IST`;
}
