"use client";

import "./proof-brief.css";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CRITICALITY, type Criticality } from "@/src/schema/enums";
import type {
  BriefRequirementView,
  DeliverableBriefView,
  ProofBriefView,
  TemplateOptionView,
} from "@/src/services";
import { type Locale, localeStrings } from "../_lib/i18n";

// The Proof Brief surface (Story 3.2, FR-3, UX-DR21). Per Deliverable the
// operator picks a type template (Story-3.1 default set, shown with its
// provisional/not-yet-confirmed honesty), then adds / edits / removes Proof
// Requirements. Each edit persists as a `proof_requirement` row — the SAME rows
// the audit reads — so the configured set IS the bar the audit measures against.
//
// Criticality renders on TWO non-colour channels (UX-DR14/NFR-D7): a text label
// PLUS a red-tinted (critical) / muted (supporting) tag — never colour alone.
// Removal is refused when evidence is linked (never orphan a receipt, AC6).

type MutationOutcome = { ok: true; view: DeliverableBriefView } | { ok: false; blocked: boolean };

async function mutateBrief(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<MutationOutcome> {
  try {
    const res = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) return { ok: false, blocked: res.status === 409 };
    return { ok: true, view: (await res.json()) as DeliverableBriefView };
  } catch {
    return { ok: false, blocked: false };
  }
}

