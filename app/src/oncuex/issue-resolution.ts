import { Store } from "./store";
import type { ChangedField, Commitment } from "./types";

export type EditableIssue = "access" | "runofshow" | "capacity" | "budget";
export function issueEditor(id: string): EditableIssue | null {
  if (["access", "REQ-venue-loading-1", "REQ-crew-arrival-1"].includes(id)) return "access";
  if (["runofshow", "REQ-production-runofshow-1"].includes(id)) return "runofshow";
  if (["capacity", "REQ-venue-capacity-1"].includes(id)) return "capacity";
  if (["budget", "REQ-budget-total-1"].includes(id)) return "budget";
  return null;
}
export function proposedFields(store: Store, kind: EditableIssue, value: string, category = ""): Record<string, ChangedField> {
  const snapshot = store.snapshot();
  if (kind === "access" || kind === "runofshow") {
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Enter a valid time.");
    const path = kind === "access" ? "crew.arrivalTime" : "production.runOfShowEnd";
    const old = kind === "access" ? snapshot.crew.arrivalTime : snapshot.production.runOfShowEnd;
    if (old === value) throw new Error("Choose a different value.");
    return { [path]: { from: old, to: value } };
  }
  if (kind === "capacity") {
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error("Enter a positive whole-number capacity.");
    if (Number(value) === snapshot.location.capacity) throw new Error("Choose a different value.");
    return { "location.capacity": { from: snapshot.location.capacity, to: Number(value) } };
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("Enter a non-negative amount with at most two decimal places.");
  const amount = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(amount)) throw new Error("The amount is too large.");
  const index = snapshot.budget.commitments.findIndex((item) => item.category === category);
  if (index < 0) throw new Error("Select a recorded commitment.");
  const current = snapshot.budget.commitments[index];
  if (current.amount.minorUnits === amount) throw new Error("Choose a different amount.");
  const commitments: Commitment[] = structuredClone(snapshot.budget.commitments);
  commitments[index].amount.minorUnits = amount;
  const total = commitments.reduce((sum, item) => sum + item.amount.minorUnits, 0);
  if (!Number.isSafeInteger(total) || commitments.some((item) => item.amount.currency !== snapshot.budget.committedTotal.currency)) throw new Error("The commitments cannot be totaled safely.");
  return { "budget.commitments": { from: snapshot.budget.commitments, to: commitments }, "budget.committedTotal.minorUnits": { from: snapshot.budget.committedTotal.minorUnits, to: total } };
}

export function previewIssueChange(store: Store, fields: Record<string, ChangedField>) {
  const preview = Store.fromExport(store.export());
  preview.adoptChange({ commandId: "issue-preview", role: "project_manager", actor: "preview", expectedAssessmentRevision: preview.assessmentRevision }, { id: "issue-preview", changedFields: fields });
  return { assessment: preview.assess(), impact: preview.impact() };
}
