import { analyzeFeedback, answerCustomQuestion, buildDiscoveryFramework } from "./engine.js";

const state = {
  search: "",
  source: "all",
  showEvidence: false,
  customQuestion: "",
  isFetching: false,
  isAnalyzing: false,
  feedbackItems: [],
  analysis: analyzeFeedback([])
};

const els = {
  fetchAllButton: document.querySelector("#fetchAllButton"),
  clearFiltersButton: document.querySelector("#clearFiltersButton"),
  copyCustomAnswerButton: document.querySelector("#copyCustomAnswerButton"),
  viewSourceQuotesButton: document.querySelector("#viewSourceQuotesButton"),
  askForm: document.querySelector("#askForm"),
  customQuestionInput: document.querySelector("#customQuestionInput"),
  promptChips: [...document.querySelectorAll(".prompt-chip")],
  sourceChips: [...document.querySelectorAll("[data-source-chip]")],
  searchInput: document.querySelector("#searchInput"),
  activeFilters: document.querySelector("#activeFilters"),
  apifyCount: document.querySelector("#apifyCount"),
  appleCount: document.querySelector("#appleCount"),
  playCount: document.querySelector("#playCount"),
  redditCount: document.querySelector("#redditCount"),
  twitterCount: document.querySelector("#twitterCount"),
  insightReviewCount: document.querySelector("#insightReviewCount"),
  themeTotalCount: document.querySelector("#themeTotalCount"),
  segmentTotalCount: document.querySelector("#segmentTotalCount"),
  insightPanel: document.querySelector("#insightPanel"),
  visibleCount: document.querySelector("#visibleCount"),
  evidenceSection: document.querySelector("#evidenceSection"),
  customAnswer: document.querySelector("#customAnswer"),
  overviewFeedbackList: document.querySelector("#overviewFeedbackList"),
  frameworkProblemStatement: document.querySelector("#frameworkProblemStatement"),
  frameworkCardList: document.querySelector("#frameworkCardList"),
  themeList: document.querySelector("#themeList"),
  segmentList: document.querySelector("#segmentList")
};

window.addEventListener("error", (event) => {
  renderStatus("UI error", event.message || "Something stopped the dashboard script.");
});

wireEvents();
renderSourceChips();
render();

function wireEvents() {
  els.fetchAllButton.addEventListener("click", fetchAllReviews);

  els.askForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.customQuestion = els.customQuestionInput.value.trim();
    renderStatus("Question answered", state.customQuestion || "Ask a question about the loaded reviews.");
    render();
  });

  els.promptChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      state.customQuestion = chip.textContent.trim();
      els.customQuestionInput.value = state.customQuestion;
      renderStatus("Question answered", state.customQuestion);
      render();
    });
  });

  els.copyCustomAnswerButton.addEventListener("click", async () => {
    const answer = getCustomAnswer();
    await copyText(`${answer.question}\n${answer.answer}`);
    renderStatus("Answer copied", answer.question);
  });

  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    state.showEvidence = false;
    render();
  });

  els.sourceChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      state.source = chip.dataset.sourceChip;
      state.showEvidence = false;
      render();
    });
  });

  els.clearFiltersButton.addEventListener("click", () => {
    state.search = "";
    state.source = "all";
    state.showEvidence = false;
    els.searchInput.value = "";
    renderStatus("Filters cleared", "Showing all loaded reviews.");
    render();
  });

  els.viewSourceQuotesButton.addEventListener("click", () => {
    state.showEvidence = true;
    render();
    els.evidenceSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });

}

async function fetchAllReviews() {
  state.isFetching = true;
  state.isAnalyzing = false;
  state.showEvidence = false;
  render();
  renderStatus("Fetching reviews", "Importing Apify dataset and Apple public feed together...");

  try {
    const results = await Promise.allSettled([
      fetchReviewEndpoint("/api/apify-dataset?limit=2000", "Apify"),
      fetchReviewEndpoint("/api/app-store?country=all&limit=2000", "Apple feed")
    ]);
    const successful = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
    const failed = results.filter((result) => result.status === "rejected").map((result) => result.reason.message);

    if (successful.length === 0) {
      throw new Error(failed.join(" | ") || "No review sources returned data.");
    }

    const fetchedItems = successful.flatMap((result) => result.items);
    const existingIds = new Set(state.feedbackItems.map((item) => item.id));
    const newItems = dedupeById(fetchedItems).filter((item) => !existingIds.has(item.id));
    state.isFetching = false;
    state.isAnalyzing = true;
    render();
    await waitForPaint();

    state.feedbackItems = [...newItems, ...state.feedbackItems];
    state.analysis = analyzeFeedback(state.feedbackItems);
    state.source = "all";
    state.showEvidence = false;
    state.isAnalyzing = false;
    renderStatus(
      "Reviews imported",
      `${newItems.length} new reviews loaded from ${successful.length} source${successful.length === 1 ? "" : "s"}${
        failed.length ? `. Some sources failed: ${failed.join(" | ")}` : "."
      }`
    );
    render();
  } catch (error) {
    state.isFetching = false;
    state.isAnalyzing = false;
    renderStatus("Fetch failed", error.message);
    render();
  }
}

