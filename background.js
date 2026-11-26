/**
 * MV3 Service Worker: generates vector PDF directly via an isolated background
 * about:blank tab + Chrome DevTools Protocol (Page.setDocumentContent +
 * Page.printToPDF), then immediately detaches and downloads the PDF file.
 * Falls back smoothly to Print Preview (report.html) if debugger is unavailable.
 */

importScripts("report-builder.js");

const DEFAULT_SETTINGS = {
  pageSize: "letter",
  includeSummary: true,
  includeSourceFooter: true,
  saveAs: false
};

async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

function slugifyFilename(payload) {
  const prefix =
    payload && payload.reportKind === "plagiarism-overview"
      ? "Paperpal_Plagiarism_Overview"
      : "Paperpal_AI_Report";
  const base = (payload.docTitle || payload.reportId || "Report")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
  const dateStr = new Date().toISOString().slice(0, 10);
  return `${prefix}_${base || "Report"}_${dateStr}.pdf`;
}

function waitForTabComplete(tabId, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    const onUpdated = (id, info) => {
      if (id === tabId && info.status === "complete") finish();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((t) => {
      if (t && t.status === "complete") finish();
    }).catch(() => finish());
    const timer = setTimeout(finish, timeoutMs);
  });
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function generatePdfFromPayload(payload, overrideSettings = {}) {
  const settings = { ...(await getSettings()), ...overrideSettings };
  const html = self.__paperpalBuildStandaloneHtml(payload, settings);

  let tempTab = null;
  let debuggerAttached = false;

  try {
    // Open an isolated background about:blank tab (always permitted for chrome.debugger)
    tempTab = await chrome.tabs.create({ url: "about:blank", active: false });
    await waitForTabComplete(tempTab.id, 3000);

    const target = { tabId: tempTab.id };
    await withTimeout(chrome.debugger.attach(target, "1.3"), 5000, "Debugger attach");
    debuggerAttached = true;

    await withTimeout(chrome.debugger.sendCommand(target, "Page.enable"), 5000, "Page.enable");
    const { frameTree } = await withTimeout(
      chrome.debugger.sendCommand(target, "Page.getFrameTree"),
      5000,
      "Page.getFrameTree"
    );
    const frameId = frameTree && frameTree.frame && frameTree.frame.id;
    if (!frameId) {
      throw new Error("Could not resolve frame ID for PDF rendering.");
    }

    await withTimeout(
      chrome.debugger.sendCommand(target, "Page.setDocumentContent", {
        frameId,
        html
      }),
      8000,
      "Page.setDocumentContent"
    );

    // Force synchronous layout reflow (never use requestAnimationFrame in background tabs!)
    await withTimeout(
      chrome.debugger.sendCommand(target, "Runtime.evaluate", {
        expression: "document.body ? document.body.offsetHeight : 0",
        returnByValue: true
      }),
      3000,
      "Layout reflow"
    ).catch(() => {});

    const pdfResult = await withTimeout(
      chrome.debugger.sendCommand(target, "Page.printToPDF", {
        landscape: false,
        displayHeaderFooter: false,
        printBackground: true,
        preferCSSPageSize: true,
        scale: 1
      }),
      15000,
      "Page.printToPDF"
    );

    if (!pdfResult || !pdfResult.data) {
      throw new Error("Chrome returned empty PDF data.");
    }

    const filename = slugifyFilename(payload);
    const dataUrl = `data:application/pdf;base64,${pdfResult.data}`;

    nextExpectedFilename = filename;
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename,
      saveAs: Boolean(settings.saveAs),
      conflictAction: "uniquify"
    });
    setTimeout(() => {
      if (nextExpectedFilename === filename) nextExpectedFilename = null;
    }, 10000);

    return { ok: true, mode: "direct-pdf", filename, downloadId };
  } catch (err) {
    // Graceful fallback: open interactive Print Preview tab with auto-print
    try {
      if (debuggerAttached && tempTab) {
        await chrome.debugger.detach({ tabId: tempTab.id }).catch(() => {});
        debuggerAttached = false;
      }
      const key = `pp_report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await chrome.storage.session.set({ [key]: { payload, settings } });
      const previewUrl = chrome.runtime.getURL(
        `report.html?mode=preview&autoprint=1&key=${encodeURIComponent(key)}`
      );
      if (tempTab) {
        await chrome.tabs.update(tempTab.id, { url: previewUrl, active: true });
        tempTab = null; // Keep open for user
      } else {
        await chrome.tabs.create({ url: previewUrl, active: true });
      }
      return {
        ok: true,
        mode: "print-preview-fallback",
        warning: `Direct PDF unavailable (${err.message}); opened Print Preview instead.`
      };
    } catch (_) {
      // fall through
    }
    throw err;
  } finally {
    if (debuggerAttached && tempTab) {
      await chrome.debugger.detach({ tabId: tempTab.id }).catch(() => {});
    }
    if (tempTab) {
      await chrome.tabs.remove(tempTab.id).catch(() => {});
    }
  }
}

async function openPreviewFromPayload(payload, overrideSettings = {}) {
  const settings = { ...(await getSettings()), ...overrideSettings };
  const key = `pp_report_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await chrome.storage.session.set({
    [key]: { payload, settings }
  });

  const previewUrl = chrome.runtime.getURL(`report.html?mode=preview&key=${encodeURIComponent(key)}`);
  const tab = await chrome.tabs.create({ url: previewUrl, active: true });
  return { ok: true, tabId: tab.id, key };
}

let nextExpectedFilename = null;

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (item.byExtensionId === chrome.runtime.id && nextExpectedFilename) {
    const chosen = nextExpectedFilename;
    nextExpectedFilename = null;
    suggest({ filename: chosen, conflictAction: "uniquify" });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === "EXPORT_PDF_PAYLOAD") {
    generatePdfFromPayload(message.payload, message.settings)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }

  if (message.type === "OPEN_PREVIEW_PAYLOAD") {
    openPreviewFromPayload(message.payload, message.settings)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }
});
