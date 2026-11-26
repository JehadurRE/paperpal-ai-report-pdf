function escapeCssString(str) {
  return (str || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else node.setAttribute(k, String(v));
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function applyPageStyle(pageSize, footerTitle) {
  const sizeRule = pageSize === "a4" ? "A4 portrait" : "letter portrait";
  const safeFooter = escapeCssString(`Paperpal AI Detection Check Report — ${footerTitle}`);
  document.getElementById("dynamicPageStyle").textContent = `
    @page {
      size: ${sizeRule};
      margin: 0.55in 0.6in 0.6in 0.6in;
      @bottom-left {
        content: "${safeFooter}";
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
  `;
}

function renderReport(payload, settings) {
  const root = document.getElementById("reportRoot");
  root.innerHTML = "";

  const shortDocTitle = (payload.docTitle || "Document").slice(0, 68);
  document.title = `Paperpal AI Detection Report — ${shortDocTitle}`;
  applyPageStyle(settings.pageSize || "letter", shortDocTitle);

  // Header
  const metaRight = el("div", { class: "meta-right" }, [
    el("div", {}, [el("strong", { text: "Date Captured: " }), payload.capturedDateFormatted || ""]),
    payload.reportId
      ? el("div", {}, [el("strong", { text: "Report ID: " }), payload.reportId])
      : null,
    payload.summary.healthMetrics && payload.summary.healthMetrics.length
      ? el("div", {}, [
          el("strong", { text: "Document Health Check: " }),
          payload.summary.healthMetrics.join(" • ")
        ])
      : null
  ]);

  const header = el("header", { class: "report-header" }, [
    el("div", {}, [
      el("div", { class: "brand-kicker", text: "Paperpal • AI Detector" }),
      el("h1", { class: "report-title", text: "AI Detection Check Results" }),
      el("p", {
        class: "report-subtitle",
        text: "An overview of AI and human writing patterns in your text"
      })
    ]),
    metaRight
  ]);
  root.appendChild(header);

  // Summary & Highlight Legend
  if (settings.includeSummary !== false) {
    const scoreCard = el("div", { class: "card" }, [
      el("h2", { class: "card-title", text: "AI Writing Identified" }),
      el("div", { class: "score-row" }, [
        el("span", {
          class: "score-num",
          text: payload.summary.scoreValue || "—",
          style: { color: payload.summary.scoreColor || "rgb(164, 122, 0)" }
        }),
        payload.summary.scoreValue
          ? el("span", {
              class: "score-pct",
              text: "%",
              style: { color: payload.summary.scoreColor || "rgb(164, 122, 0)" }
            })
          : null
      ]),
      payload.summary.verdictText
        ? el("div", {
            class: "verdict-pill",
            text: payload.summary.verdictText,
            style: {
              backgroundColor: payload.summary.verdictBg || "rgba(255, 248, 155, 0.45)",
              borderColor: payload.summary.verdictBorder || "rgb(237, 221, 0)"
            }
          })
        : null,
      payload.summary.checkNote
        ? el("p", { class: "partial-note", text: payload.summary.checkNote })
        : null
    ]);

    const legendList = el(
      "ul",
      { class: "legend-list" },
      (payload.legendItems || []).map((item) =>
        el("li", { class: "legend-item" }, [
          el("span", { class: `swatch ${item.swatchClass}` }),
          el("div", {}, [
            el("span", { class: "legend-label", text: item.label }),
            " — ",
            el("span", { class: "legend-desc", text: item.desc })
          ])
        ])
      )
    );

    const legendCard = el("div", { class: "card" }, [
      el("h2", { class: "card-title", text: "Highlight Color Key (As Displayed)" }),
      legendList
    ]);

    root.appendChild(el("section", { class: "summary-grid" }, [scoreCard, legendCard]));

    const coverageText =
      payload.summary.wordsScannedText || `${payload.approxWordCount || 0} words captured`;
    root.appendChild(
      el("div", { class: "meta-bar" }, [
        el("div", {}, [
          el("strong", { text: "Disclaimer: " }),
          (payload.summary.disclaimer || "").replace(/^Disclaimer:\s*/i, "")
        ]),
        el("div", {}, [el("strong", { text: "Coverage: " }), coverageText])
      ])
    );
  }

  // Document section header
  root.appendChild(
    el("div", { class: "doc-section-header" }, [
      el("h2", { class: "doc-section-title", text: "Full Highlighted Document" }),
      el("span", {
        class: "doc-section-sub",
        text: `Captured verbatim (${payload.paragraphCount || 0} paragraphs)`
      })
    ])
  );

  // Parsed sanitized ProseMirror HTML
  const proseDiv = el("div", { class: "ProseMirror" });
  const parsed = new DOMParser().parseFromString(payload.proseHtml || "", "text/html");
  for (const child of Array.from(parsed.body.childNodes)) {
    proseDiv.appendChild(document.importNode(child, true));
  }

  const main = el("main", { class: "ai-detection-report ai-detection-active" }, [proseDiv]);
  root.appendChild(main);

  // Optional source URL footer
  if (settings.includeSourceFooter !== false) {
    root.appendChild(
      el("footer", { class: "report-footer-note" }, [
        el("strong", { text: "Source URL: " }),
        payload.url || "",
        el("br"),
        `Exported directly from the rendered HTML visible in Chrome (${payload.paragraphCount || 0} paragraphs preserved without scroll clipping). Locked plan-only breakdown numbers remain excluded.`
      ])
    );
  }
}

function downloadStandaloneHtml(payload, settings) {
  const html = window.__paperpalBuildStandaloneHtml(payload, settings);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const slug = (payload.docTitle || "Report")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50);
  a.href = url;
  a.download = `Paperpal_AI_Report_${slug}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function init() {
  const params = new URLSearchParams(location.search);
  const mode = params.get("mode") || "preview";
  const key = params.get("key");
  const autoprint = params.get("autoprint") === "1";

  if (!key) {
    document.getElementById("loadingState").textContent =
      "Missing report key. Open a Paperpal AI Detection report and trigger export from the extension.";
    return;
  }

  const stored = await chrome.storage.session.get(key);
  const entry = stored && stored[key];
  if (!entry || !entry.payload) {
    document.getElementById("loadingState").textContent =
      "Report session expired. Go back to the Paperpal tab and click Export PDF again.";
    return;
  }

  const { payload, settings = {} } = entry;

  if (mode === "preview") {
    document.body.classList.add("mode-preview");
    const toolbar = document.getElementById("previewToolbar");
    toolbar.hidden = false;
    document.getElementById("tbMeta").textContent = `${
      payload.summary.scoreValue ? payload.summary.scoreValue + "% AI" : "Report"
    } • ${payload.paragraphCount} paragraphs`;

    document.getElementById("tbPrint").addEventListener("click", () => window.print());
    document.getElementById("tbDownloadHtml").addEventListener("click", () =>
      downloadStandaloneHtml(payload, settings)
    );
    const btnPdf = document.getElementById("tbDownloadPdf");
    btnPdf.addEventListener("click", () => {
      btnPdf.disabled = true;
      btnPdf.textContent = "Generating PDF...";
      chrome.runtime.sendMessage({ type: "EXPORT_PDF_PAYLOAD", payload, settings }, (res) => {
        btnPdf.disabled = false;
        btnPdf.textContent = "Download PDF";
        if (!res || !res.ok) {
          window.print();
        }
      });
    });
  }

  renderReport(payload, settings);

  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.dataset.reportReady = "true";
      chrome.runtime.sendMessage({ type: "REPORT_RENDERED", key }).catch(() => {});
      if (mode === "preview" && autoprint) {
        setTimeout(() => window.print(), 250);
      }
    });
  });
}

init();
