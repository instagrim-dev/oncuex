import { Store } from "./store";
import { isReviewData } from "./source-review";
import type { ReviewData } from "./source-review";
import type { ExportDoc } from "./types";

const ARCHIVE_KEY = "oncuex.operator.preserved-samples.v1";
export interface PreservedSample {
  id: string;
  savedAt: string;
  project: ExportDoc;
  sourceReview: ReviewData;
}

type ArchiveStorage = Pick<Storage, "getItem" | "setItem">;

/** Fail closed on invalid archives so an older copy is never overwritten. */
export function readPreservedSamples(storage: ArchiveStorage): PreservedSample[] {
  const raw = storage.getItem(ARCHIVE_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("The preserved records could not be validated.");
  return parsed.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("The preserved records could not be validated.");
    const snapshot = entry as PreservedSample;
    if (typeof snapshot.id !== "string" || typeof snapshot.savedAt !== "string" || !isReviewData(snapshot.sourceReview)) throw new Error("The preserved records could not be validated.");
    Store.fromExport(snapshot.project);
    return snapshot;
  });
}

/** Store the complete previous record before replacing it; a storage failure stops the replacement. */
export function preserveSample(storage: ArchiveStorage, project: ExportDoc, sourceReview: ReviewData, id: string, savedAt: string): PreservedSample[] {
  Store.fromExport(project);
  if (!isReviewData(sourceReview)) throw new Error("The source review data could not be validated.");
  const previous = readPreservedSamples(storage);
  if (previous.some((entry) => entry.id === id)) throw new Error("The preserved record identifier already exists.");
  const next = [...previous, { id, savedAt, project, sourceReview }];
  storage.setItem(ARCHIVE_KEY, JSON.stringify(next));
  return next;
}
