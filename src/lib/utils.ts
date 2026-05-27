import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function lamportsToSol(lamports: number | bigint): number {
  return Number(lamports) / 1_000_000_000;
}

export function solToLamports(sol: number): number {
  return Math.round(sol * 1_000_000_000);
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function formatDeadline(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function isDeadlinePassed(deadlineUtc: string): boolean {
  return new Date(deadlineUtc).getTime() < Date.now();
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    OPEN: "Open",
    ACCEPTED: "Accepted",
    RESULT_PROPOSED: "Result Proposed",
    DISPUTED: "Disputed",
    FINALIZED: "Finalized",
    CANCELLED: "Cancelled",
    REFUNDED: "Refunded",
  };
  return map[status] || status;
}

export function hashEvidence(evidenceJson: string): Buffer {
  const { createHash } = require("crypto");
  return createHash("sha256").update(evidenceJson).digest();
}
