import type { EvidenceRecord } from "./types";

/** Only known flawed historical synthetic fixture excerpts are flagged; originals remain unchanged. */
export function flawedLegacySample(record: EvidenceRecord): boolean {
  if (!record.artifactRef.startsWith("synthetic://")) return false;
  return (record.id === "EV-7" && record.sourceExcerpt.includes("fee 240,000 USD")) ||
    (record.id === "EV-6" && record.sourceExcerpt === "Foundry Hall: freight access 05:00-12:00, licensed occupancy 150, hard stop 23:00, licence fee 9,500 USD.") ||
    (record.id === "EV-4" && record.sourceExcerpt === "Crew call 07:00, 45 minutes to first scenic panel.");
}
