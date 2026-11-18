import { useCallback, useRef, useState } from "react";

import { describeCommandError, Store } from "@/oncuex/store";
import { hasBrief } from "@/oncuex/engine";
import { PERSONAS, REQUIREMENTS, initialProject } from "@/oncuex/scenario";
import { loadBaseline } from "@/oncuex/demo";
import { useSourceReview } from "@/hooks/use-source-review";
import { emptyReview, isReviewData } from "@/oncuex/source-review";
import type { Role } from "@/oncuex/types";

const STORAGE_KEY = "oncuex.operator.record.v2";
const BLANK_KEY = "oncuex.blank.v1";

const freshStore = () =>
  new Store(initialProject(), structuredClone(REQUIREMENTS), []);

interface SavedRecord {
  store: Store;
  savedAt: string | null;
}

interface BootState {
  store: Store;
  restoredAt: string | null;
  savedAt: string | null;
  notice: string | null;
}

function readSaved(): SavedRecord | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; export?: unknown };
    const store = Store.fromExport(parsed.export);
    return {
      store,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : null,
    };
  } catch {
    return null;
  }
}

function boot(): BootState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // A deliberate clean reset stays blank across reloads. A first visit
      // opens the reviewed sample through the same commands as the walkthrough.
      if (window.localStorage.getItem(BLANK_KEY) === "1") {
        return { store: freshStore(), restoredAt: null, savedAt: null, notice: null };
      }
      const store = freshStore();
      loadBaseline(store);
      const persisted = persist(store);
      return { store, restoredAt: null, savedAt: persisted.savedAt, notice: null };
    }
    const parsed = JSON.parse(raw) as { savedAt?: unknown; export?: unknown };
    const store = Store.fromExport(parsed.export);
    const savedAt = typeof parsed.savedAt === "string" ? parsed.savedAt : null;
    return { store, restoredAt: savedAt, savedAt, notice: null };
  } catch (error) {
    return {
      store: freshStore(),
      restoredAt: null,
      savedAt: null,
      notice: `A saved record could not be validated (${describeCommandError(error)}). A clean record was opened; the rejected export was not loaded.`,
    };
  }
}

function persist(store: Store): { savedAt: string | null; warning: string | null } {
  if (!hasBrief(store.snapshot())) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage may be unavailable; the in-memory record still works.
    }
    return { savedAt: null, warning: null };
  }
  try {
    const savedAt = new Date().toISOString();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ savedAt, export: store.export() }),
    );
    window.localStorage.removeItem(BLANK_KEY);
    return { savedAt, warning: null };
  } catch (error) {
    return {
      savedAt: null,
      warning: `The record could not be saved locally (${describeCommandError(error)}). Work continues in memory.`,
    };
  }
}

export interface ReloadCheck {
  ok: boolean;
  detail: string;
}

