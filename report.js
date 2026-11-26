function renderReport(payload, settings) {
  const root = document.getElementById("reportRoot");
  root.innerHTML = "";

  // Use shared standalone HTML builder so Preview matches PDF output 1:1 for both AI & Plagiarism reports
  const fullHtml = window.__paperpalBuildStandaloneHtml(payload, settings);
  const parsed = new DOMParser().parseFromString(fullHtml, "text/html");
  document.title = parsed.title || "Paperpal Report";

  const builtStyle = parsed.querySelector("style");
  if (builtStyle) {
    document.getElementById("dynamicPageStyle").textContent = builtStyle.textContent;
  }

  for (const child of Array.from(parsed.body.childNodes)) {
    root.appendChild(document.importNode(child, true));
  }
}

function downloadStandaloneHtml(payload, settings) {
  const html = window.__paperpalBuildStandaloneHtml(payload, settings);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const prefix =
    payload && payload.reportKind === "plagiarism-overview"
      ? "Paperpal_Plagiarism_Overview"
      : "Paperpal_AI_Report";
  const slug = (payload.docTitle || "Report")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50);
  a.href = url;
  a.download = `${prefix}_${slug}.html`;
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
    if (payload.reportKind === "plagiarism-overview") {
      const p = payload.plagiarism || {};
      document.getElementById("tbMeta").textContent = `${
        p.rangeText || "Plagiarism Overview"
      } • ${(p.visibleSources || []).length} visible sources`;
    } else {
      document.getElementById("tbMeta").textContent = `${
        payload.summary.scoreValue ? payload.summary.scoreValue + "% AI" : "Report"
      } • ${payload.paragraphCount} paragraphs`;
    }

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