async function fetchReviewEndpoint(endpoint, label) {
  const response = await fetch(endpoint);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`${label}: ${payload.error || "Unable to fetch reviews."}`);
  }

  return {
    label,
    items: payload.items ?? [],
    meta: payload.meta ?? {}
  };
}

function render() {
  const filteredAnalysis = getFilteredAnalysis();
  const { analyzedItems, summary } = filteredAnalysis;
  const hasReviews = state.feedbackItems.length > 0;
  const isBusy = state.isFetching || state.isAnalyzing;

  document.body.classList.toggle("has-no-reviews", !hasReviews);
  document.body.classList.toggle("is-fetching", state.isFetching);
  document.body.classList.toggle("is-calculating", state.isAnalyzing);
  els.fetchAllButton.disabled = isBusy;
  els.fetchAllButton.classList.toggle("needs-fetch", !hasReviews && !isBusy);
  els.fetchAllButton.textContent = state.isFetching
    ? "Fetching reviews..."
    : state.isAnalyzing
      ? "Calculating insights..."
      : hasReviews
        ? "Refresh Reviews"
        : "Fetch All Reviews";
  els.insightPanel.setAttribute("aria-busy", String(isBusy));
  renderPipelineCounts();
  els.visibleCount.textContent = `${analyzedItems.length} matching reviews`;
  els.evidenceSection.classList.toggle("is-hidden", !state.showEvidence);
  els.insightReviewCount.textContent = analyzedItems.length.toLocaleString();
  els.themeTotalCount.textContent = analyzedItems.length.toLocaleString();
  els.segmentTotalCount.textContent = analyzedItems.length.toLocaleString();

  renderActiveFilters();
  renderSourceChips();
  renderCustomAnswer(filteredAnalysis.customAnswer);
  renderDiscoveryFramework(filteredAnalysis.discoveryFramework);
  renderFeedback(analyzedItems.slice(0, 12));
  renderThemes(summary.themeCounts);
  renderSegments(summary.segmentCounts);
}

function renderPipelineCounts() {
  const items = state.analysis.analyzedItems;
  const apifyItems = items.filter((item) => item.metadata?.provider === "apify");
  const appleFeedItems = items.filter((item) => item.source === "app_store" && item.metadata?.provider !== "apify");
  const playStoreItems = items.filter((item) => item.source === "play_store");
  const redditItems = items.filter((item) => item.source === "reddit");
  const twitterItems = items.filter((item) => item.source === "social");

  els.apifyCount.textContent = apifyItems.length;
  els.appleCount.textContent = appleFeedItems.length;
  els.playCount.textContent = playStoreItems.length;
  els.redditCount.textContent = redditItems.length;
  els.twitterCount.textContent = twitterItems.length;
}

function renderCustomAnswer(answer) {
  els.customQuestionInput.value = state.customQuestion;
  if (!state.customQuestion) {
    els.customAnswer.innerHTML = "";
    return;
  }

  els.customAnswer.innerHTML = `
    <article class="answer-card">
      <div class="answer-header">
        <strong>${escapeHtml(answer.question || "Ask a question about the loaded reviews")}</strong>
        <span>${answer.evidence.length} evidence snippets</span>
      </div>
      <p>${escapeHtml(answer.answer)}</p>
      <div class="evidence-strip">
        ${answer.evidence
          .map(
            (evidence) => `
              <div class="evidence-chip">
                <span>${formatSource(evidence.source)} · ${escapeHtml(evidence.theme)}</span>
                <blockquote>${escapeHtml(shorten(evidence.quote, 220))}</blockquote>
              </div>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderFeedback(items) {
  els.overviewFeedbackList.innerHTML =
    items.length === 0
      ? `<div class="empty-state">No reviews match the current question or filters.</div>`
      : items
          .map(
            (item) => `
              <article class="feedback-card">
                <div class="feedback-meta">
                  <span class="tag">${formatSource(item.source)}</span>
                  <span class="tag">${escapeHtml(item.themeLabel)}</span>
                  ${item.rating ? `<span class="tag">${item.rating} stars</span>` : ""}
                </div>
                <blockquote>${escapeHtml(item.evidenceQuote)}</blockquote>
              </article>
            `
          )
          .join("");
}

function renderDiscoveryFramework(framework) {
  els.frameworkProblemStatement.textContent =
    framework.problemStatement || "Ask a question to turn review evidence into a problem statement for the MVP.";

  els.frameworkCardList.innerHTML =
    framework.cards.length === 0
      ? `<div class="empty-state">Fetch reviews, then ask a question to generate a discovery problem framework.</div>`
      : framework.cards
          .map(
            (card) => `
              <article class="segment-insight-row ${severityClass(card.severity)}">
                <span class="segment-icon" aria-hidden="true">${segmentIcon(card.segment, card.theme)}</span>
                <div>
                  <strong>${escapeHtml(card.segment)}</strong>
                  <p>${escapeHtml(card.problem)}</p>
                  <small>${escapeHtml(card.rootCause)}</small>
                  <small>${escapeHtml(card.mvpImplication)}</small>
                </div>
                <span class="sentiment-badge ${severityBadgeClass(card.severity)}">${formatSeverity(card.severity)} · ${card.count}</span>
              </article>
            `
          )
          .join("");
}

function renderThemes(themeCounts) {
  els.themeList.innerHTML = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([theme, count]) => `<div class="mini-row"><span>${escapeHtml(theme)}</span><strong>${count}</strong></div>`)
    .join("");
}

