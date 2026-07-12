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
// Story 4.4 lands the ZIP + CSV/JSON manifests (provenance + data_origin columns),
// the `is_demo` export hard-wall + `SAMPLE` badge, and the download filename — none
// of that is here; 4.3 renders/previews the on-screen document only.
export * from "./inclusion";
export * from "./report-html";
