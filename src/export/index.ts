// src/export — self-contained HTML report, print CSS (3-channel status), ZIP +
// CSV/JSON manifests, trust footer (AD-12, AD-20, AD-22). Uses fflate (ZIP) and
// csv-stringify. Rendering is filled in across Epic 4 (Stories 4.2–4.4).
//
// Story 4.1 lands the PURE inclusion resolver — the one place inclusion + the
// derived audience are decided (AD-21).
//
// Story 4.2 lands the Proof Appendix DATA + white-label branding on the builder
// view (`src/services/report.ts` + `app/_lib/report-branding.ts`), NOT the render.
//
// Story 4.3 lands the self-contained HTML render (`report-html.ts`): the PURE,
// presentation-injected document renderer — inline `<style>`, base64 screenshots,
// 3-channel R/Y/G status (colour + label + glyph), trust footer, print CSS
// (`print-color-adjust: exact`), and accessible semantic HTML. The shell assembler
// (`app/_lib/report-document.ts`) resolves the model (storage→base64, i18n, tokens,
// branding) and calls this renderer.
//
// Story 4.4 lands the PURE export builders — `manifest.ts` (CSV + JSON proof
// manifests carrying `machine_or_human` + `data_origin`) and `bundle.ts` (the
// deterministic `fflate` ZIP). The `is_demo` export hard-wall + `SAMPLE` marker +
// download filename are the SHELL's job (`app/_lib/report-export.ts` + the
// `report/download` route), which composes these pure builders over a resolved
// model — same pure-core / imperative-shell split as `report-html.ts` (AD-2).
export * from "./bundle";
export * from "./inclusion";
export * from "./manifest";
export * from "./report-html";
