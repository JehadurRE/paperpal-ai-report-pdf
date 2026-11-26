/**
 * Paperpal Visible Report DOM Extractor (v1.1.0)
 * Supports:
 *   1. AI Detection Report (/ai-detector/report/*)
 *   2. Plagiarism Free Overview Report (/p/free-report/*)
 *
 * Reads ONLY visibly rendered report elements already displayed in the browser.
 * Strictly excludes locked/blurred/gradient-masked elements and never modifies
 * Paperpal's live DOM or bypasses subscription limits.
 */
(() => {
  if (window.__paperpalVisibleReportExtractor && window.__paperpalVisibleReportExtractor.version === "1.1.0") {
    return;
  }

  const ALLOWED_TAGS = new Set([
    "P", "SPAN", "STRONG", "B", "EM", "I", "U", "A", "BR",
    "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "H6",
    "BLOCKQUOTE", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD",
    "SUB", "SUP", "DIV"
  ]);

  const ALLOWED_CLASSES = new Set([
    "ai-detection",
    "ai-origin-text",
    "mostly-ai-written-text",
    "human-ai-blend",
    "mostly-human-written-text",
    "human-origin-text",
    "ai-detection-unprocessed-text",
    "pp-section-heading"
  ]);

  const HIGHLIGHT_CATALOG = [
    {
      cls: "ai-origin-text",
      label: "AI-written",
      desc: "Strong AI writing patterns",
      swatchClass: "swatch-ai"
    },
    {
      cls: "mostly-ai-written-text",
      label: "Human–AI Blend (high AI impact)",
      desc: "Predominantly AI with some human patterns",
      swatchClass: "swatch-mostly-ai"
    },
    {
      cls: "human-ai-blend",
      label: "Human–AI Blend",
      desc: "A mix of human and AI writing patterns",
      swatchClass: "swatch-blend-mid"
    },
    {
      cls: "mostly-human-written-text",
      label: "Human–AI Blend (low AI impact)",
      desc: "Mostly human with subtle AI writing patterns",
      swatchClass: "swatch-mostly-human"
    },
    {
      cls: "human-origin-text",
      label: "Human-written",
      desc: "Natural human writing patterns",
      swatchClass: "swatch-human"
    },
    {
      cls: "ai-detection-unprocessed-text",
      label: "Unprocessed text (gray)",
      desc: "Beyond the free scan limit (not analyzed)",
      swatchClass: "swatch-unprocessed"
    }
  ];

  function getReportKind() {
    if (location.hostname !== "edit.paperpal.com") return null;
    if (location.pathname.startsWith("/ai-detector/report/")) return "ai-detection";
    if (location.pathname.startsWith("/p/free-report/")) return "plagiarism-overview";
    return null;
  }

  function isReportPage() {
    return Boolean(getReportKind());
  }

  function cleanText(str) {
    return (str || "").replace(/\s+/g, " ").trim();
  }

  function formatToday() {
    return new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  function sanitizeNode(node, doc) {
    if (node.nodeType === Node.TEXT_NODE) {
      return doc.createTextNode(node.nodeValue || "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const tag = node.tagName.toUpperCase();
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "IFRAME" || tag === "SVG" || tag === "BUTTON") {
      return null;
    }

    const targetTag = ALLOWED_TAGS.has(tag) ? tag.toLowerCase() : "span";
    const el = doc.createElement(targetTag);

    if (typeof node.className === "string" && node.className.trim()) {
      const kept = node.className
        .trim()
        .split(/\s+/)
        .filter((c) => ALLOWED_CLASSES.has(c));
      if (kept.length) {
        el.className = kept.join(" ");
      }
    }

    if (tag === "P" || /^H[1-6]$/.test(tag)) {
      const align = node.style && node.style.textAlign;
      if (align && ["left", "center", "right", "justify"].includes(align)) {
        el.style.textAlign = align;
      }
    }

    if (targetTag === "a") {
      const href = node.getAttribute("href") || "";
      if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
        el.setAttribute("href", href);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
    }

    const tooltip = node.getAttribute("data-tooltip-label");
    if (tooltip) {
      el.setAttribute("title", tooltip);
    }

    for (const child of Array.from(node.childNodes)) {
      const cleanChild = sanitizeNode(child, doc);
      if (cleanChild) el.appendChild(cleanChild);
    }

    return el;
  }

  function tagSectionHeadings(rootEl) {
    const paragraphs = Array.from(rootEl.querySelectorAll("p"));
    for (const p of paragraphs) {
      const txt = cleanText(p.textContent);
      if (!txt || txt.length > 110) continue;
      if (/^(TO|FROM|DATE|SUBJECT|MEMO|MEMORANDUM):/i.test(txt)) continue;
      if (/^[•\-*]\s/.test(txt)) continue;
      if (/[.?!]$/.test(txt)) continue;

      const strongs = Array.from(p.querySelectorAll("strong, b"));
      const boldText = cleanText(strongs.map((s) => s.textContent).join(" "));
      if (boldText && boldText.length >= txt.length * 0.9) {
        p.classList.add("pp-section-heading");
      }
    }
  }

  function extractDocumentTitle(proseEl, reportId) {
    const paragraphs = Array.from(proseEl.querySelectorAll("p, h1, h2, h3"))
      .map((el) => cleanText(el.textContent))
      .filter(Boolean);

    const subj = paragraphs.find((line) => /^SUBJECT:\s*/i.test(line));
    if (subj) {
      return subj.replace(/^SUBJECT:\s*/i, "").trim().slice(0, 120);
    }

    const firstTitle = paragraphs.find((line) => line.length >= 8 && !/^(TO|FROM|DATE):/i.test(line));
    if (firstTitle) {
      return firstTitle.slice(0, 120);
    }

    return `Paperpal AI Detection Report (${reportId || "document"})`;
  }

  function extractAiSummary() {
    const aiHeading = Array.from(document.querySelectorAll("*")).find(
      (el) => el.children.length === 0 && cleanText(el.textContent) === "AI Writing Identified"
    );

    let aiCard = aiHeading || null;
    while (aiCard && aiCard.parentElement) {
      const h = aiCard.getBoundingClientRect().height;
      const t = aiCard.innerText || "";
      if (h >= 120 && /%/.test(t) && (t.includes("Partial check") || t.includes("human") || t.includes("AI"))) {
        break;
      }
      aiCard = aiCard.parentElement;
    }

    let scoreValue = "";
    let scoreColor = "rgb(164, 122, 0)";
    let verdictText = "";
    let verdictBg = "rgba(255, 248, 155, 0.45)";
    let verdictBorder = "rgb(237, 221, 0)";
    let checkNote = "";

    if (aiCard) {
      const lines = (aiCard.innerText || "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      const pctMatch = (aiCard.innerText || "").match(/(\d{1,3})\s*%/);
      if (pctMatch) {
        scoreValue = pctMatch[1];
      }

      const scoreEl = Array.from(aiCard.querySelectorAll("*")).find((el) => {
        const t = cleanText(el.textContent);
        if (!/^\d{1,3}\s*%?$/.test(t)) return false;
        const fs = parseFloat(getComputedStyle(el).fontSize || "0");
        return fs >= 24;
      });
      if (scoreEl) {
        scoreColor = getComputedStyle(scoreEl).color || scoreColor;
      }

      const verdictEl = Array.from(aiCard.querySelectorAll("div, p, span")).find((el) => {
        const t = cleanText(el.textContent);
        return (
          t.length > 15 &&
          t.length < 120 &&
          /this text is|written|human|ai/i.test(t) &&
          !t.includes("AI Writing Identified") &&
          !t.includes("Partial check") &&
          !t.includes("words analyzed") &&
          el.children.length <= 2
        );
      });
      if (verdictEl) {
        verdictText = cleanText(verdictEl.textContent);
        const st = getComputedStyle(verdictEl);
        if (st.backgroundColor && st.backgroundColor !== "rgba(0, 0, 0, 0)") {
          verdictBg = st.backgroundColor;
        }
        if (st.borderColor && st.borderColor !== "rgba(0, 0, 0, 0)" && st.borderTopWidth !== "0px") {
          verdictBorder = st.borderColor;
        }
      }

      const noteLine = lines.find((l) => /words analyzed|partial check|full analysis|words checked/i.test(l));
      if (noteLine) {
        checkNote = noteLine;
      }
    }

    const wordsScannedEl = Array.from(document.querySelectorAll("*")).find(
      (el) => el.children.length === 0 && /\d+\s+of\s+\d+\s+words\s+scanned/i.test(el.textContent)
    );
    const wordsScannedText = wordsScannedEl ? cleanText(wordsScannedEl.textContent) : "";

    const healthMetrics = [];
    const healthBar = Array.from(document.querySelectorAll("div")).find(
      (d) =>
        d.innerText &&
        d.innerText.includes("Document Health Check") &&
        d.getBoundingClientRect().height < 180 &&
        d.getBoundingClientRect().width > 450
    );
    if (healthBar) {
      const txt = healthBar.innerText;
      const aiMatch = txt.match(/AI Detection:\s*([^\n]+)/i);
      const plagMatch = txt.match(/Plagiarism:\s*([^\n]+)/i);
      if (aiMatch && !/processing/i.test(aiMatch[1])) {
        healthMetrics.push(`AI Detection ${aiMatch[1].trim()}`);
      }
      if (plagMatch && !/processing/i.test(plagMatch[1])) {
        healthMetrics.push(`Plagiarism ${plagMatch[1].trim()}`);
      }
    }

    const disclaimerEl = Array.from(document.querySelectorAll("*")).find(
      (el) => el.children.length === 0 && /^Disclaimer:/i.test(el.textContent.trim())
    );
    const disclaimer = disclaimerEl
      ? cleanText(disclaimerEl.textContent)
      : "Disclaimer: Results are estimates of writing patterns, not proof of AI use.";

    return {
      scoreValue,
      scoreColor,
      verdictText,
      verdictBg,
      verdictBorder,
      checkNote,
      wordsScannedText,
      healthMetrics,
      disclaimer
    };
  }

  function extractAiDetectionReport() {
    const editorContainer = document.getElementById("ai-detection-editor-container");
    const prose = editorContainer
      ? editorContainer.querySelector(".ProseMirror") ||
        editorContainer.querySelector(".ai-detection-report") ||
        editorContainer
      : document.querySelector(".ai-detection-report .ProseMirror");

    if (!prose || !cleanText(prose.innerText)) {
      return {
        ok: false,
        error: "Could not find the rendered AI Detection report text yet. Wait for the page to finish loading and try again."
      };
    }

    const pathMatch = location.pathname.match(/\/ai-detector\/report\/([^/?#]+)/);
    const reportId = pathMatch ? pathMatch[1] : "";
    const params = new URLSearchParams(location.search);
    const requestId = params.get("requestId") || "";

    const sandboxDoc = document.implementation.createHTMLDocument("");
    const wrapper = sandboxDoc.createElement("div");
    for (const child of Array.from(prose.childNodes)) {
      const cleanChild = sanitizeNode(child, sandboxDoc);
      if (cleanChild) wrapper.appendChild(cleanChild);
    }
    tagSectionHeadings(wrapper);

    const presentClasses = new Set();
    for (const item of HIGHLIGHT_CATALOG) {
      if (wrapper.querySelector(`.${item.cls}`)) {
        presentClasses.add(item.cls);
      }
    }

    const legendItems = HIGHLIGHT_CATALOG.filter(
      (item) =>
        item.cls === "ai-origin-text" ||
        item.cls === "human-origin-text" ||
        presentClasses.has(item.cls)
    );

    const summary = extractAiSummary();
    const docTitle = extractDocumentTitle(prose, reportId);
    const paragraphCount = wrapper.querySelectorAll("p, h1, h2, h3, h4, li").length;
    const plainText = (prose.innerText || "").trim();
    const approxWordCount = plainText ? plainText.split(/\s+/).length : 0;

    return {
      ok: true,
      reportKind: "ai-detection",
      reportId,
      requestId,
      url: location.href,
      capturedAt: new Date().toISOString(),
      capturedDateFormatted: formatToday(),
      docTitle,
      paragraphCount,
      approxWordCount,
      summary,
      legendItems,
      proseHtml: wrapper.innerHTML
    };
  }

  function extractPlagiarismOverviewReport() {
    const fullCandidates = Array.from(document.querySelectorAll("div, section, main"))
      .filter(
        (el) =>
          el.innerText &&
          el.innerText.includes("Similarity range") &&
          el.innerText.includes("Sources for similarity") &&
          el.innerText.includes("Uploaded Documents")
      )
      .sort((a, b) => a.innerText.length - b.innerText.length);

    const fallbackCandidates = Array.from(document.querySelectorAll("div, section, main"))
      .filter(
        (el) =>
          el.innerText &&
          el.innerText.includes("Similarity range") &&
          el.innerText.includes("Sources for similarity")
      )
      .sort((a, b) => a.innerText.length - b.innerText.length);

    const card = fullCandidates[0] || fallbackCandidates[0];
    if (!card) {
      return {
        ok: false,
        error: "Could not find the rendered Plagiarism overview card yet. Wait for the page to finish loading and try again."
      };
    }

    const pathMatch = location.pathname.match(/\/p\/free-report\/([^/?#]+)/);
    const reportId = pathMatch ? pathMatch[1] : "";

    const modeEl = Array.from(card.querySelectorAll("*")).find(
      (el) => el.children.length === 0 && /^(Standard|Academic|Strict)$/i.test(el.textContent.trim())
    );
    const checkMode = modeEl ? modeEl.textContent.trim() : "Standard";

    const rangeEl = Array.from(card.querySelectorAll("*"))
      .filter((el) => /^\d{1,3}\s*%\s*[-–]\s*\d{1,3}\s*%$|^\d{1,3}\s*%$/.test((el.textContent || "").trim()))
      .sort((a, b) => a.children.length - b.children.length)[0];

    const rangeText = rangeEl ? cleanText(rangeEl.textContent) : "—";
    const rangeStyle = rangeEl ? getComputedStyle(rangeEl) : null;
    const rangeBg = rangeStyle && rangeStyle.backgroundColor !== "rgba(0, 0, 0, 0)"
      ? rangeStyle.backgroundColor
      : "rgb(255, 232, 232)";
    const rangeColor = rangeStyle ? rangeStyle.color : "rgb(204, 36, 75)";
    const rangeBorder = rangeStyle && rangeStyle.borderColor !== "rgba(0, 0, 0, 0)"
      ? rangeStyle.borderColor
      : "rgb(204, 36, 75)";

    const statusLineEl = Array.from(card.querySelectorAll("*")).find(
      (el) => el.children.length === 0 && /similarity detected|no similarity/i.test(el.textContent.trim())
    );
    const statusLine = statusLineEl ? cleanText(statusLineEl.textContent) : "Similarity overview";

    // Detect gradient lock overlay so we strictly exclude any faded/masked source rows beneath it
    const overlays = Array.from(card.querySelectorAll("div"))
      .filter((d) => {
        const bg = getComputedStyle(d).backgroundImage;
        return bg && bg.includes("gradient");
      })
      .map((d) => d.getBoundingClientRect());

    const maskTop = overlays.length ? Math.min(...overlays.map((r) => r.top)) : Infinity;

    const seenRanks = new Set();
    const visibleSources = [];
    const candidateRows = Array.from(card.querySelectorAll("div, li")).filter((el) => {
      const lines = (el.innerText || "")
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      return lines.length === 4 && /^\d+$/.test(lines[0]) && /^\d{1,3}%$/.test(lines[3]);
    });

    for (const el of candidateRows) {
      const lines = el.innerText
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const rank = lines[0];
      if (seenRanks.has(rank)) continue;

      const rect = el.getBoundingClientRect();
      const midY = (rect.top + rect.bottom) / 2;
      // Respect Paperpal's fade/lock overlay: omit rows obscured under the gradient mask
      if (midY >= maskTop) continue;

      seenRanks.add(rank);
      const numEl = Array.from(el.querySelectorAll("*")).find(
        (c) => c.textContent.trim() === rank && getComputedStyle(c).backgroundColor !== "rgba(0, 0, 0, 0)"
      );
      visibleSources.push({
        rank,
        domain: lines[1],
        sourceType: lines[2],
        percent: lines[3],
        badgeBg: numEl ? getComputedStyle(numEl).backgroundColor : "rgb(51, 93, 192)"
      });
    }

    const docFileEl = Array.from(card.querySelectorAll("*")).find(
      (el) => el.children.length === 0 && /\.(docx?|pdf|txt|rtf|odt)$/i.test(el.textContent.trim())
    );
    const docFilename = docFileEl ? cleanText(docFileEl.textContent) : `Plagiarism_Report_${reportId}`;
    const docTitle = docFilename.replace(/\.(docx?|pdf|txt|rtf|odt)$/i, "");

    const recEl = Array.from(card.querySelectorAll("*"))
      .filter((el) => {
        const t = cleanText(el.textContent);
        return /^We recommend/i.test(t) && t.length < 180;
      })
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    const recommendationText = recEl ? cleanText(recEl.textContent) : "";

    const addlEl = Array.from(card.querySelectorAll("*"))
      .filter((el) => {
        const t = cleanText(el.textContent);
        return /^\d+\s+Additional sources identified/i.test(t) && t.length < 80;
      })
      .sort((a, b) => a.textContent.length - b.textContent.length)[0];
    const additionalSourcesText = addlEl ? cleanText(addlEl.textContent) : "";

    return {
      ok: true,
      reportKind: "plagiarism-overview",
      reportId,
      url: location.href,
      capturedAt: new Date().toISOString(),
      capturedDateFormatted: formatToday(),
      docTitle,
      docFilename,
      plagiarism: {
        checkMode,
        rangeText,
        rangeBg,
        rangeColor,
        rangeBorder,
        statusLine,
        recommendationText,
        additionalSourcesText,
        visibleSources
      }
    };
  }

  function extractReportData() {
    const kind = getReportKind();
    if (kind === "ai-detection") return extractAiDetectionReport();
    if (kind === "plagiarism-overview") return extractPlagiarismOverviewReport();
    return {
      ok: false,
      error:
        "Open a Paperpal AI Detection report (/ai-detector/report/...) or Plagiarism Free Overview (/p/free-report/...) first."
    };
  }

  window.__paperpalVisibleReportExtractor = {
    version: "1.1.0",
    getReportKind,
    isReportPage,
    extractReportData
  };
})();