function renderSegments(segmentCounts) {
  els.segmentList.innerHTML = Object.entries(segmentCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([segment, count]) => `<div class="mini-row"><span>${escapeHtml(segment)}</span><strong>${count}</strong></div>`)
    .join("");
}

function renderActiveFilters() {
  els.activeFilters.innerHTML = `
    <div><span>Source</span><strong>${state.source === "all" ? "All" : formatSource(state.source)}</strong></div>
    <div><span>Search</span><strong>${state.search || "None"}</strong></div>
    <div><span>Social evidence</span><strong>Must mention Spotify</strong></div>
  `;
}

function getFilteredAnalysis() {
  const filteredItems = state.analysis.analyzedItems.filter((item) => {
    const matchesSource = state.source === "all" || item.source === state.source;
    const haystack = `${item.text} ${item.themeLabel} ${item.segment} ${item.userIntent} ${item.painPoint}`.toLowerCase();
    const matchesSearch = state.search.length === 0 || haystack.includes(state.search);
    return matchesSource && matchesSearch && hasVisibleSpotifyEvidence(item);
  });

  return {
    analyzedItems: filteredItems,
    summary: summarizeFiltered(filteredItems),
    customAnswer: answerCustomQuestion(state.customQuestion, filteredItems),
    discoveryFramework: buildDiscoveryFramework(state.customQuestion, filteredItems)
  };
}

function hasVisibleSpotifyEvidence(item) {
  const sourcesThatNeedVisibleKeyword = new Set(["reddit", "social", "community_forum"]);
  if (!sourcesThatNeedVisibleKeyword.has(item.source)) return true;
  return item.evidenceQuote.toLowerCase().includes("spotify");
}

function renderSourceChips() {
  els.sourceChips.forEach((chip) => {
    chip.classList.toggle("on", chip.dataset.sourceChip === state.source);
  });
}

function summarizeFiltered(items) {
  return {
    totalItems: items.length,
    themeCounts: countBy(items, "themeLabel"),
    segmentCounts: countBy(items, "segment"),
    sourceCounts: countBy(items, "source"),
    topMvpRules: [...new Set(items.map((item) => item.mvpRule))]
  };
}

function getCustomAnswer() {
  return answerCustomQuestion(state.customQuestion, getFilteredAnalysis().analyzedItems);
}

function renderStatus(status, detail) {
  console.info(`[${status}] ${detail}`);
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] ?? 0) + 1;
    return acc;
  }, {});
}

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function formatSource(source) {
  return source.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function severityClass(severity) {
  if (severity === "high") return "critical";
  if (severity === "moderate") return "moderate";
  return "healthy";
}

function severityBadgeClass(severity) {
  if (severity === "high") return "high";
  if (severity === "moderate") return "partial";
  return "low";
}

function formatSeverity(severity) {
  return severity.charAt(0).toUpperCase() + severity.slice(1);
}

function segmentIcon(segment, theme) {
  const text = `${segment} ${theme}`.toLowerCase();
  if (text.includes("mood") || text.includes("context")) return "☀";
  if (text.includes("comfort") || text.includes("repeat")) return "🎧";
  if (text.includes("control") || text.includes("novelty")) return "🎚";
  if (text.includes("bubble") || text.includes("genre")) return "🎯";
  if (text.includes("social")) return "👥";
  return "🔭";
}

function shorten(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

async function copyText(value) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
