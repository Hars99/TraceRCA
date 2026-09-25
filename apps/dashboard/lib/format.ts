import type { EventType } from "./types";

export function formatNumber(value: number | undefined | null): string {
  return typeof value === "number" ? new Intl.NumberFormat("en-US").format(value) : "—";
}

export function formatMs(value: number | undefined | null): string {
  return typeof value === "number" ? `${formatNumber(value)} ms` : "—";
}

export function formatPercent(value: number | undefined | null): string {
  return typeof value === "number" ? `${value}%` : "—";
}

export function formatDate(value: string | undefined | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(date);
}

export function eventLabel(type: EventType): string {
  return type.replaceAll(".", " ");
}

export function eventClassName(type: EventType): string {
  return `event-${type.replaceAll(".", "-")}`;
}

export function signedMs(value: number | undefined | null): string {
  if (typeof value !== "number") return "—";
  return `${value > 0 ? "+" : ""}${formatMs(value)}`;
}