export function ProofBrief({
  locale,
  initialBrief,
}: {
  locale: Locale;
  initialBrief: ProofBriefView | null;
}) {
  const s = localeStrings(locale);
  const [deliverables, setDeliverables] = useState<DeliverableBriefView[]>(
    initialBrief?.deliverables ?? [],
  );

  function replaceDeliverable(view: DeliverableBriefView) {
    setDeliverables((prev) => prev.map((d) => (d.deliverableId === view.deliverableId ? view : d)));
  }

  return (
    <section className="pd-pbrief">
      <header className="pd-pbrief__head">
        <h1 className="pd-page-title">{s.proofBrief.title}</h1>
        <p className="pd-lead">{s.proofBrief.lead}</p>
      </header>

      {initialBrief === null || deliverables.length === 0 ? (
        <div className="pd-pbrief__board-empty">{s.board.emptyState}</div>
      ) : (
        <ol className="pd-pbrief__list">
          {deliverables.map((d) => (
            <li key={d.deliverableId}>
              <DeliverableSection
                locale={locale}
                deliverable={d}
                templates={initialBrief.templates}
                onChange={replaceDeliverable}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DeliverableSection({
  locale,
  deliverable,
  templates,
  onChange,
}: {
  locale: Locale;
  deliverable: DeliverableBriefView;
  templates: readonly TemplateOptionView[];
  onChange: (view: DeliverableBriefView) => void;
}) {
  const s = localeStrings(locale);
  const p = s.proofBrief;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const reqPath = `/api/deliverables/${encodeURIComponent(deliverable.deliverableId)}/proof-requirements`;

  async function run(outcome: Promise<MutationOutcome>) {
    setError(null);
    const result = await outcome;
    if (result.ok) {
      onChange(result.view);
      router.refresh();
      return true;
    }
    setError(result.blocked ? p.removeBlocked : p.error);
    return false;
  }

  return (
    <section className="pd-pbrief__deliverable">
      <h2 className="pd-pbrief__deliverable-title">
        {p.deliverableBy(deliverable.creatorName, deliverable.deliverableType)}
      </h2>

      {deliverable.isUnset ? (
        <UnsetState
          locale={locale}
          templates={templates}
          onApply={(type) =>
            run(mutateBrief(reqPath, "POST", { intent: "apply-template", applyTemplate: type }))
          }
        />
      ) : (
        <>
          <h3 className="pd-pbrief__reqs-heading">{p.requirementsHeading}</h3>
          <ul className="pd-pbrief__reqs">
            {deliverable.requirements.map((req) => (
              <li key={req.id}>
                <RequirementRow
                  locale={locale}
                  req={req}
                  onEdit={(patch) =>
                    run(mutateBrief(`${reqPath}/${encodeURIComponent(req.id)}`, "PATCH", patch))
                  }
                  onRemove={() =>
                    run(mutateBrief(`${reqPath}/${encodeURIComponent(req.id)}`, "DELETE"))
                  }
                />
              </li>
            ))}
          </ul>

          {adding ? (
            <AddRequirementForm
              locale={locale}
              onCancel={() => setAdding(false)}
              onSave={async (input) => {
                const ok = await run(mutateBrief(reqPath, "POST", { intent: "add", ...input }));
                if (ok) setAdding(false);
              }}
            />
          ) : (
            <button
              type="button"
              className="pd-btn-outline pd-pbrief__add"
              onClick={() => setAdding(true)}
            >
              {p.addRequirement}
            </button>
          )}
        </>
      )}

      {error ? <p className="pd-pbrief__error">{error}</p> : null}
    </section>
  );
}

function UnsetState({
  locale,
  templates,
  onApply,
}: {
  locale: Locale;
  templates: readonly TemplateOptionView[];
  onApply: (type: TemplateOptionView["deliverableType"]) => void;
}) {
  const s = localeStrings(locale);
  const p = s.proofBrief;
  const [selected, setSelected] = useState<TemplateOptionView["deliverableType"] | "">("");
  const preview = templates.find((t) => t.deliverableType === selected) ?? null;

  return (
    <div className="pd-pbrief__unset">
      <span className="pd-pbrief__unset-glyph" aria-hidden="true">
        ◯
      </span>
      <div className="pd-pbrief__unset-body">
        <p className="pd-pbrief__unset-heading">{p.unsetHeading}</p>
        <p className="pd-pbrief__unset-lead">{p.unsetBody}</p>

        <label className="pd-pbrief__field">
          <span>{p.pickTemplate}</span>
          <select
            className="pd-pbrief__select"
            value={selected}
            onChange={(e) =>
              setSelected(e.target.value as TemplateOptionView["deliverableType"] | "")
            }
          >
            <option value="">—</option>
            {templates.map((t) => (
              <option key={t.deliverableType} value={t.deliverableType}>
                {p.templateName[t.deliverableType]}
              </option>
            ))}
          </select>
        </label>

        {preview ? (
          <div className="pd-pbrief__preview">
            <div className="pd-pbrief__preview-head">
              <span className="pd-pbrief__preview-title">{p.templatePreviewHeading}</span>
              {preview.provisional ? (
                <span className="pd-pbrief__provisional" title={p.provisionalNote}>
                  {p.provisionalBadge}
                </span>
              ) : null}
            </div>
            {preview.provisional ? (
              <p className="pd-pbrief__provisional-note">{p.provisionalNote}</p>
            ) : null}
            <ul className="pd-pbrief__preview-list">
              {preview.requirements.map((r) => (
                <li key={r.kind} className="pd-pbrief__preview-item">
                  <CriticalityTag locale={locale} criticality={r.criticality} />
                  <span className="pd-pbrief__preview-label">{r.label || r.kind}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="pd-btn-outline"
              onClick={() => preview && onApply(preview.deliverableType)}
            >
              {p.applyTemplate}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RequirementRow({
  locale,
  req,
  onEdit,
  onRemove,
}: {
  locale: Locale;
  req: BriefRequirementView;
  onEdit: (patch: { criticality?: Criticality; label?: string }) => Promise<boolean>;
  onRemove: () => void;
}) {
  const s = localeStrings(locale);
  const p = s.proofBrief;
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(req.label);
  const [criticality, setCriticality] = useState<Criticality>(req.criticality);

  if (editing) {
    return (
      <div className="pd-pbrief__req pd-pbrief__req--editing">
        <label className="pd-pbrief__field">
          <span>{p.labelLabel}</span>
          <input
            className="pd-pbrief__input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={p.labelPlaceholder}
          />
        </label>
        <label className="pd-pbrief__field">
          <span>{p.criticalityLabel}</span>
          <select
            className="pd-pbrief__select"
            value={criticality}
            onChange={(e) => setCriticality(e.target.value as Criticality)}
          >
            {CRITICALITY.map((c) => (
              <option key={c} value={c}>
                {s.drawer.criticality[c]}
              </option>
            ))}
          </select>
        </label>
        <div className="pd-pbrief__req-actions">
          <button
            type="button"
            className="pd-btn-outline"
            onClick={async () => {
              const ok = await onEdit({ criticality, label });
              if (ok) setEditing(false);
            }}
          >
            {p.save}
          </button>
          <button
            type="button"
            className="pd-btn-outline"
            onClick={() => {
              setLabel(req.label);
              setCriticality(req.criticality);
              setEditing(false);
            }}
          >
            {p.cancel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pd-pbrief__req">
      <CriticalityTag locale={locale} criticality={req.criticality} />
      <div className="pd-pbrief__req-body">
        <span className="pd-pbrief__req-label">{req.label || req.kind}</span>
        <span className="pd-pbrief__req-sat">
          {p.satisfiedByLabel}: {p.satisfaction[req.satisfactionType]}
        </span>
      </div>
      <div className="pd-pbrief__req-actions">
        <button type="button" className="pd-btn-outline" onClick={() => setEditing(true)}>
          {p.edit}
        </button>
        <button type="button" className="pd-btn-outline" onClick={onRemove}>
          {p.remove}
        </button>
      </div>
    </div>
  );
}

function AddRequirementForm({
  locale,
  onSave,
  onCancel,
}: {
  locale: Locale;
  onSave: (input: { kind: string; criticality: Criticality; label: string }) => void;
  onCancel: () => void;
}) {
  const s = localeStrings(locale);
  const p = s.proofBrief;
  const [kind, setKind] = useState("");
  const [label, setLabel] = useState("");
  const [criticality, setCriticality] = useState<Criticality>("supporting");

  const canSave = kind.trim().length > 0;

  return (
    <div className="pd-pbrief__add-form">
      <label className="pd-pbrief__field">
        <span>{p.kindLabel}</span>
        <input
          className="pd-pbrief__input"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          placeholder={p.kindPlaceholder}
        />
      </label>
      <label className="pd-pbrief__field">
        <span>{p.labelLabel}</span>
        <input
          className="pd-pbrief__input"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={p.labelPlaceholder}
        />
      </label>
      <label className="pd-pbrief__field">
        <span>{p.criticalityLabel}</span>
        <select
          className="pd-pbrief__select"
          value={criticality}
          onChange={(e) => setCriticality(e.target.value as Criticality)}
        >
          {CRITICALITY.map((c) => (
            <option key={c} value={c}>
              {s.drawer.criticality[c]}
            </option>
          ))}
        </select>
      </label>
      <div className="pd-pbrief__req-actions">
        <button
          type="button"
          className="pd-btn-outline"
          disabled={!canSave}
          onClick={() => onSave({ kind: kind.trim(), criticality, label: label.trim() })}
        >
          {p.save}
        </button>
        <button type="button" className="pd-btn-outline" onClick={onCancel}>
          {p.cancel}
        </button>
      </div>
    </div>
  );
}

function CriticalityTag({ locale, criticality }: { locale: Locale; criticality: Criticality }) {
  const s = localeStrings(locale);
  return (
    <span className={`pd-pbrief__crit pd-pbrief__crit--${criticality}`}>
      {s.drawer.criticality[criticality]}
    </span>
  );
}
