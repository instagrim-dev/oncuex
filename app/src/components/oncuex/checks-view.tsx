import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { runSelfChecks, type SelfCheckReport } from "@/oncuex/selfcheck";
import { CheckCircle2, FlaskConical, Play, RefreshCw, XCircle } from "lucide-react";
import { Chip, Note, Panel } from "./ui-bits";
import { cn } from "@/lib/utils";

export function ChecksView() {
  const [report, setReport] = useState<SelfCheckReport | null>(null);
  const ran = useRef(false);

  const run = () => {
    const result = runSelfChecks();
    setReport(result);
    console.info(
      `[OnCueX self-check] ${result.passed}/${result.results.length} checks passed in ${result.durationMs} ms`,
    );
    const failures = result.results.filter((check) => !check.ok);
    if (failures.length) console.warn("[OnCueX self-check] failures", failures);
  };

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    run();
  }, []);

  const groups = report
    ? [...new Set(report.results.map((result) => result.group))]
    : [];

  return (
    <div className="space-y-4">
      <Panel
        eyebrow="Self-check"
        title="The deterministic core, exercised through its own commands"
        description="This panel is the test harness. Expected values live here only; the operator screens never read them."
        actions={
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[12px]" onClick={run}>
            <RefreshCw className="size-3.5" />
            Run again
          </Button>
        }
      >
        {report ? (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Passed
                </p>
                <p className="tnum text-2xl font-semibold text-success">{report.passed}</p>
              </div>
              <div
                className={cn(
                  "rounded-lg border p-3",
                  report.failed
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-border/70",
                )}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Failed
                </p>
                <p
                  className={cn(
                    "tnum text-2xl font-semibold",
                    report.failed ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {report.failed}
                </p>
              </div>
              <div className="rounded-lg border border-border/70 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Duration
                </p>
                <p className="tnum text-2xl font-semibold">{report.durationMs} ms</p>
              </div>
              <div className="rounded-lg border border-border/70 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Ran at
                </p>
                <p className="text-[12px] font-semibold">
                  {new Date(report.ranAt).toLocaleTimeString()}
                </p>
                <p className="text-[10.5px] text-muted-foreground">In this browser session</p>
              </div>
            </div>

            <div className="mt-3">
              <Note
                tone={report.failed ? "danger" : "success"}
                icon={report.failed ? XCircle : CheckCircle2}
              >
                {report.failed
                  ? `${report.failed} check(s) failed. Treat the record as unverified until they pass.`
                  : `All ${report.results.length} checks passed: digests, the canonical path, currentness, expiry, archive and command invariants.`}
              </Note>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Play className="size-4" />
            Running the checks…
          </div>
        )}
      </Panel>

      {groups.map((group) => (
        <Panel
          key={group}
          eyebrow="Checks"
          title={group}
          actions={
            <Chip tone="neutral">
              {report?.results.filter((result) => result.group === group && result.ok).length} /{" "}
              {report?.results.filter((result) => result.group === group).length}
            </Chip>
          }
        >
          <ul className="space-y-1.5">
            {(report?.results ?? [])
              .filter((result) => result.group === group)
              .map((result) => (
                <li
                  key={result.label}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border px-3 py-2",
                    result.ok
                      ? "border-border/60 bg-muted/20"
                      : "border-destructive/30 bg-destructive/5",
                  )}
                >
                  {result.ok ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <p className="text-[12.5px] leading-5">{result.label}</p>
                    {!result.ok && result.detail && (
                      <p className="mt-0.5 break-words font-mono text-[10.5px] text-destructive">
                        {result.detail}
                      </p>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        </Panel>
      ))}

      <Panel eyebrow="Scope" title="What this check does and does not establish">
        <div className="space-y-2 text-[12px] leading-5 text-muted-foreground">
          <p>
            It runs the TypeScript port of the schema, evaluator and store against the reviewed
            fixture data, then replays the reference path through the same public commands the UI
            calls. It covers digests, the canonical walkthrough, decision currentness across reload,
            expiry without revision movement, archive immutability and the command invariants.
          </p>
          <p>
            It does not replace the Python reference suite, and it does not establish anything about a
            deployed backend: this milestone is a single-browser record persisted locally. It also
            cannot prove how another browser rendered the page.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Chip tone="neutral">schema</Chip>
            <Chip tone="neutral">evaluator</Chip>
            <Chip tone="neutral">impact</Chip>
            <Chip tone="neutral">commands</Chip>
            <Chip tone="neutral">export / reload</Chip>
          </div>
        </div>
        <div className="mt-3">
          <Note tone="neutral" icon={FlaskConical}>
            The result is also written to the browser console, so a reviewer can capture it alongside
            the walkthrough.
          </Note>
        </div>
      </Panel>
    </div>
  );
}
