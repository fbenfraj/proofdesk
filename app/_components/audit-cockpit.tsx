"use client";

import "./board.css";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InfoTip } from "@/app/_components/info-tip";
import type { BoardRowView } from "@/src/services";
import { PROOF_STATUS_TOKENS } from "../_lib/design-tokens";
import { type Locale, localeStrings } from "../_lib/i18n";
import { proofStatusToDisplayKey } from "../_lib/proof-status";
import { ProofBoard } from "./proof-board";

// Story 1.7 — the Audit Cockpit: the "Run Proof Audit" button, the staged
// reveal, and the Proof-Readiness summary, composed over the Story-1.6 board.
//
// The verdict is NEVER produced here — the button POSTs to /api/audit, the pure
// engine runs server-side over the persisted evidence (AD-1/AD-9), and this
// component only DRAMATIZES the already-computed result. The reveal is decorative
// (NFR-D7): under prefers-reduced-motion the identical final DOM renders at once.
// Counts are always transparent (7·1·1), never an opaque score (AD-12).

type Phase = "idle" | "running" | "done";

interface RunAuditResponse {
  rows: BoardRowView[];
  readiness: { green: number; yellow: number; red: number; pending: number; total: number };
  ranAt: string;
}

/** A pending twin of a row — the pre-reveal display state. */
function asPending(row: BoardRowView): BoardRowView {
  return { ...row, status: { kind: "pending" } };
}

/** Display-only tally over whatever statuses are currently shown (counts up as
 *  rows reveal). The TESTED authority is the service `summarizeReadiness`; this
 *  mirror only drives the visible number and never runs the audit. */
function tally(rows: BoardRowView[]): { green: number; yellow: number; red: number } {
  const counts = { green: 0, yellow: 0, red: 0 };
  for (const row of rows) {
    if (row.status.kind === "resolved") counts[row.status.status] += 1;
  }
  return counts;
}

