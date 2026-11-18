/**
 * Requirement evaluation, integrated checks and selective impact.
 *
 * Pure functions over exactly one snapshot. Nothing here writes, records an
 * acceptance or knows which case is being demonstrated.
 */

import {
  bindingMatches,
  isExpired,
  isDict,
  resolve,
  validateSnapshot,
} from "./schema";
import { flawedLegacySample } from "./evidence-trust";
import type {
  Assessment,
  EvidenceRecord,
  ImpactBlock,
  IntegratedCheck,
  IntegratedResult,
  ProjectState,
  ReadinessCounts,
  Requirement,
  RequirementResult,
  RequirementStatus,
  Residual,
} from "./types";

export const minutes = (hhmm: string): number => {
  const [hours, mins] = hhmm.split(":");
  return Number(hours) * 60 + Number(mins);
};

const clock = (total: number) =>
  `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

const money = (minor: number) =>
  (minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const text = (value: unknown) => (value === undefined ? "" : String(value));

function predicateOk(req: Requirement, snapshot: ProjectState): boolean {
  const expected = req.expectedValues ?? {};
  switch (req.predicateType) {
    case "evidence_present":
      return true; // presence and currency are checked before the predicate
    case "numeric_within": {
      const value = resolve(snapshot, text(expected.field));
      if (!value.ok || typeof value.value !== "number") return false;
      const actual = value.value;
      if (typeof expected.minimum === "number" && actual < expected.minimum) return false;
      if (typeof expected.maximumMinorUnits === "number" && actual > expected.maximumMinorUnits) {
        return false;
      }
      if (typeof expected.maximum === "number" && actual > expected.maximum) return false;
      return true;
    }
    case "time_within_window": {
      if (typeof expected.marginMinutes === "number") {
        const end = resolve(snapshot, "production.runOfShowEnd");
        const stop = resolve(snapshot, "location.hardStop");
        if (!end.ok || !stop.ok) return false;
        return minutes(String(end.value)) + expected.marginMinutes <= minutes(String(stop.value));
      }
      const arrival = resolve(snapshot, "crew.arrivalTime");
      const windowEnd = resolve(snapshot, "location.loadingWindow.end");
      if (!arrival.ok || !windowEnd.ok) return false;
      const setup = typeof expected.setupMinutes === "number" ? expected.setupMinutes : 0;
      return minutes(String(arrival.value)) + setup <= minutes(String(windowEnd.value));
    }
    case "attestation_reviewed": {
      const field =
        typeof expected.attestationField === "string"
          ? expected.attestationField
          : "location.fireAttestation";
      const found = resolve(snapshot, field);
      return found.ok && found.value === "reviewed";
    }
    case "set_equals": {
      const found = resolve(snapshot, text(expected.field));
      return found.ok && found.value === expected.value;
    }
    default:
      return false;
  }
}

function evidenceFor(req: Requirement, evidence: EvidenceRecord[]): EvidenceRecord[] {
  return evidence.filter(
    (record) => record.requirementId === req.id && record.type === req.requiredEvidenceType,
  );
}

export function evaluate(
  snapshot: ProjectState,
  requirements: Requirement[],
  evidence: EvidenceRecord[],
  impact?: ImpactBlock | null,
): Assessment {
  validateSnapshot(snapshot, requirements, evidence);

  const byId = new Map(requirements.map((req) => [req.id, req]));
  const statuses = new Map<string, RequirementStatus>();
  const residuals = new Map<string, Residual[]>();

  const directStatus = (req: Requirement): { status: RequirementStatus; why: Residual[] } => {
    const records = evidenceFor(req, evidence);
    const admissible = records.filter((record) => record.reviewDisposition === "accepted");
    if (!admissible.length) return { status: "missing", why: [{ code: "mandatory_evidence_missing" }] };

    const now = typeof snapshot._now === "string" ? snapshot._now : "1970-01-01T00:00:00Z";
    const current: EvidenceRecord[] = [];
    const stale: Residual[] = [];
    for (const record of admissible) {
      if (flawedLegacySample(record)) {
        stale.push({ code: "source_excerpt_inconsistent", evidenceId: record.id });
        continue;
      }
      if (isExpired(record, now)) {
        stale.push({ code: "evidence_expired", evidenceId: record.id });
        continue;
      }
      const changed = Object.entries(record.boundFieldVersions).find(
        ([path, bound]) => !bindingMatches(path, bound, snapshot),
      );
      if (changed) {
        stale.push({ code: "bound_field_changed", field: changed[0], evidenceId: record.id });
        continue;
      }
      current.push(record);
    }

    // Current evidence decides the requirement. Stale records are history and
    // cannot veto a requirement that a newer record now supports.
    if (!current.length) return { status: "outdated", why: stale };

    if (!current.some((record) => predicateOk(req, snapshot))) {
      return { status: "blocked", why: [{ code: "predicate_false" }] };
    }
    return { status: "supported", why: [] };
  };

  // A cycle is a blocked condition, not a crash: ambiguous precedence must
  // never default to supported.
  const graph = new Map(requirements.map((req) => [req.id, [...req.prerequisiteIds]]));
  const cyclePaths = findCyclePaths(graph);

  const order: string[] = [];
  const temporary = new Set<string>();
  const permanent = new Set<string>();
  const visit = (node: string): void => {
    if (permanent.has(node) || cyclePaths.has(node)) return;
    if (!byId.has(node) || temporary.has(node)) return;
    temporary.add(node);
    for (const parent of graph.get(node) ?? []) visit(parent);
    temporary.delete(node);
    permanent.add(node);
    order.push(node);
  };
  for (const id of byId.keys()) visit(id);

  for (const [id, path] of cyclePaths) {
    statuses.set(id, "blocked");
    residuals.set(id, [
      {
        code: "prerequisite_cycle",
        path,
        prerequisiteIds: graph.get(id) ?? [],
      },
    ]);
  }

  for (const id of order) {
    const req = byId.get(id)!;
    const direct = directStatus(req);
    let status = direct.status;
    let why = direct.why;
    const blockedBy = req.prerequisiteIds.filter((parent) => {
      const parentStatus = statuses.get(parent);
      return parentStatus !== undefined && parentStatus !== "supported";
    });
    if (status === "supported" && blockedBy.length) {
      status = "blocked";
      why = [{ code: "prerequisite_not_supported", prerequisiteIds: blockedBy }];
    }
    statuses.set(id, status);
    residuals.set(id, why);
  }

  for (const req of requirements) {
    if (cyclePaths.has(req.id)) continue;
    const conflicts = prerequisiteConflicts(req, byId);
    if (!conflicts.length) continue;
    // A conflict explains why the requirement cannot currently be satisfied.
    // The direct evidence finding says what will still need attention once the
    // conflict is resolved, so both are reported. The conflict leads: it is the
    // blocker, and the evidence residual is the remaining work behind it.
    const secondary = (residuals.get(req.id) ?? []).filter(
      (residual) => residual.code !== "prerequisite_conflict",
    );
    statuses.set(req.id, "blocked");
    residuals.set(req.id, [conflicts[0], ...secondary]);
  }

  const integrated = integratedChecks(snapshot, requirements, statuses);
  const blocking = requirements.filter((req) => req.blocking);
  const ready =
    blocking.every((req) => statuses.get(req.id) === "supported") && integrated.status === "pass";

  // Readiness totals count each blocking requirement once, by its primary status.
  const counts: ReadinessCounts = {
    blocking: blocking.length,
    supported: 0,
    blocked: 0,
    outdated: 0,
    missing: 0,
  };
  for (const req of blocking) {
    const status = statuses.get(req.id);
    if (status === "supported" || status === "blocked" || status === "outdated" || status === "missing") {
      counts[status] += 1;
    }
  }

  const reasonCodes: string[] = [];
  if (blocking.some((req) => statuses.get(req.id) === "outdated")) reasonCodes.push("mandatory_outdated");
  if (blocking.some((req) => statuses.get(req.id) === "missing")) reasonCodes.push("mandatory_missing");
  if (blocking.some((req) => statuses.get(req.id) === "blocked")) reasonCodes.push("mandatory_blocked");
  if (integrated.status === "fail") reasonCodes.push("integration_failed");

  const result: Assessment = {
    assessmentRevision: snapshot.assessmentRevision,
    requirements: requirements.map<RequirementResult>((req) => ({
      requirementId: req.id,
      status: statuses.get(req.id) ?? "missing",
      blocking: req.blocking,
      residuals: residuals.get(req.id) ?? [],
    })),
    integrated,
    readiness: ready ? "ready_for_review" : "not_ready",
    counts,
    residualReasonCodes: reasonCodes,
  };
  if (impact) result.impact = impact;
  return result;
}

export function integratedChecks(
  snapshot: ProjectState,
  requirements: Requirement[],
  statuses: Map<string, RequirementStatus>,
): IntegratedResult {
  const checks: IntegratedCheck[] = [];
  const expectedOf = (id: string, key: string, fallback: number) => {
    const req = requirements.find((candidate) => candidate.id === id);
    const value = req?.expectedValues?.[key];
    return typeof value === "number" ? value : fallback;
  };

  const arrival = resolve(snapshot, "crew.arrivalTime");
  const windowEnd = resolve(snapshot, "location.loadingWindow.end");
  if (arrival.ok && windowEnd.ok) {
    const setup = expectedOf("REQ-venue-loading-1", "setupMinutes", 45);
    const arrivalTime = String(arrival.value);
    const endTime = String(windowEnd.value);
    if (minutes(arrivalTime) + setup > minutes(endTime)) {
      checks.push({
        id: "access_vs_arrival",
        status: "fail",
        reason: `Crew arrival ${arrivalTime} plus ${setup} minutes setup reaches ${clock(
          minutes(arrivalTime) + setup,
        )}; the loading window ends ${endTime}.`,
      });
    }
  }

  const capacity = resolve(snapshot, "location.capacity");
  const guests = resolve(snapshot, "brief.guestCount");
  if (capacity.ok && guests.ok) {
    const buffer =
      typeof snapshot.circulationBuffer === "number"
        ? snapshot.circulationBuffer
        : typeof (snapshot.brief as { circulationBuffer?: unknown })?.circulationBuffer === "number"
          ? Number((snapshot.brief as { circulationBuffer?: unknown }).circulationBuffer)
          : 10;
    const needed = Number(guests.value) + buffer;
    if (Number(capacity.value) < needed) {
      checks.push({
        id: "occupancy_vs_headcount",
        status: "fail",
        reason: `Licensed occupancy ${text(capacity.value)} is below guest count ${text(
          guests.value,
        )} plus circulation buffer ${needed - Number(guests.value)}, which requires ${needed}.`,
      });
    }
  }

  const showEnd = resolve(snapshot, "production.runOfShowEnd");
  const stop = resolve(snapshot, "location.hardStop");
  if (showEnd.ok && stop.ok) {
    const margin = expectedOf("REQ-production-runofshow-1", "marginMinutes", 30);
    const endTime = String(showEnd.value);
    const stopTime = String(stop.value);
    if (minutes(endTime) + margin > minutes(stopTime)) {
      checks.push({
        id: "runofshow_vs_hardstop",
        status: "fail",
        reason: `Run of show ends ${endTime}; a ${margin} minute margin requires ${clock(
          minutes(endTime) + margin,
        )}, but the hard stop is ${stopTime}.`,
      });
    }
  }

  const committed = resolve(snapshot, "budget.committedTotal.minorUnits");
  const budget = resolve(snapshot, "brief.approvedBudget.minorUnits");
  if (committed.ok && budget.ok) {
    const total = Number(committed.value);
    const ceiling = Number(budget.value);
    if (total > ceiling) {
      checks.push({
        id: "total_cost",
        status: "fail",
        reason: `Committed total ${money(total)} exceeds approved budget ${money(
          ceiling,
        )} by ${money(total - ceiling)}.`,
      });
    }
  }

  if (snapshot.location.fireAttestation !== "reviewed") {
    checks.push({
      id: "attestation_current",
      status: "fail",
      reason: `The fire and occupancy attestation for ${snapshot.location.venueId} is ${snapshot.location.fireAttestation}.`,
    });
  }

  const unmet = [...statuses.entries()]
    .filter(([, status]) => status !== "supported")
    .map(([id]) => id);
  if (unmet.length) {
    checks.push({
      id: "dependency_closure",
      status: "fail",
      reason: `${unmet.length} blocking requirement(s) not supported: ${unmet.sort().join(", ")}.`,
    });
  }

  return { status: checks.length ? "fail" : "pass", checks };
}

export function findCyclePaths(graph: Map<string, string[]>): Map<string, string[]> {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const cycles = new Map<string, string[]>();

  const dfs = (node: string): void => {
    state.set(node, 1);
    stack.push(node);
    for (const parent of graph.get(node) ?? []) {
      const parentState = state.get(parent) ?? 0;
      if (parentState === 0) {
        dfs(parent);
      } else if (parentState === 1) {
        const start = stack.indexOf(parent);
        const path = [...stack.slice(start), parent];
        for (const member of stack.slice(start)) {
          if (!cycles.has(member)) cycles.set(member, path);
        }
      }
    }
    stack.pop();
    state.set(node, 2);
  };

  for (const node of graph.keys()) {
    if ((state.get(node) ?? 0) === 0) dfs(node);
  }
  return cycles;
}

interface Constraint {
  kind: "numeric" | "equals";
  field: string;
  low?: number;
  high?: number;
  value?: unknown;
}

function constraintOf(req: Requirement): Constraint | null {
  const expected = req.expectedValues ?? {};
  const field = typeof expected.field === "string" ? expected.field : undefined;
  if (req.predicateType === "numeric_within") {
    if (!field) return null;
    const high = expected.maximum ?? expected.maximumMinorUnits;
    return {
      kind: "numeric",
      field,
      low: typeof expected.minimum === "number" ? expected.minimum : undefined,
      high: typeof high === "number" ? high : undefined,
    };
  }
  if (req.predicateType === "set_equals") {
    if (!field) return null;
    return { kind: "equals", field, value: expected.value };
  }
  if (req.predicateType === "attestation_reviewed") {
    return {
      kind: "equals",
      field:
        typeof expected.attestationField === "string"
          ? expected.attestationField
          : "location.fireAttestation",
      value: "reviewed",
    };
  }
  return null;
}

function conflictBetween(a: Requirement, b: Requirement): Residual | null {
  const ca = constraintOf(a);
  const cb = constraintOf(b);
  if (!ca || !cb || ca.field !== cb.field) return null;
  const pair = [a.id, b.id];
  if (ca.kind === "numeric" && cb.kind === "numeric") {
    const lows = [ca, cb].map((c) => c.low).filter((v): v is number => typeof v === "number");
    const highs = [ca, cb].map((c) => c.high).filter((v): v is number => typeof v === "number");
    if (lows.length && highs.length && Math.max(...lows) > Math.min(...highs)) {
      return { code: "prerequisite_conflict", field: ca.field, prerequisiteIds: pair, constraints: [ca, cb] };
    }
    return null;
  }
  if (ca.kind === "equals" && cb.kind === "equals") {
    return ca.value !== cb.value
      ? { code: "prerequisite_conflict", field: ca.field, prerequisiteIds: pair, constraints: [ca, cb] }
      : null;
  }
  const numeric = ca.kind === "numeric" ? ca : cb;
  const exact = ca.kind === "numeric" ? cb : ca;
  const value = exact.value;
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  const below = typeof numeric.low === "number" && value < numeric.low;
  const above = typeof numeric.high === "number" && value > numeric.high;
  if (below || above) {
    return { code: "prerequisite_conflict", field: ca.field, prerequisiteIds: pair, constraints: [ca, cb] };
  }
  return null;
}

/**
 * Pairs of declared prerequisites that no single value can satisfy: numeric
 * ranges and exact values on the same field. Time windows constrain when work
 * happens, not what a field holds, so they are not compared.
 */
export function prerequisiteConflicts(req: Requirement, byId: Map<string, Requirement>): Residual[] {
  const prerequisites = req.prerequisiteIds
    .map((id) => byId.get(id))
    .filter((candidate): candidate is Requirement => Boolean(candidate));
  const conflicts: Residual[] = [];
  for (let index = 0; index < prerequisites.length; index += 1) {
    for (const second of prerequisites.slice(index + 1)) {
      const conflict = conflictBetween(prerequisites[index], second);
      if (conflict) conflicts.push(conflict);
    }
  }
  return conflicts;
}

export function dependentClosure(seeds: Iterable<string>, requirements: Requirement[]): Set<string> {
  const graph = new Map(requirements.map((req) => [req.id, [...req.prerequisiteIds]]));
  const affected = new Set(seeds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, prerequisites] of graph) {
      if (!affected.has(id) && prerequisites.some((parent) => affected.has(parent))) {
        affected.add(id);
        changed = true;
      }
    }
  }
  return affected;
}

function impactBlock(
  requirements: Requirement[],
  evidence: EvidenceRecord[],
  affectedRequirements: Set<string>,
  affectedEvidence: Set<string>,
): ImpactBlock {
  return {
    impacted: {
      requirementIds: requirements.filter((r) => affectedRequirements.has(r.id)).map((r) => r.id),
      evidenceIds: evidence.filter((e) => affectedEvidence.has(e.id)).map((e) => e.id),
    },
    unaffected: {
      requirementIds: requirements.filter((r) => !affectedRequirements.has(r.id)).map((r) => r.id),
      evidenceIds: evidence.filter((e) => !affectedEvidence.has(e.id)).map((e) => e.id),
    },
  };
}

export function impactOfChange(
  changedPaths: Iterable<string>,
  requirements: Requirement[],
  evidence: EvidenceRecord[],
): ImpactBlock {
  const changed = new Set(changedPaths);
  const seeds = new Set<string>();
  for (const req of requirements) {
    if (req.fieldBindings.some((path) => changed.has(path))) seeds.add(req.id);
  }
  for (const record of evidence) {
    if (Object.keys(record.boundFieldVersions).some((path) => changed.has(path))) {
      seeds.add(record.requirementId);
    }
  }
  const affectedRequirements = dependentClosure(seeds, requirements);
  const affectedEvidence = new Set(
    evidence
      .filter(
        (record) =>
          affectedRequirements.has(record.requirementId) ||
          Object.keys(record.boundFieldVersions).some((path) => changed.has(path)),
      )
      .map((record) => record.id),
  );
  return impactBlock(requirements, evidence, affectedRequirements, affectedEvidence);
}

export function impactOfExpiry(
  requirements: Requirement[],
  evidence: EvidenceRecord[],
  now: string,
): ImpactBlock | null {
  const expired = evidence.filter(
    (record) => record.reviewDisposition === "accepted" && isExpired(record, now),
  );
  if (!expired.length) return null;
  const seeds = new Set(expired.map((record) => record.requirementId));
  const affectedRequirements = dependentClosure(seeds, requirements);
  const affectedEvidence = new Set(
    evidence
      .filter((record) => affectedRequirements.has(record.requirementId))
      .map((record) => record.id),
  );
  return impactBlock(requirements, evidence, affectedRequirements, affectedEvidence);
}

export function combineImpact(
  blocks: (ImpactBlock | null)[],
  requirements: Requirement[],
  evidence: EvidenceRecord[],
): ImpactBlock | null {
  const present = blocks.filter((block): block is ImpactBlock => Boolean(block));
  if (!present.length) return null;
  if (present.length === 1) return present[0];
  const affectedRequirements = new Set<string>();
  const affectedEvidence = new Set<string>();
  for (const block of present) {
    block.impacted.requirementIds.forEach((id) => affectedRequirements.add(id));
    block.impacted.evidenceIds.forEach((id) => affectedEvidence.add(id));
  }
  return impactBlock(requirements, evidence, affectedRequirements, affectedEvidence);
}

/** True when a record's bound values still match the snapshot (used by the UI). */
export function bindingDiff(
  record: EvidenceRecord,
  snapshot: ProjectState,
): { path: string; bound: unknown; current: unknown; matches: boolean }[] {
  return Object.entries(record.boundFieldVersions).map(([path, bound]) => {
    const current = resolve(snapshot, path);
    return {
      path,
      bound,
      current: current.ok ? current.value : undefined,
      matches: bindingMatches(path, bound, snapshot),
    };
  });
}

export function hasBrief(snapshot: ProjectState): boolean {
  return isDict(snapshot.brief) && typeof (snapshot.brief as { client?: unknown }).client === "string";
}
