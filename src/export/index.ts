// src/export — self-contained HTML report, print CSS (3-channel status), ZIP +
// CSV/JSON manifests, trust footer (AD-12, AD-20, AD-22). Uses fflate (ZIP) and
// csv-stringify. Rendering is filled in across Epic 4 (Stories 4.2–4.4).
//
// Story 4.1 lands the PURE inclusion resolver — the one place inclusion + the
// derived audience are decided (AD-21).
export * from "./inclusion";
