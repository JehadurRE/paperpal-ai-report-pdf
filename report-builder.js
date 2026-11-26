/**
 * Shared standalone HTML report builder used by BOTH background.js (for CDP
 * Page.printToPDF on about:blank) and report.js (for Download HTML).
 * Produces a 100% self-contained, print-ready HTML document with exact Paperpal
 * highlight styles and clean pagination.
 */
((globalScope) => {
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeCssString(str) {
    return String(str || "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, " ");
  }

  function safeColor(color, fallback) {
    const c = String(color || "").trim();
    if (/^(rgb|rgba)\([0-9.,\s%]+\)$|^#[0-9a-fA-F]{3,8}$/.test(c)) {
      return c;
    }
    return fallback;
  }

  function buildStandaloneReportHtml(payload, settings = {}) {
    const pageSize = settings.pageSize === "a4" ? "A4 portrait" : "letter portrait";
    const includeSummary = settings.includeSummary !== false;
    const includeSourceFooter = settings.includeSourceFooter !== false;

    const shortDocTitle = (payload.docTitle || "Document").slice(0, 68);
    const footerLabel = escapeCssString(`Paperpal AI Detection Check Report — ${shortDocTitle}`);

    const summary = payload.summary || {};
    const scoreVal = escapeHtml(summary.scoreValue || "—");
    const scoreColor = safeColor(summary.scoreColor, "rgb(164, 122, 0)");
    const verdictBg = safeColor(summary.verdictBg, "rgba(255, 248, 155, 0.45)");
    const verdictBorder = safeColor(summary.verdictBorder, "rgb(237, 221, 0)");

    const healthHtml =
      summary.healthMetrics && summary.healthMetrics.length
        ? `<div><strong>Document Health Check:</strong> ${escapeHtml(summary.healthMetrics.join(" • "))}</div>`
        : "";

    const reportIdHtml = payload.reportId
      ? `<div><strong>Report ID:</strong> ${escapeHtml(payload.reportId)}</div>`
      : "";

    const legendItemsHtml = (payload.legendItems || [])
      .map(
        (item) => `
        <li class="legend-item">
          <span class="swatch ${escapeHtml(item.swatchClass || "")}"></span>
          <div><span class="legend-label">${escapeHtml(item.label)}</span> &mdash; <span class="legend-desc">${escapeHtml(item.desc)}</span></div>
        </li>`
      )
      .join("");

    const coverageText =
      summary.wordsScannedText || `${payload.approxWordCount || 0} words captured`;
    const disclaimerBody = (summary.disclaimer || "Results are estimates of writing patterns, not proof of AI use.")
      .replace(/^Disclaimer:\s*/i, "");

    const summarySectionHtml = includeSummary
      ? `
  <section class="summary-grid">
    <div class="card">
      <h2 class="card-title">AI Writing Identified</h2>
      <div class="score-row">
        <span class="score-num" style="color:${scoreColor}">${scoreVal}</span>${
          summary.scoreValue
            ? `<span class="score-pct" style="color:${scoreColor}">%</span>`
            : ""
        }
      </div>
      ${
        summary.verdictText
          ? `<div class="verdict-pill" style="background:${verdictBg};border-color:${verdictBorder}">${escapeHtml(summary.verdictText)}</div>`
          : ""
      }
      ${
        summary.checkNote
          ? `<p class="partial-note">${escapeHtml(summary.checkNote)}</p>`
          : ""
      }
    </div>

    <div class="card">
      <h2 class="card-title">Highlight Color Key (As Displayed)</h2>
      <ul class="legend-list">
        ${legendItemsHtml}
      </ul>
    </div>
  </section>

  <div class="meta-bar">
    <div><strong>Disclaimer:</strong> ${escapeHtml(disclaimerBody)}</div>
    <div><strong>Coverage:</strong> ${escapeHtml(coverageText)}</div>
  </div>`
      : "";

    const footerHtml = includeSourceFooter
      ? `
  <footer class="report-footer-note">
    <strong>Source URL:</strong> ${escapeHtml(payload.url || "")}<br/>
    Exported directly from the rendered HTML visible in Chrome (${Number(payload.paragraphCount) || 0} paragraphs preserved without scroll clipping). Locked plan-only breakdown numbers remain excluded.
  </footer>`
      : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Paperpal AI Detection Report — ${escapeHtml(shortDocTitle)}</title>
<style>
  @page {
    size: ${pageSize};
    margin: 0.55in 0.6in 0.6in 0.6in;
    @bottom-left {
      content: "${footerLabel}";
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 8pt;
      color: #64748b;
    }
    @bottom-right {
      content: "Page " counter(page) " of " counter(pages);
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 8pt;
      color: #64748b;
    }
  }

  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #051e57;
    font-family: "IBM Plex Sans", "Segoe UI", Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.5;
  }

  .report-header {
    border-bottom: 2px solid #1c4dc0;
    padding-bottom: 12px;
    margin-bottom: 16px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
  }

  .brand-kicker {
    font-size: 8.5pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #1c4dc0;
    margin-bottom: 2px;
  }

  .report-title {
    font-size: 18pt;
    font-weight: 700;
    color: #051e57;
    margin: 0 0 3px 0;
    line-height: 1.2;
  }

  .report-subtitle {
    font-size: 9.5pt;
    color: #475569;
    margin: 0;
  }

  .meta-right {
    text-align: right;
    font-size: 8pt;
    color: #475569;
    line-height: 1.45;
    flex-shrink: 0;
  }

  .meta-right strong {
    color: #051e57;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: 1.05fr 1fr;
    gap: 14px;
    margin-bottom: 14px;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .card {
    border: 1px solid #d9e2f3;
    border-radius: 10px;
    padding: 13px 15px;
    background: #ffffff;
  }

  .card-title {
    font-size: 10.5pt;
    font-weight: 700;
    color: #051e57;
    margin: 0 0 8px 0;
  }

  .score-row {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin-bottom: 8px;
  }

  .score-num {
    font-size: 28pt;
    font-weight: 700;
    line-height: 1;
  }

  .score-pct {
    font-size: 14pt;
    font-weight: 700;
  }

  .verdict-pill {
    border-radius: 7px;
    padding: 7px 10px;
    font-size: 9.2pt;
    color: #051e57;
    font-weight: 500;
    margin-bottom: 8px;
    border-width: 1px;
    border-style: solid;
  }

  .partial-note {
    font-size: 8.3pt;
    color: #475569;
    line-height: 1.4;
    margin: 0;
  }

  .legend-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .legend-item {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    font-size: 8.4pt;
    line-height: 1.35;
  }

  .swatch {
    width: 15px;
    height: 15px;
    border-radius: 4px;
    flex-shrink: 0;
    margin-top: 1px;
    border: 1px solid rgba(5, 30, 87, 0.14);
  }

  .swatch-ai { background-color: rgba(204, 36, 75, 0.25); border-color: rgba(204, 36, 75, 0.55); }
  .swatch-mostly-ai { background-color: rgba(255, 199, 156, 0.75); border-color: rgba(217, 119, 6, 0.55); }
  .swatch-blend-mid { background-color: rgba(255, 225, 148, 0.85); border-color: rgba(202, 138, 4, 0.55); }
  .swatch-mostly-human { background-color: rgba(255, 248, 155, 0.65); border-color: rgba(202, 168, 0, 0.6); }
  .swatch-human { background-color: rgba(8, 151, 56, 0.22); border-color: rgba(8, 151, 56, 0.5); }
  .swatch-unprocessed { background-color: #f8fafc; border: 1px dashed #94a3b8; }

  .legend-label { font-weight: 700; color: #051e57; }
  .legend-desc { color: #475569; }

  .meta-bar {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    padding: 7px 12px;
    margin-bottom: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 8.2pt;
    color: #475569;
    break-inside: avoid;
  }

  .meta-bar strong { color: #051e57; }

  .doc-section-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid #cbd5e1;
    padding-bottom: 5px;
    margin-bottom: 14px;
  }

  .doc-section-title { font-size: 11pt; font-weight: 700; color: #051e57; margin: 0; }
  .doc-section-sub { font-size: 8.5pt; color: #475569; }

  .ai-detection-report.ai-detection-active { background: #ffffff; color: #000000; }

  .ai-detection-report .ProseMirror p,
  .ai-detection-report .ProseMirror li,
  .ai-detection-report .ProseMirror blockquote {
    margin: 0 0 8.5pt 0;
    padding: 0;
    font-family: "Times New Roman", Times, serif;
    font-size: 11pt;
    line-height: 1.48;
    color: #000000;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    orphans: 3;
    widows: 3;
  }

  .ai-detection-report .ProseMirror h1,
  .ai-detection-report .ProseMirror h2,
  .ai-detection-report .ProseMirror h3,
  .ai-detection-report .ProseMirror h4,
  .ai-detection-report .ProseMirror p.pp-section-heading {
    margin-top: 12pt;
    margin-bottom: 6pt;
    font-family: "Times New Roman", Times, serif;
    font-weight: 700;
    break-after: avoid;
    page-break-after: avoid;
  }

  .ai-detection-report .ProseMirror > p:first-child {
    margin-top: 0 !important;
  }

  .ai-detection-report .ProseMirror p span {
    font-size: 11pt !important;
    line-height: 1.48 !important;
  }

  .ai-detection-report .ProseMirror a {
    color: rgb(28, 77, 192);
    text-decoration: underline;
    overflow-wrap: anywhere;
  }

  .ai-detection-report .ProseMirror a span { color: inherit; }

  .ai-detection-report .ai-detection {
    padding: 1.5px 0;
    border-radius: 2px;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }

  .ai-detection-active .ai-origin-text { background-color: rgba(204, 36, 75, 0.2) !important; }
  .ai-detection-active .mostly-ai-written-text { background-color: rgba(255, 199, 156, 0.7) !important; }
  .ai-detection-active .human-ai-blend { background-color: rgba(255, 225, 148, 0.8) !important; }
  .ai-detection-active .mostly-human-written-text { background-color: rgba(255, 248, 155, 0.5) !important; }
  .ai-detection-active .human-origin-text { background-color: rgba(8, 151, 56, 0.2) !important; }

  .ai-detection-report .ai-detection-unprocessed-text {
    color: rgb(148, 163, 184) !important;
    background-color: transparent !important;
  }

  .report-footer-note {
    margin-top: 18px;
    padding-top: 10px;
    border-top: 1px solid #cbd5e1;
    font-size: 8pt;
    color: #64748b;
    line-height: 1.45;
    break-inside: avoid;
    overflow-wrap: anywhere;
  }
</style>
</head>
<body>
  <header class="report-header">
    <div>
      <div class="brand-kicker">Paperpal &bull; AI Detector</div>
      <h1 class="report-title">AI Detection Check Results</h1>
      <p class="report-subtitle">An overview of AI and human writing patterns in your text</p>
    </div>
    <div class="meta-right">
      <div><strong>Date Captured:</strong> ${escapeHtml(payload.capturedDateFormatted || "")}</div>
      ${reportIdHtml}
      ${healthHtml}
    </div>
  </header>

  ${summarySectionHtml}

  <div class="doc-section-header">
    <h2 class="doc-section-title">Full Highlighted Document</h2>
    <span class="doc-section-sub">Captured verbatim (${Number(payload.paragraphCount) || 0} paragraphs)</span>
  </div>

  <main class="ai-detection-report ai-detection-active">
    <div class="ProseMirror">${payload.proseHtml || ""}</div>
  </main>

  ${footerHtml}
</body>
</html>`;
  }

  globalScope.__paperpalBuildStandaloneHtml = buildStandaloneReportHtml;
})(typeof self !== "undefined" ? self : window);
