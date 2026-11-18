/**
 * In-app self-check.
 *
 * This is the test harness, not the operator view: expected values live here
 * only. Every check exercises the same store commands the UI calls, and the
 * operator screens never read these constants.
 */

import { evaluate } from "./engine";
import {
  describeCommandError,
  Store,
} from "./store";
import { FIELD_SCHEMA, digest, validateEvidenceRecord } from "./schema";
import {
  BRIEF,
  DEFAULT_NOW,
  EVIDENCE,
  PROJECT_ID,
  REQUIREMENTS,
  SCENARIO,
  baselineTarget,
  diffState,
  evidenceById,
  initialProject,
} from "./scenario";
import {
  PM_ACTOR,
  adoptRecovery,
  adoptVenueChange,
  attachRecoveryEvidence,
  loadBaseline,
  recordAcceptance,
  withdrawPhotographer,
} from "./demo";
import type { EvidenceRecord, ProjectState, Requirement } from "./types";

export interface SelfCheckResult {
  group: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface SelfCheckReport {
  results: SelfCheckResult[];
  passed: number;
  failed: number;
  ranAt: string;
  durationMs: number;
}

const clone = <T>(value: T): T => structuredClone(value);

const statuses = (store: Store) =>
  Object.fromEntries(store.assess().requirements.map((result) => [result.requirementId, result.status]));

function same(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

const BASELINE = "EV-1,EV-2,EV-3,EV-4,EV-5,EV-6,EV-7".split(",");

function projectWithBrief(): ProjectState {
  return {
    ...clone(SCENARIO.state.baseline),
    id: PROJECT_ID,
    brief: clone(BRIEF),
    circulationBuffer: BRIEF.circulationBuffer,
    requirementSetVersion: 1,
    _now: DEFAULT_NOW,
  };
}

function syntheticRequirement(
  id: string,
  patch: Partial<Requirement>,
): Requirement {
  return {
    id,
    version: 1,
    milestoneId: "MS-1",
    owner: BRIEF.owner.id,
    label: id,
    predicateType: "evidence_present",
    expectedValues: {},
    prerequisiteIds: [],
    requiredEvidenceType: "document",
    expiryPolicy: { mode: "absolute", value: "2027-03-07T00:00:00Z" },
    blocking: true,
    fieldBindings: ["location.venueId"],
    ...patch,
  };
}

export function runSelfChecks(): SelfCheckReport {
  const started = performance.now();
  const results: SelfCheckResult[] = [];

  const check = (group: string, label: string, assertion: () => boolean | string) => {
    try {
      const outcome = assertion();
      if (outcome === true) {
        results.push({ group, label, ok: true });
      } else {
        results.push({
          group,
          label,
          ok: false,
          detail: typeof outcome === "string" ? outcome : "assertion returned false",
        });
      }
    } catch (error) {
      results.push({ group, label, ok: false, detail: describeCommandError(error) });
    }
  };

  /* ---------------------------------------------------------------- schema */
  check("Records and schema", "The typed field table declares 20 bindable paths", () => {
    const paths = Object.keys(FIELD_SCHEMA);
    return paths.length === 20 ? true : `found ${paths.length} paths`;
  });
  check("Records and schema", "Every fixture field binding and evidence binding is a declared path", () => {
    const bindings = REQUIREMENTS.flatMap((req) => req.fieldBindings).concat(
      EVIDENCE.flatMap((record) => Object.keys(record.boundFieldVersions)),
    );
    const undeclared = bindings.filter((path) => !FIELD_SCHEMA[path]);
    return undeclared.length ? `undeclared: ${[...new Set(undeclared)].join(", ")}` : true;
  });

  check("Records and schema", "Every fixture content digest recomputes from its source span", () => {
    const bad = EVIDENCE.filter((record) => {
      const expected = digest({
        sourceRefIds: record.sourceRefIds,
        sourceExcerpt: record.sourceExcerpt,
      });
      return expected !== record.contentDigest;
    });
    return bad.length ? `mismatched: ${bad.map((record) => record.id).join(", ")}` : true;
  });

  check("Records and schema", "All 13 fixture evidence records validate against the schema", () => {
    const requirementIds = new Set(REQUIREMENTS.map((req) => req.id));
    const sourceIds = new Set(SCENARIO.sourceReferences.map((source) => source.id));
    const problems = EVIDENCE.flatMap((record) => validateEvidenceRecord(record, requirementIds, sourceIds));
    return problems.length ? problems[0] : true;
  });

  /* ---------------------------------------------------------------- walkthrough */
  const store = new Store(initialProject(), clone(REQUIREMENTS), []);
  check("Canonical walkthrough", "Brief adoption is the first assessed event", () => {
    store.adoptBrief(
      { commandId: "SELF-CMD-1", role: "project_manager", actor: PM_ACTOR, expectedAssessmentRevision: 0 },
      clone(BRIEF),
    );
    return store.assessmentRevision === 1 && store.sequence === 1;
  });
  check("Canonical walkthrough", "Seven evidence attachments reach revision 8 and sequence 8", () => {
    for (const [index, id] of BASELINE.entries()) {
      store.attachEvidence(
        {
          commandId: `SELF-CMD-${index + 2}`,
          role: "project_manager",
          actor: PM_ACTOR,
          expectedAssessmentRevision: store.assessmentRevision,
        },
        clone(evidenceById(id)),
      );
    }
    return store.assessmentRevision === 8 && store.sequence === 8;
  });
  check("Canonical walkthrough", "Baseline is ready for review with all six integrated checks passing", () => {
    const assessment = store.assess();
    return (
      assessment.readiness === "ready_for_review" &&
      assessment.integrated.status === "pass" &&
      Object.values(statuses(store)).every((status) => status === "supported")
    );
  });
  check("Canonical walkthrough", "Recording DEC-1 advances the sequence and not the assessment revision", () => {
    recordAcceptance(store, "DEC-1");
    return (
      store.sequence === 9 &&
      store.assessmentRevision === 8 &&
      store.currentness("DEC-1") === "current" &&
      store.latestDecision()?.targetAssessmentRevision === 8
    );
  });
  check("Canonical walkthrough", "A reload from the export keeps DEC-1 current at revision 8", () => {
    const restored = Store.fromExport(JSON.parse(JSON.stringify(store.export())));
    return (
      restored.sequence === 9 &&
      restored.assessmentRevision === 8 &&
      restored.currentness("DEC-1") === "current"
    );
  });
  check("Canonical walkthrough", "The venue change reports exactly the six failing integrated checks", () => {
    adoptVenueChange(store);
    const assessment = store.assess();
    return (
      store.assessmentRevision === 9 &&
      assessment.integrated.status === "fail" &&
      assessment.integrated.checks.length === 6 &&
      same(
        assessment.integrated.checks.map((checkResult) => checkResult.id),
        [
          "access_vs_arrival",
          "occupancy_vs_headcount",
          "runofshow_vs_hardstop",
          "total_cost",
          "attestation_current",
          "dependency_closure",
        ],
      )
    );
  });
  check("Canonical walkthrough", "The venue change leaves the photographer supported and unaffected", () => {
    const assessment = store.assess();
    const photographer = assessment.requirements.find(
      (result) => result.requirementId === "REQ-photographer-deliverables-1",
    );
    const impact = assessment.impact;
    return (
      photographer?.status === "supported" &&
      impact?.unaffected.requirementIds.includes("REQ-photographer-deliverables-1") === true &&
      impact?.unaffected.evidenceIds.includes("EV-7") === true &&
      impact?.impacted.evidenceIds.includes("EV-7") === false
    );
  });
  check("Canonical walkthrough", "The venue impact is the six declared requirements and EV-1 to EV-6", () => {
    const impact = store.assess().impact;
    return same(impact?.impacted, {
      requirementIds: [
        "REQ-venue-loading-1",
        "REQ-venue-capacity-1",
        "REQ-crew-arrival-1",
        "REQ-production-runofshow-1",
        "REQ-budget-total-1",
        "REQ-fire-permit-1",
      ],
      evidenceIds: ["EV-1", "EV-2", "EV-3", "EV-4", "EV-5", "EV-6"],
    });
  });
  check("Canonical walkthrough", "The recovered plan reaches revision 16 and sequence 17 through commands", () => {
    adoptRecovery(store);
    const afterChange = store.assessmentRevision === 10;
    attachRecoveryEvidence(store);
    return afterChange && store.assessmentRevision === 16 && store.sequence === 17;
  });
  check("Canonical walkthrough", "Recovery supports every requirement and passes all six checks", () => {
    const assessment = store.assess();
    return (
      assessment.readiness === "ready_for_review" &&
      assessment.integrated.status === "pass" &&
      assessment.requirements.every((result) => result.status === "supported")
    );
  });
  check("Canonical walkthrough", "DEC-2 is current at revision 16 while DEC-1 is historical", () => {
    recordAcceptance(store, "DEC-2");
    return (
      store.sequence === 18 &&
      store.assessmentRevision === 16 &&
      store.currentness("DEC-2") === "current" &&
      store.currentness("DEC-1") === "historical"
    );
  });
  check("Canonical walkthrough", "A reload after recovery keeps both decisions in their recorded state", () => {
    const restored = Store.fromExport(JSON.parse(JSON.stringify(store.export())));
    return (
      restored.sequence === 18 &&
      restored.assessmentRevision === 16 &&
      restored.currentness("DEC-2") === "current" &&
      restored.currentness("DEC-1") === "historical"
    );
  });

  /* ---------------------------------------------------------------- lineage */
  check("Lineage and currentness", "Reverting every plan value restores readiness but not the acceptance", () => {
    const lineage = new Store(initialProject(), clone(REQUIREMENTS), []);
    loadBaseline(lineage);
    recordAcceptance(lineage, "DEC-1");
    adoptVenueChange(lineage);
    const baseline = baselineTarget();
    lineage.adoptChange(
      {
        commandId: "SELF-REVERT",
        role: "project_manager",
        actor: PM_ACTOR,
        expectedAssessmentRevision: lineage.assessmentRevision,
      },
      { id: "CHG-REVERT", changedFields: diffState(lineage.snapshot(), baseline) },
    );
    const eligibility = lineage.eligibility("project_manager");
    return (
      lineage.assess().readiness === "ready_for_review" &&
      lineage.currentness("DEC-1") === "historical" &&
      same(eligibility.reasons, ["revision_lineage_changed"]) &&
      same(lineage.decisionStatus("DEC-1").residualReasonCodes, ["revision_lineage_changed"])
    );
  });

  /* ---------------------------------------------------------------- expiry */
  check("Expiry", "Moving the clock past expiry leaves the assessment revision unchanged", () => {
    const expiring = new Store(initialProject(), clone(REQUIREMENTS), []);
    loadBaseline(expiring);
    recordAcceptance(expiring, "DEC-1");
    expiring.setClock("2027-03-08T00:00:00Z");
    return expiring.assessmentRevision === 8 && expiring.sequence === 9;
  });
  check("Expiry", "Expired evidence blocks acceptance and explains itself", () => {
    const expiring = new Store(initialProject(), clone(REQUIREMENTS), []);
    loadBaseline(expiring);
    recordAcceptance(expiring, "DEC-1");
    expiring.setClock("2027-03-08T00:00:00Z");
    const assessment = expiring.assess();
    const eligibility = expiring.eligibility("project_manager");
    const status = statuses(expiring);
    return (
      assessment.readiness === "not_ready" &&
      status["REQ-venue-loading-1"] === "outdated" &&
      status["REQ-photographer-deliverables-1"] === "supported" &&
      !eligibility.eligible &&
      eligibility.reasons.includes("mandatory_evidence_expired") &&
      expiring.currentness("DEC-1") === "historical" &&
      same(expiring.decisionStatus("DEC-1").residualReasonCodes, ["mandatory_evidence_expired"])
    );
  });
  check("Expiry", "A lapsed prerequisite blocks a dependent whose own evidence is current", () => {
    // Reference-harness setup: only EV-1 lapses, so the dependent records stay
    // current and the closure is what blocks them.
    const isolated = new Store(initialProject(), clone(REQUIREMENTS), []);
    loadBaseline(isolated);
    isolated.setClock("2027-03-08T00:00:00Z");
    isolated.evidence.forEach((record) => {
      if (record.id !== "EV-1") record.expiresAt = "2027-03-20T00:00:00Z";
    });
    const status = statuses(isolated);
    const impact = isolated.assess().impact;
    return (
      status["REQ-venue-loading-1"] === "outdated" &&
      status["REQ-crew-arrival-1"] === "blocked" &&
      status["REQ-production-runofshow-1"] === "blocked" &&
      status["REQ-venue-capacity-1"] === "supported" &&
      same(impact?.impacted.evidenceIds, ["EV-1", "EV-3", "EV-4"])
    );
  });

  /* ---------------------------------------------------------------- archive */
  const archived = Store.fromExport(JSON.parse(JSON.stringify(store.export())));
  check("Withdrawal and archive", "Withdrawing the photographer scope advances the requirement set once", () => {
    withdrawPhotographer(archived);
    return archived.project.requirementSetVersion === 2;
  });
  check("Withdrawal and archive", "The withdrawn record is archived, not deleted", () => {
    return (
      archived.archivedEvidence.length === 1 &&
      archived.archivedEvidence[0].evidence.id === "EV-7" &&
      archived.archivedEvidence[0].archiveReason === "requirement_set_changed"
    );
  });
  check("Withdrawal and archive", "The prior acceptance becomes historical for the set change", () => {
    const status = archived.decisionStatus("DEC-2");
    return (
      archived.currentness("DEC-2") === "historical" &&
      same(status.residualReasonCodes, ["requirement_set_changed"])
    );
  });
  check("Withdrawal and archive", "Decision readback still returns the withdrawn record", () => {
    return archived.decisionEvidence("DEC-2").some((record) => record.id === "EV-7");
  });
  check("Withdrawal and archive", "An archived record cannot be re-attached", () => {
    try {
      archived.attachEvidence(
        {
          commandId: "SELF-RESURRECT",
          role: "project_manager",
          actor: PM_ACTOR,
          expectedAssessmentRevision: archived.assessmentRevision,
        },
        clone(EVIDENCE[6]),
      );
      return "attach unexpectedly succeeded";
    } catch (error) {
      return describeCommandError(error).startsWith("duplicate_evidence") || describeCommandError(error);
    }
  });

  /* ---------------------------------------------------------------- invariants */
  check("Command invariants", "A repeated command id returns the original result and appends no event", () => {
    const replay = new Store(initialProject(), clone(REQUIREMENTS), []);
    const command = {
      commandId: "SELF-REPLAY",
      role: "project_manager" as const,
      actor: PM_ACTOR,
      expectedAssessmentRevision: 0,
    };
    const first = replay.adoptBrief(command, clone(BRIEF));
    const second = replay.adoptBrief(command, clone(BRIEF));
    return (
      replay.sequence === 1 &&
      replay.assessmentRevision === 1 &&
      first.sequence === second.sequence
    );
  });
  check("Command invariants", "A stale expected revision is rejected before any write", () => {
    const guarded = new Store(initialProject(), clone(REQUIREMENTS), []);
    const before = guarded.sequence;
    try {
      guarded.adoptBrief(
        {
          commandId: "SELF-CAS",
          role: "project_manager",
          actor: PM_ACTOR,
          expectedAssessmentRevision: 7,
        },
        clone(BRIEF),
      );
      return "conflicting command unexpectedly succeeded";
    } catch (error) {
      return describeCommandError(error).startsWith("conflict") && guarded.sequence === before;
    }
  });
  check("Command invariants", "A contributor cannot adopt a change or record a decision", () => {
    const denied = new Store(initialProject(), clone(REQUIREMENTS), []);
    loadBaseline(denied);
    const before = denied.assessmentRevision;
    const results: boolean[] = [];
    try {
      denied.adoptChange(
        {
          commandId: "SELF-ROLE-1",
          role: "contributor",
          actor: "CON-ana",
          expectedAssessmentRevision: before,
        },
        { id: "CHG-DENIED", changedFields: { "location.capacity": { to: 140 } } },
      );
      results.push(false);
    } catch (error) {
      results.push(describeCommandError(error).startsWith("role_denied"));
    }
    try {
      denied.recordDecision({
        commandId: "SELF-ROLE-2",
        role: "contributor",
        actor: "CON-ana",
        expectedAssessmentRevision: before,
        decisionId: "DEC-9",
      });
      results.push(false);
    } catch (error) {
      results.push(describeCommandError(error).startsWith("role_denied"));
    }
    return results.every(Boolean) && denied.assessmentRevision === before;
  });
  check("Command invariants", "Conflicting prerequisites block the dependent requirement", () => {
    const requirements = [
      syntheticRequirement("REQ-a-1", {
        predicateType: "numeric_within",
        expectedValues: { field: "location.capacity", minimum: 200 },
        fieldBindings: ["location.capacity"],
      }),
      syntheticRequirement("REQ-b-1", {
        predicateType: "numeric_within",
        expectedValues: { field: "location.capacity", maximum: 100 },
        fieldBindings: ["location.capacity"],
      }),
      syntheticRequirement("REQ-c-1", {
        prerequisiteIds: ["REQ-a-1", "REQ-b-1"],
      }),
    ];
    const assessment = evaluate(projectWithBrief(), requirements, []);
    const dependent = assessment.requirements.find((result) => result.requirementId === "REQ-c-1");
    return (
      dependent?.status === "blocked" &&
      dependent.residuals[0]?.code === "prerequisite_conflict"
    );
  });
  check(
    "Command invariants",
    "A conflict and an evidence gap are reported together, conflict first",
    () => {
      const requirements = [
        syntheticRequirement("REQ-a-1", {
          predicateType: "numeric_within",
          expectedValues: { field: "location.capacity", minimum: 200 },
          fieldBindings: ["location.capacity"],
        }),
        syntheticRequirement("REQ-b-1", {
          predicateType: "numeric_within",
          expectedValues: { field: "location.capacity", maximum: 100 },
          fieldBindings: ["location.capacity"],
        }),
        // no evidence of its own, and unsatisfiable prerequisites
        syntheticRequirement("REQ-c-1", {
          prerequisiteIds: ["REQ-a-1", "REQ-b-1"],
        }),
      ];
      const assessment = evaluate(projectWithBrief(), requirements, []);
      const dependent = assessment.requirements.find((result) => result.requirementId === "REQ-c-1");
      const codes = (dependent?.residuals ?? []).map((residual) => residual.code);
      return (
        dependent?.status === "blocked" &&
        codes[0] === "prerequisite_conflict" &&
        codes.includes("mandatory_evidence_missing")
      );
    },
  );
  check(
    "Command invariants",
    "Readiness totals count each blocking requirement once",
    () => {
      const assessment = evaluate(projectWithBrief(), REQUIREMENTS, EVIDENCE);
      const { counts } = assessment;
      const total = counts.supported + counts.blocked + counts.outdated + counts.missing;
      return total === counts.blocking ? true : `${total} != ${counts.blocking}`;
    },
  );
  check("Command invariants", "A prerequisite cycle blocks its members instead of passing", () => {    const requirements = [
      syntheticRequirement("REQ-a-1", { prerequisiteIds: ["REQ-b-1"] }),
      syntheticRequirement("REQ-b-1", { prerequisiteIds: ["REQ-a-1"] }),
    ];
    const assessment = evaluate(projectWithBrief(), requirements, []);
    return assessment.requirements.every(
      (result) => result.status === "blocked" && result.residuals[0]?.code === "prerequisite_cycle",
    );
  });
  check("Command invariants", "A legacy or tampered export is rejected on import", () => {
    const doc = store.export();
    let legacy = false;
    let tampered = false;
    try {
      Store.fromExport({ ...doc, exportVersion: "1.0" });
    } catch (error) {
      legacy = describeCommandError(error).startsWith("invalid_export");
    }
    try {
      const mutated = JSON.parse(JSON.stringify(doc));
      mutated.decisions[0].evidenceSetDigest = `sha256:${"0".repeat(64)}`;
      Store.fromExport(mutated);
    } catch (error) {
      tampered = describeCommandError(error).startsWith("invalid_export");
    }
    return legacy && tampered;
  });

  const passed = results.filter((result) => result.ok).length;
  return {
    results,
    passed,
    failed: results.length - passed,
    ranAt: new Date().toISOString(),
    durationMs: Math.round(performance.now() - started),
  };
}