export function useOperatorSession() {
  const review = useSourceReview();
  const replaceReview = review.replace;
  const [bootState] = useState(boot);
  const storeRef = useRef(bootState.store);
  const [version, setVersion] = useState(0);
  const [personaId, setPersonaId] = useState(PERSONAS[0].id);
  const [error, setError] = useState<string | null>(bootState.notice);
  const [flash, setFlash] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(bootState.savedAt);
  const [reloadCheck, setReloadCheck] = useState<ReloadCheck | null>(
    bootState.restoredAt
      ? {
          ok: true,
          detail: `Rehydrated a validated export saved at ${new Date(
            bootState.restoredAt,
          ).toLocaleString()}. Counters and decisions were restored from the record.`,
        }
      : null,
  );

  const persona = PERSONAS.find((candidate) => candidate.id === personaId) ?? PERSONAS[0];

  const apply = useCallback((label: string, action: (store: Store) => string) => {
    const store = storeRef.current;
    try {
      const detail = action(store);
      const persisted = persist(store);
      setSavedAt(persisted.savedAt);
      setError(persisted.warning);
      setFlash(`${label} — ${detail}`);
    } catch (commandError) {
      setFlash(null);
      setError(describeCommandError(commandError));
      // A rejected command writes nothing, but a multi-command action can stop
      // midway. Restore the last saved record so the screen never shows a
      // half-applied sequence.
      const recovered = readSaved();
      storeRef.current = recovered ? recovered.store : freshStore();
      setSavedAt(recovered?.savedAt ?? null);
    }
    setVersion((current) => current + 1);
  }, []);

  const setClock = useCallback((iso: string) => {
    storeRef.current.setClock(iso);
    const persisted = persist(storeRef.current);
    setSavedAt(persisted.savedAt);
    setError(persisted.warning);
    setFlash(
      `Review clock set to ${new Date(iso).toISOString().replace("T", " ").replace(".000Z", " UTC")} — expiry is evaluated from the clock and writes no event.`,
    );
    setVersion((current) => current + 1);
  }, []);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    try {
      window.localStorage.setItem(BLANK_KEY, "1");
    } catch {
      // Storage may be unavailable; the in-memory blank state still works.
    }
    storeRef.current = freshStore();
    replaceReview(emptyReview());
    setSavedAt(null);
    setReloadCheck(null);
    setPersonaId(PERSONAS[0].id);
    setFlash("A blank event is ready. You can start with the sample plan when you are.");
    setError(null);
    setVersion((current) => current + 1);
  }, [replaceReview]);

  const reloadSample = useCallback(() => {
    try {
      window.localStorage.removeItem(BLANK_KEY);
    } catch {
      // ignore
    }
    const store = freshStore();
    loadBaseline(store);
    const persisted = persist(store);
    storeRef.current = store;
    setSavedAt(persisted.savedAt);
    setReloadCheck(null);
    setPersonaId(PERSONAS[0].id);
    setFlash("Sample plan reloaded. The Northwind launch is ready to review.");
    setError(persisted.warning);
    setVersion((current) => current + 1);
  }, []);

  const reloadFromExport = useCallback(() => {
    const before = storeRef.current;
    try {
      const saved = readSaved();
      if (!saved) {
        setReloadCheck({
          ok: false,
          detail:
            "No saved export on this device yet. The record is persisted after the brief is adopted.",
        });
        setVersion((current) => current + 1);
        return;
      }
      const restored = Store.fromExport(
        JSON.parse(JSON.stringify(saved.store.export())),
      );
      const countersMatch =
        restored.sequence === before.sequence &&
        restored.assessmentRevision === before.assessmentRevision;
      const decisionsMatch =
        JSON.stringify(restored.decisionsList().map((decision) => [decision.id, decision.targetAssessmentRevision])) ===
        JSON.stringify(before.decisionsList().map((decision) => [decision.id, decision.targetAssessmentRevision]));
      const currentness = restored
        .decisionsList()
        .map((decision) => `${decision.id}: ${restored.currentness(decision.id)}`)
        .join(", ");
      storeRef.current = restored;
      setReloadCheck({
        ok: countersMatch && decisionsMatch,
        detail: `Export v${restored.export().exportVersion} validated and rehydrated — sequence ${restored.sequence}, assessment revision ${restored.assessmentRevision}${
          currentness ? `; ${currentness}` : ""
        }.`,
      });
      setFlash("Reload completed from the saved, validated export.");
      setError(null);
    } catch (reloadError) {
      setReloadCheck({ ok: false, detail: describeCommandError(reloadError) });
      setFlash(null);
      setError(describeCommandError(reloadError));
    }
    setVersion((current) => current + 1);
  }, []);

  const restoreFromFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const bundle = parsed && typeof parsed === "object" && "oncuexProjectBundleVersion" in parsed ? parsed as { oncuexProjectBundleVersion: unknown; project: unknown; sourceReview: unknown } : null;
      if (bundle && (bundle.oncuexProjectBundleVersion !== 1 || !isReviewData(bundle.sourceReview))) throw new Error("The source review data is invalid.");
      const restored = Store.fromExport(bundle ? bundle.project : parsed);
      const persisted = persist(restored);
      storeRef.current = restored;
      if (bundle && isReviewData(bundle.sourceReview)) replaceReview(bundle.sourceReview);
      setSavedAt(persisted.savedAt);
      setReloadCheck({
        ok: true,
        detail: "Project data restored from a validated export.",
      });
      setFlash("Project data restored. The checklist, timeline and sign-offs were replayed.");
      setError(persisted.warning);
    } catch (error) {
      setFlash(null);
      setError(`The project data could not be restored: ${describeCommandError(error)}`);
    }
    setVersion((current) => current + 1);
  }, [replaceReview]);

  const downloadExport = useCallback(() => {
    const store = storeRef.current;
    const blob = new Blob([JSON.stringify({ oncuexProjectBundleVersion: 1, project: store.export(), sourceReview: review.data }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "oncuex-record.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [review.data]);

  const clearMessages = useCallback(() => {
    setError(null);
    setFlash(null);
  }, []);

  return {
    store: storeRef.current,
    review,
    version,
    persona,
    personaId,
    setPersonaId,
    role: persona.role as Role,
    error,
    flash,
    savedAt,
    reloadCheck,
    apply,
    setClock,
    reset,
    reloadSample,
    reloadFromExport,
    downloadExport,
    restoreFromFile,
    clearMessages,
  };
}
