const DEFAULT_SETTINGS = {
  pageSize: "letter",
  includeSummary: true,
  includeSourceFooter: true,
  saveAs: false
};

const statusCard = document.getElementById("statusCard");
const statusTitle = document.getElementById("statusTitle");
const statusMeta = document.getElementById("statusMeta");
const optPageSize = document.getElementById("optPageSize");
const optIncludeSummary = document.getElementById("optIncludeSummary");
const optIncludeSourceFooter = document.getElementById("optIncludeSourceFooter");
const optSaveAs = document.getElementById("optSaveAs");
const btnDownloadPdf = document.getElementById("btnDownloadPdf");
const btnOpenPreview = document.getElementById("btnOpenPreview");
const feedback = document.getElementById("feedback");

let activeTabId = null;
let cachedReport = null;

function setFeedback(msg, isError = false) {
  feedback.textContent = msg;
  feedback.className = isError ? "feedback error" : "feedback";
}

function readUiSettings() {
  return {
    pageSize: optPageSize.value,
    includeSummary: optIncludeSummary.checked,
    includeSourceFooter: optIncludeSourceFooter.checked,
    saveAs: optSaveAs.checked
  };
}

async function saveUiSettings() {
  await chrome.storage.local.set(readUiSettings());
}

async function init() {
  const saved = { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get(DEFAULT_SETTINGS)) };
  optPageSize.value = saved.pageSize;
  optIncludeSummary.checked = Boolean(saved.includeSummary);
  optIncludeSourceFooter.checked = Boolean(saved.includeSourceFooter);
  optSaveAs.checked = Boolean(saved.saveAs);

  [optPageSize, optIncludeSummary, optIncludeSourceFooter, optSaveAs].forEach((el) =>
    el.addEventListener("change", saveUiSettings)
  );

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    statusCard.className = "status-card warn";
    statusTitle.textContent = "No active tab found";
    return;
  }
  activeTabId = tab.id;

  const url = tab.url || "";
  if (!url.startsWith("https://edit.paperpal.com/ai-detector/report/")) {
    statusCard.className = "status-card warn";
    statusTitle.textContent = "Not a Paperpal AI Detection report";
    statusMeta.textContent =
      "Open a report at edit.paperpal.com/ai-detector/report/... and click this icon again.";
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      files: ["extractor.js"]
    });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      func: () =>
        window.__paperpalVisibleReportExtractor
          ? window.__paperpalVisibleReportExtractor.extractReportData()
          : { ok: false, error: "Extractor failed to load." }
    });

    if (!result || !result.ok) {
      statusCard.className = "status-card warn";
      statusTitle.textContent = "Report not ready";
      statusMeta.textContent = (result && result.error) || "Wait for the report to finish loading.";
      return;
    }

    cachedReport = result;
    statusCard.className = "status-card ok";
    const score = result.summary.scoreValue ? `${result.summary.scoreValue}% AI Identified` : "Report detected";
    statusTitle.textContent = score;
    const coverage = result.summary.wordsScannedText || `${result.approxWordCount} words`;
    statusMeta.textContent = `${result.docTitle}\n${result.paragraphCount} paragraphs • ${coverage}`;
    btnDownloadPdf.disabled = false;
    btnOpenPreview.disabled = false;
  } catch (err) {
    statusCard.className = "status-card warn";
    statusTitle.textContent = "Could not inspect page";
    statusMeta.textContent = err.message || String(err);
  }
}

btnDownloadPdf.addEventListener("click", async () => {
  if (!cachedReport) return;
  btnDownloadPdf.disabled = true;
  btnOpenPreview.disabled = true;
  btnDownloadPdf.textContent = "Generating PDF...";
  setFeedback("Rendering multi-page PDF via Chrome...");

  const settings = readUiSettings();
  await saveUiSettings();

  chrome.runtime.sendMessage(
    { type: "EXPORT_PDF_PAYLOAD", payload: cachedReport, settings },
    (res) => {
      btnDownloadPdf.disabled = false;
      btnOpenPreview.disabled = false;
      btnDownloadPdf.textContent = "Download PDF";
      if (chrome.runtime.lastError) {
        setFeedback(chrome.runtime.lastError.message, true);
        return;
      }
      if (!res || !res.ok) {
        setFeedback((res && res.error) || "Export failed.", true);
        return;
      }
      if (res.mode === "direct-pdf") {
        setFeedback(`Saved: ${res.filename}`);
      } else {
        setFeedback(res.warning || "Opened Print Preview.");
      }
    }
  );
});

btnOpenPreview.addEventListener("click", async () => {
  if (!cachedReport) return;
  const settings = readUiSettings();
  await saveUiSettings();

  chrome.runtime.sendMessage(
    { type: "OPEN_PREVIEW_PAYLOAD", payload: cachedReport, settings },
    (res) => {
      if (chrome.runtime.lastError || !res || !res.ok) {
        setFeedback("Could not open Print Preview.", true);
      } else {
        window.close();
      }
    }
  );
});

init();
