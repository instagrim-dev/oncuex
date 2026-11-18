import { formatDateTime } from "./format";

/** Display the instant in the source's recorded timezone, without assuming a timezone for malformed data. */
export function formatSourceTime(timestamp: string, timezone: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return `Time unavailable (${timestamp})`;
  try {
    const local = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      hour12: false, timeZone: timezone, timeZoneName: "short",
    }).format(date).replace(",", "");
    return `${local} · ${timezone}`;
  } catch {
    return `${formatDateTime(timestamp)} · source timezone unavailable (${timezone})`;
  }
}

export interface TranscriptLine { offset: string; speaker: string; text: string }

/** Parse only explicit speaker and offset markers; otherwise show the source text unchanged. */
export function transcriptLines(raw: string): TranscriptLine[] {
  const markers = [...raw.matchAll(/(?:^|\s)(\d{2}:\d{2})\s+([^:]+):\s/g)];
  if (!markers.length || markers[0].index !== 0) return [];
  return markers.map((marker, index) => ({
    offset: marker[1], speaker: marker[2].trim(),
    text: raw.slice((marker.index ?? 0) + marker[0].length, markers[index + 1]?.index ?? raw.length).trim(),
  }));
}
