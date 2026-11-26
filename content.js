/**
 * Content script on https://edit.paperpal.com/*
 * Renders an unobtrusive floating "Export Report PDF" pill inside an isolated
 * Shadow DOM whenever the user is viewing an AI Detection report page.
 * Does NOT modify Paperpal's page DOM, buttons, or blurred elements.
 */
(() => {
  const HOST_ID = "pp-visible-pdf-exporter-host";
  let dismissedForUrl = null;

  function isReportRoute() {
    return (
      location.pathname.startsWith("/ai-detector/report/") ||
      location.pathname.startsWith("/p/free-report/")
    );
  }

  function removeWidget() {
    const existing = document.getElementById(HOST_ID);
    if (existing) existing.remove();
  }

  function mountWidget() {
    if (!isReportRoute() || dismissedForUrl === location.href) {
      removeWidget();
      return;
    }
    if (document.getElementById(HOST_ID)) return;

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.style.cssText =
      "position:fixed;bottom:20px;right:20px;z-index:2147483640;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;";

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        .wrap {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #051e57;
          color: #ffffff;
          padding: 6px 8px 6px 12px;
          border-radius: 999px;
          box-shadow: 0 8px 24px rgba(5, 30, 87, 0.28);
          border: 1px solid rgba(255, 255, 255, 0.14);
          font-size: 13px;
          line-height: 1;
        }
        button {
          border: none;
          background: transparent;
          color: inherit;
          cursor: pointer;
          font: inherit;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 8px;
          border-radius: 999px;
          transition: background 0.15s ease, opacity 0.15s ease;
        }
        .btn-main {
          background: #1c4dc0;
          font-weight: 600;
          padding: 7px 12px;
        }
        .btn-main:hover:not(:disabled) {
          background: #255ce0;
        }
        .btn-main:disabled {
          opacity: 0.7;
          cursor: wait;
        }
        .btn-icon {
          padding: 6px 8px;
          color: #cbd5e1;
          font-size: 12px;
        }
        .btn-icon:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #ffffff;
        }
        .toast {
          position: absolute;
          bottom: 48px;
          right: 0;
          background: #0f172a;
          color: #f8fafc;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px;
          line-height: 1.35;
          max-width: 280px;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
          display: none;
        }
        .toast.show { display: block; }
        .toast.err { background: #991b1b; }
      </style>
      <div class="toast" id="toast"></div>
      <div class="wrap" role="region" aria-label="Paperpal Visible Report PDF Exporter">
        <button class="btn-main" id="btnPdf" title="Download visible AI Detection report as PDF">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span id="btnPdfLabel">Export PDF</span>
        </button>
        <button class="btn-icon" id="btnPreview" title="Open formatted Print Preview">Preview</button>
        <button class="btn-icon" id="btnClose" title="Hide button on this page">&times;</button>
      </div>
    `;

    const btnPdf = shadow.getElementById("btnPdf");
    const btnPdfLabel = shadow.getElementById("btnPdfLabel");
    const btnPreview = shadow.getElementById("btnPreview");
    const btnClose = shadow.getElementById("btnClose");
    const toast = shadow.getElementById("toast");

    let toastTimer = null;
    function showToast(msg, isError = false) {
      toast.textContent = msg;
      toast.className = `toast show${isError ? " err" : ""}`;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.className = "toast";
      }, 4200);
    }

    btnPdf.addEventListener("click", () => {
      const extractor = window.__paperpalVisibleReportExtractor;
      if (!extractor) {
        showToast("Extractor not loaded. Refresh the page and retry.", true);
        return;
      }
      const data = extractor.extractReportData();
      if (!data.ok) {
        showToast(data.error, true);
        return;
      }
      btnPdf.disabled = true;
      btnPdfLabel.textContent = "Generating...";
      chrome.runtime.sendMessage({ type: "EXPORT_PDF_PAYLOAD", payload: data }, (res) => {
        btnPdf.disabled = false;
        btnPdfLabel.textContent = "Export PDF";
        if (chrome.runtime.lastError) {
          showToast(chrome.runtime.lastError.message, true);
          return;
        }
        if (!res || !res.ok) {
          showToast((res && res.error) || "PDF export failed.", true);
          return;
        }
        if (res.mode === "direct-pdf") {
          showToast(`Downloaded ${res.filename}`);
        } else {
          showToast("Opened Print Preview — save as PDF from the dialog.");
        }
      });
    });

    btnPreview.addEventListener("click", () => {
      const extractor = window.__paperpalVisibleReportExtractor;
      const data = extractor && extractor.extractReportData();
      if (!data || !data.ok) {
        showToast((data && data.error) || "Could not read report content.", true);
        return;
      }
      chrome.runtime.sendMessage({ type: "OPEN_PREVIEW_PAYLOAD", payload: data }, (res) => {
        if (chrome.runtime.lastError || !res || !res.ok) {
          showToast("Could not open Print Preview.", true);
        }
      });
    });

    btnClose.addEventListener("click", () => {
      dismissedForUrl = location.href;
      removeWidget();
    });

    document.documentElement.appendChild(host);
  }

  // Handle both initial load and Next.js SPA route transitions
  let lastUrl = location.href;
  mountWidget();

  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      mountWidget();
    } else if (isReportRoute() && dismissedForUrl !== location.href && !document.getElementById(HOST_ID)) {
      mountWidget();
    }
  }, 1000);
})();