/** Local wall-clock HH:MM for the "last run" stamp (mono). */
function formatClock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function AuditCockpit({
  initialRows,
  locale,
  campaignId,
}: {
  initialRows: BoardRowView[];
  locale: Locale;
  campaignId: string;
}) {
  const strings = localeStrings(locale);
  const t = strings.audit;
  const router = useRouter();

  // Rows may already be resolved on a fresh load (a prior run persisted them):
  // start in the settled "done" state so a reload shows the counts without
  // re-animating. Only an explicit button press animates.
  //
  // Require EVERY row to be resolved — a mixed board (e.g. a Deliverable added
  // after a prior run, or a partially-written run) must read as not-yet-complete
  // so the completed reading note never shows while pending rows still exist. An
  // empty/unseeded board stays idle (shows the pending prompt, not 0·0·0 counts).
  const initiallyResolved =
    initialRows.length > 0 && initialRows.every((r) => r.status.kind === "resolved");
  const [phase, setPhase] = useState<Phase>(initiallyResolved ? "done" : "idle");
  const [resolvedRows, setResolvedRows] = useState<BoardRowView[] | null>(
    initiallyResolved ? initialRows : null,
  );
  const [revealed, setRevealed] = useState<Set<string>>(
    () => new Set(initiallyResolved ? initialRows.map((r) => r.claimId) : []),
  );
  const [ranAt, setRanAt] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    for (const id of timers.current) clearTimeout(id);
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  // The rows the board renders. During the staged reveal, un-revealed rows show
  // their pending stamp; everything else shows the resolved verdict.
  const displayRows: BoardRowView[] = useMemo(() => {
    const base = resolvedRows ?? initialRows;
    if (phase === "running") {
      return base.map((row) => (revealed.has(row.claimId) ? row : asPending(row)));
    }
    return base;
  }, [resolvedRows, initialRows, phase, revealed]);

  const counts = tally(displayRows);
  const marked = (resolvedRows ?? initialRows).filter(
    (r) => r.claimedStatus === "delivered",
  ).length;
  const total = (resolvedRows ?? initialRows).length;
  const showCounts = phase !== "idle" || displayRows.some((r) => r.status.kind === "resolved");
  const complete = phase === "done";

  const finish = useCallback(
    (result: RunAuditResponse) => {
      setPhase("done");
      setAnnouncement(
        t.announcement({
          green: result.readiness.green,
          yellow: result.readiness.yellow,
          red: result.readiness.red,
          marked,
          total: result.readiness.total,
        }),
      );
      // Reconcile the server-rendered board so a later full reload reflects the
      // freshly persisted verdicts (the reveal state stays intact — soft refresh).
      router.refresh();
    },
    [t, marked, router],
  );

  const runReveal = useCallback(
    (result: RunAuditResponse) => {
      // Reduced motion: no staging — the identical final DOM and a single
      // announcement, immediately (NFR-D7, testable AC).
      if (prefersReducedMotion()) {
        setRevealed(new Set(result.rows.map((r) => r.claimId)));
        finish(result);
        return;
      }

      // Staged reveal (~1.5s): greens settle first, the problem rows (Caveated,
      // then Can't-claim) settle LAST. Purely decorative — the verdict is fixed.
      const bucket = (status: "green" | "yellow" | "red") =>
        result.rows.filter((r) => r.status.kind === "resolved" && r.status.status === status);
      const greens = bucket("green");
      const yellows = bucket("yellow");
      const reds = bucket("red");

      const schedule: { id: string; at: number }[] = [];
      const enqueue = (rows: BoardRowView[], base: number, step: number) => {
        rows.forEach((r, i) => {
          schedule.push({ id: r.claimId, at: base + i * step });
        });
      };
      enqueue(greens, 140, 90); // greens cascade first (~0.14–0.7s)
      enqueue(yellows, 1000, 120); // the Caveated problem row settles later
      enqueue(reds, 1300, 120); // the Can't-claim problem row settles LAST

      for (const step of schedule) {
        timers.current.push(
          setTimeout(() => {
            setRevealed((prev) => new Set(prev).add(step.id));
          }, step.at),
        );
      }
      const last = schedule.reduce((m, s) => Math.max(m, s.at), 0);
      timers.current.push(setTimeout(() => finish(result), Math.min(last + 200, 1500)));
    },
    [finish],
  );

  const onRun = useCallback(async () => {
    if (phase === "running") return;
    clearTimers();
    setAnnouncement("");
    setRevealed(new Set());
    setResolvedRows(null);
    setPhase("running");

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });
      if (!res.ok) throw new Error(`Audit request failed: ${res.status}`);
      const result: RunAuditResponse = await res.json();
      setResolvedRows(result.rows);
      setRanAt(result.ranAt);
      runReveal(result);
    } catch {
      // Fall back to idle so the operator can retry; no partial/faked verdict.
      setPhase(initiallyResolved ? "done" : "idle");
      if (initiallyResolved) setResolvedRows(initialRows);
    }
  }, [phase, campaignId, clearTimers, runReveal, initiallyResolved, initialRows]);

  const buttonLabel =
    phase === "running" ? (
      t.runningButton
    ) : ranAt ? (
      <>
        {t.reRunPrefix}
        <span className="pd-run-btn__time">{formatClock(ranAt)}</span>
      </>
    ) : (
      t.runButton
    );

  return (
    <div className="pd-cockpit">
      <div className="pd-cockpit__head">
        <h1 className="pd-page-title">{strings.board.title}</h1>
        <button
          type="button"
          className="pd-run-btn"
          onClick={onRun}
          disabled={phase === "running"}
          aria-busy={phase === "running"}
        >
          {buttonLabel}
        </button>
      </div>

      <p className="pd-lead">{strings.board.lead}</p>

      <section className="pd-readiness" aria-label={t.readinessTitle}>
        <p className="label-caps pd-readiness__label">{t.readinessTitle}</p>

        {showCounts ? (
          <ReadinessCounts counts={counts} labels={t.statusLabel} locale={locale} />
        ) : (
          <p className="pd-readiness__pending">{t.readinessPending}</p>
        )}

        {phase === "running" && <p className="pd-run-line">{t.runningLine}</p>}
        {complete && (
          <p className="pd-readiness__note">{t.readingNote(marked, total, counts.green)}</p>
        )}

        <p className="pd-readiness__caption">{t.readinessCaption}</p>
        {/* The FR-16 automation disclaimer + the AD-22 legal disclaimer render
            once as a standing footer in AppShell (Story 1.10), covering every
            verdict surface — not repeated per-surface here. */}

        {/* aria-live status message: announced once at completion, on BOTH motion
            paths (UX-DR25 / WCAG 4.1.3). Not the visible counts, so the staged
            count-up never narrates row-by-row. */}
        <p className="pd-sr-only" aria-live="polite">
          {announcement}
        </p>
      </section>

      <ProofBoard rows={displayRows} locale={locale} />
    </div>
  );
}

/** Serif counts, each preceded by its shape glyph, in the fixed R→Y→R order.
 *  Three-channel (colour + glyph + title-case label), never an opaque score. */
function ReadinessCounts({
  counts,
  labels,
  locale,
}: {
  counts: { green: number; yellow: number; red: number };
  labels: { defensible: string; caveated: string; cantClaim: string };
  locale: Locale;
}) {
  const items = [
    {
      key: "green",
      displayKey: proofStatusToDisplayKey("green"),
      n: counts.green,
      label: labels.defensible,
      termKey: "defensible",
    },
    {
      key: "yellow",
      displayKey: proofStatusToDisplayKey("yellow"),
      n: counts.yellow,
      label: labels.caveated,
      termKey: "caveated",
    },
    {
      key: "red",
      displayKey: proofStatusToDisplayKey("red"),
      n: counts.red,
      label: labels.cantClaim,
      termKey: "cant-claim",
    },
  ] as const;

  return (
    <p className="pd-readiness__counts">
      {items.map((item, i) => (
        <span
          key={item.key}
          className={`pd-readiness__count pd-readiness__count--${item.displayKey}`}
        >
          <span className="pd-stamp__glyph pd-readiness__glyph" aria-hidden="true">
            {PROOF_STATUS_TOKENS[item.displayKey].glyph}
          </span>
          <span className="pd-readiness__n">{item.n}</span>
          <span className="pd-readiness__count-label">
            <InfoTip termKey={item.termKey} locale={locale}>
              {item.label}
            </InfoTip>
          </span>
          {i < items.length - 1 && (
            <span className="pd-readiness__sep" aria-hidden="true">
              ·
            </span>
          )}
        </span>
      ))}
    </p>
  );
}
