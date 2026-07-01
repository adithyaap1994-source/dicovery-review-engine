export const themeRules = [
  {
    theme: "repetitive_recommendations",
    label: "Repetitive Recommendations",
    keywords: ["same", "again", "identical", "repeat", "recycled", "coming back"],
    painPoint: "Recommendations feel stale or recycled.",
    mvpRule: "Penalize recently repeated artists and require a minimum new-artist ratio.",
    color: "#2563eb"
  },
  {
    theme: "mood_context_gap",
    label: "Mood Context Gap",
    keywords: ["mood", "right now", "doing", "activity", "context", "work", "studying"],
    painPoint: "Recommendations do not understand the user's current listening context.",
    mvpRule: "Ask for mood, activity, and desired energy before generating a discovery session.",
    color: "#0f766e"
  },
  {
    theme: "discovery_effort",
    label: "Discovery Effort",
    keywords: ["effort", "hard", "search", "trying", "takes too much"],
    painPoint: "Discovery feels like work, so users return to familiar playlists.",
    mvpRule: "Offer one-tap discovery modes with explainable recommendations.",
    color: "#a16207"
  },
  {
    theme: "algorithm_bubble",
    label: "Algorithm Bubble",
    keywords: ["bubble", "traps", "too good", "manual", "get out"],
    painPoint: "The algorithm over-optimizes for past taste and narrows discovery.",
    mvpRule: "Add escape routes that intentionally branch into adjacent genres and unfamiliar artists.",
    color: "#be123c"
  },
  {
    theme: "novelty_control",
    label: "Novelty Control",
    keywords: ["fresh", "random", "adventurous", "familiar", "deep cuts", "vibe"],
    painPoint: "Users want to control how far recommendations move from familiar taste.",
    mvpRule: "Expose a novelty slider that tunes familiar, balanced, and adventurous discovery.",
    color: "#7c3aed"
  }
];

export function analyzeFeedback(feedbackItems) {
  const analyzedItems = feedbackItems.map(analyzeItem);

  return {
    analyzedItems,
    summary: summarize(analyzedItems),
    researchQuestions: answerResearchQuestions(analyzedItems)
  };
}

export function analyzeItem(item) {
  const text = item.text.toLowerCase();
  const matchedRule =
    themeRules
      .map((rule) => ({
        ...rule,
        score: rule.keywords.filter((keyword) => text.includes(keyword)).length
      }))
      .filter((rule) => rule.score > 0)
      .sort((a, b) => b.score - a.score)[0] ??
    {
      theme: "general_discovery_friction",
      label: "General Discovery Friction",
      painPoint: "User expresses friction with music discovery.",
      mvpRule: "Use conversational clarification to capture discovery intent.",
      color: "#64748b"
    };

  return {
    ...item,
    theme: matchedRule.theme,
    themeLabel: matchedRule.label,
    themeColor: matchedRule.color,
    painPoint: matchedRule.painPoint,
    userIntent: inferIntent(text),
    segment: inferSegment(text),
    mvpRule: matchedRule.mvpRule,
    sentiment: inferSentiment(text),
    evidenceQuote: item.text
  };
}

function inferIntent(text) {
  if (text.includes("mood") || text.includes("right now")) {
    return "Find music that matches current context.";
  }

  if (text.includes("new") || text.includes("discover")) {
    return "Discover fresh music without losing familiar taste.";
  }

  if (text.includes("comfort") || text.includes("playlist")) {
    return "Keep listening easy and emotionally safe.";
  }

  return "Improve recommendation quality.";
}

function inferSegment(text) {
  if (text.includes("comfort") || text.includes("same") || text.includes("repeat")) {
    return "Comfort Loopers with Discovery Intent";
  }

  if (text.includes("mood") || text.includes("right now")) {
    return "Mood Matchers";
  }

  return "Passive Discoverers";
}

function inferSentiment(text) {
  if (text.includes("amazing") && text.includes("used to")) {
    return "disappointed";
  }

  if (text.includes("too much") || text.includes("do not") || text.includes("keeps")) {
    return "frustrated";
  }

  return "mixed";
}

function summarize(analyzedItems) {
  const themeCounts = countBy(analyzedItems, "themeLabel");
  const segmentCounts = countBy(analyzedItems, "segment");
  const sourceCounts = countBy(analyzedItems, "source");

  return {
    totalItems: analyzedItems.length,
    themeCounts,
    segmentCounts,
    sourceCounts,
    topMvpRules: [...new Set(analyzedItems.map((item) => item.mvpRule))],
    topPainPoints: [...new Set(analyzedItems.map((item) => item.painPoint))]
  };
}

export function answerResearchQuestions(analyzedItems) {
  const total = analyzedItems.length;
  const byTheme = groupBy(analyzedItems, "themeLabel");
  const bySegment = groupBy(analyzedItems, "segment");
  const topThemes = rankGroups(byTheme);
  const topSegments = rankGroups(bySegment);

  return [
    {
      id: "discovery_struggle",
      question: "Why do users struggle to discover new music?",
      answer: buildDiscoveryStruggleAnswer(topThemes, total),
      evidence: pickEvidence(analyzedItems, ["Discovery Effort", "Repetitive Recommendations", "Algorithm Bubble"])
    },
    {
      id: "recommendation_frustrations",
      question: "What are the most common frustrations with recommendations?",
      answer: buildRecommendationFrustrationAnswer(topThemes, total),
      evidence: pickEvidence(analyzedItems, ["Repetitive Recommendations", "Mood Context Gap", "Novelty Control"])
    },
    {
      id: "listening_behaviors",
      question: "What listening behaviors are users trying to achieve?",
      answer: buildListeningBehaviorAnswer(topSegments, total),
      evidence: pickEvidence(analyzedItems, ["Mood Context Gap", "Novelty Control", "Discovery Effort"])
    },
    {
      id: "repeat_causes",
      question: "What causes users to repeatedly listen to the same content?",
      answer: buildRepeatCauseAnswer(topThemes, total),
      evidence: pickEvidence(analyzedItems, ["Discovery Effort", "Repetitive Recommendations", "Algorithm Bubble"])
    },
    {
      id: "segment_differences",
      question: "Which user segments experience different discovery challenges?",
      answer: buildSegmentDifferenceAnswer(bySegment, total),
      evidence: pickSegmentEvidence(bySegment)
    },
    {
      id: "unmet_needs",
      question: "What unmet needs emerge consistently across reviews?",
      answer: buildUnmetNeedsAnswer(topThemes, total),
      evidence: pickEvidence(analyzedItems, ["Novelty Control", "Mood Context Gap", "Algorithm Bubble"])
    }
  ];
}

export function answerCustomQuestion(question, analyzedItems) {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) {
    return {
      question: "",
      answer: "Ask a question about the current review set.",
      evidence: []
    };
  }

  const scoredEvidence = scoreItemsForQuestion(trimmedQuestion, analyzedItems);
  const evidenceItems = scoredEvidence.slice(0, 5).map(({ item }) => item);
  const topThemes = rankGroups(groupBy(evidenceItems, "themeLabel"));
  const topSegments = rankGroups(groupBy(evidenceItems, "segment"));

  if (evidenceItems.length === 0) {
    return {
      question: trimmedQuestion,
      answer: "I could not find enough matching evidence in the current review set. Try fetching more reviews or broadening the question.",
      evidence: []
    };
  }

  return {
    question: trimmedQuestion,
    answer: buildCustomAnswer(trimmedQuestion, evidenceItems, topThemes, topSegments, analyzedItems.length),
    evidence: evidenceItems.slice(0, 3).map(toEvidence)
  };
}

export function buildDiscoveryFramework(question, analyzedItems) {
  const trimmedQuestion = question.trim();
  const relevantItems = trimmedQuestion
    ? scoreItemsForQuestion(trimmedQuestion, analyzedItems).map(({ item }) => item)
    : analyzedItems;
  const frameworkItems = relevantItems.length ? relevantItems : analyzedItems;
  const total = frameworkItems.length;

  if (!total) {
    return {
      question: trimmedQuestion,
      total: 0,
      problemStatement: "",
      cards: []
    };
  }

  const topThemes = rankGroups(groupBy(frameworkItems, "themeLabel"));
  const topSegments = rankGroups(groupBy(frameworkItems, "segment"));
  const primaryTheme = topThemes[0]?.label ?? "discovery friction";
  const primarySegment = topSegments[0]?.label ?? "target listeners";
  const rootCause = mostFrequent(frameworkItems.map((item) => item.painPoint));

  return {
    question: trimmedQuestion,
    total,
    problemStatement: `For ${primarySegment.toLowerCase()}, music discovery breaks down because ${rootCause.toLowerCase()} This makes the next MVP opportunity about solving ${primaryTheme.toLowerCase()} with a clearer, lower-effort discovery experience.`,
    cards: topSegments.slice(0, 6).map((segment, index) => {
      const segmentItems = frameworkItems.filter((item) => item.segment === segment.label);
      const segmentThemes = rankGroups(groupBy(segmentItems, "themeLabel"));
      const dominantTheme = segmentThemes[0]?.label ?? "General Discovery Friction";
      const dominantPain = mostFrequent(segmentItems.map((item) => item.painPoint));
      const dominantIntent = mostFrequent(segmentItems.map((item) => item.userIntent));
      const mvpRule = mostFrequent(segmentItems.map((item) => item.mvpRule));
      const frustratedCount = segmentItems.filter((item) => item.sentiment === "frustrated" || item.sentiment === "disappointed").length;
      const severity = inferSeverity(segment.count, total, frustratedCount / segmentItems.length, index);

      return {
        segment: segment.label,
        theme: dominantTheme,
        count: segment.count,
        share: percent(segment.count, total),
        severity,
        problem: `${dominantIntent} However, ${dominantPain.toLowerCase()}`,
        rootCause: `Root cause: ${dominantTheme.toLowerCase()} is showing up repeatedly in this segment's evidence.`,
        mvpImplication: `MVP implication: ${mvpRule}`,
        quote: segmentItems[0]?.evidenceQuote ?? ""
      };
    })
  };
}

function inferSeverity(count, total, frustrationRate, index) {
  const share = total ? count / total : 0;
  if (frustrationRate >= 0.45 || share >= 0.28 || index === 0) return "high";
  if (frustrationRate >= 0.2 || share >= 0.12) return "moderate";
  return "low";
}

function mostFrequent(values) {
  const counts = values.filter(Boolean).reduce((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function buildDiscoveryStruggleAnswer(topThemes, total) {
  const themeText = formatRankedThemes(topThemes, total);
  return `Users struggle because discovery is not only a catalog problem; it is an effort, context, and control problem. The strongest signals are ${themeText}. This suggests users need discovery that is easier to start, less repetitive, and better aligned with what they want right now.`;
}

function buildRecommendationFrustrationAnswer(topThemes, total) {
  const dominant = topThemes[0];
  if (!dominant) return "Not enough evidence yet. Import or fetch more reviews to generate a reliable answer.";

  return `The most common frustration is ${dominant.label.toLowerCase()}, appearing in ${dominant.count} of ${total} analyzed items. Users also complain when recommendations are too familiar, too random, or disconnected from mood and activity.`;
}

function buildListeningBehaviorAnswer(topSegments, total) {
  const segmentText = topSegments.map((segment) => `${segment.label} (${percent(segment.count, total)})`).join(", ");
  return `Users are trying to preserve the ease and emotional safety of familiar listening while still finding something fresh. The current segment mix is ${segmentText || "not yet clear"}, which points to controlled novelty rather than pure exploration.`;
}

function buildRepeatCauseAnswer(topThemes, total) {
  const hasEffort = topThemes.some((theme) => theme.label === "Discovery Effort");
  const hasRepetition = topThemes.some((theme) => theme.label === "Repetitive Recommendations");
  const hasBubble = topThemes.some((theme) => theme.label === "Algorithm Bubble");

  const causes = [
    hasEffort ? "finding new music feels like work" : null,
    hasRepetition ? "existing surfaces recycle familiar tracks or artists" : null,
    hasBubble ? "the algorithm narrows around past taste" : null
  ].filter(Boolean);

  return causes.length
    ? `Repeat listening appears to be caused by ${joinNatural(causes)}. The behavior is partly user comfort and partly product friction.`
    : "Repeat listening cause is not yet clear from the current evidence set. Fetch more reviews or broaden sources.";
}

function buildSegmentDifferenceAnswer(bySegment, total) {
  const ranked = rankGroups(bySegment);
  if (ranked.length === 0) return "No segment signal available yet.";

  return ranked
    .map((segment) => {
      const items = bySegment[segment.label];
      const topTheme = rankGroups(groupBy(items, "themeLabel"))[0]?.label ?? "general discovery friction";
      return `${segment.label}: ${percent(segment.count, total)} of evidence, mainly associated with ${topTheme.toLowerCase()}.`;
    })
    .join(" ");
}

function buildUnmetNeedsAnswer(topThemes, total) {
  const needs = [];
  if (topThemes.some((theme) => theme.label === "Novelty Control")) needs.push("a novelty control that lets users choose familiar, balanced, or adventurous discovery");
  if (topThemes.some((theme) => theme.label === "Mood Context Gap")) needs.push("a way to express mood, activity, and current listening intent");
  if (topThemes.some((theme) => theme.label === "Repetitive Recommendations")) needs.push("freshness constraints that avoid recently repeated songs and artists");
  if (topThemes.some((theme) => theme.label === "Algorithm Bubble")) needs.push("escape routes from over-personalized taste bubbles");
  if (topThemes.some((theme) => theme.label === "Discovery Effort")) needs.push("low-effort discovery starts that do not require manual searching");

  return needs.length
    ? `The unmet needs are ${joinNatural(needs)}. These are recurring enough to justify an AI-native discovery assistant or coach.`
    : "No consistent unmet need has emerged yet. Increase data volume.";
}

function buildCustomAnswer(question, evidenceItems, topThemes, topSegments, total) {
  const questionType = inferQuestionType(question);
  const themeSummary = formatRankedThemes(topThemes, evidenceItems.length);
  const segmentSummary = topSegments
    .slice(0, 2)
    .map((segment) => `${segment.label.toLowerCase()} (${percent(segment.count, evidenceItems.length)})`)
    .join(" and ");
  const strongestPainPoints = [...new Set(evidenceItems.map((item) => item.painPoint))].slice(0, 3);

  if (questionType === "why") {
    return `Based on ${evidenceItems.length} matching items from ${total} analyzed reviews, the likely reason is ${joinNatural(
      strongestPainPoints.map((point) => point.toLowerCase())
    )}. The strongest related themes are ${themeSummary}.`;
  }

  if (questionType === "who") {
    return `The matching evidence is concentrated among ${segmentSummary || "multiple behavioral segments"}. Their main challenge is ${joinNatural(
      strongestPainPoints.map((point) => point.toLowerCase())
    )}.`;
  }

  if (questionType === "what") {
    return `The review evidence points to ${joinNatural(strongestPainPoints.map((point) => point.toLowerCase()))}. The strongest related themes are ${themeSummary}.`;
  }

  if (questionType === "how") {
    return `A product response should address ${joinNatural(strongestPainPoints.map((point) => point.toLowerCase()))}. The most relevant MVP rules are ${joinNatural(
      [...new Set(evidenceItems.map((item) => item.mvpRule.toLowerCase()))].slice(0, 3)
    )}.`;
  }

  return `I found ${evidenceItems.length} matching evidence items. The main signal is ${joinNatural(
    strongestPainPoints.map((point) => point.toLowerCase())
  )}, with strongest themes ${themeSummary}.`;
}

function scoreItemsForQuestion(question, items) {
  const questionTerms = tokenize(question);
  const expandedTerms = expandQuestionTerms(questionTerms);

  return items
    .map((item) => {
      const searchableText = [
        item.text,
        item.themeLabel,
        item.painPoint,
        item.userIntent,
        item.segment,
        item.mvpRule,
        item.sentiment
      ]
        .join(" ")
        .toLowerCase();
      const score = expandedTerms.reduce((sum, term) => sum + (searchableText.includes(term) ? 1 : 0), 0);
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);
}

function expandQuestionTerms(terms) {
  const synonyms = {
    repeat: ["repeat", "same", "recycled", "familiar"],
    repetitive: ["repeat", "same", "recycled", "familiar"],
    stale: ["stale", "same", "recycled"],
    mood: ["mood", "activity", "context", "work", "studying"],
    context: ["mood", "activity", "context"],
    effort: ["effort", "hard", "search", "manual"],
    discover: ["discover", "new", "fresh", "recommendation"],
    discovery: ["discover", "new", "fresh", "recommendation"],
    random: ["random", "adventurous", "fresh", "vibe"],
    control: ["control", "adventurous", "familiar", "deep cuts", "vibe"],
    segment: ["segment", "comfort", "passive", "mood"],
    users: ["segment", "comfort", "passive", "mood"],
    recommendations: ["recommendations", "radio", "discover weekly", "made for you"]
  };

  return [...new Set(terms.flatMap((term) => synonyms[term] ?? [term]))];
}

function inferQuestionType(question) {
  const normalized = question.trim().toLowerCase();
  if (normalized.startsWith("why")) return "why";
  if (normalized.startsWith("who") || normalized.includes("segment")) return "who";
  if (normalized.startsWith("how")) return "how";
  if (normalized.startsWith("what") || normalized.startsWith("which")) return "what";
  return "general";
}

function formatRankedThemes(topThemes, total) {
  return topThemes
    .slice(0, 3)
    .map((theme) => `${theme.label.toLowerCase()} (${percent(theme.count, total)})`)
    .join(", ");
}

function pickEvidence(items, preferredThemes) {
  const preferred = preferredThemes.flatMap((theme) => items.filter((item) => item.themeLabel === theme));
  return [...preferred, ...items].slice(0, 3).map(toEvidence);
}

function pickSegmentEvidence(bySegment) {
  return Object.values(bySegment)
    .flatMap((items) => items.slice(0, 1))
    .slice(0, 3)
    .map(toEvidence);
}

function toEvidence(item) {
  return {
    source: item.source,
    theme: item.themeLabel,
    segment: item.segment,
    quote: item.evidenceQuote,
    url: item.url
  };
}

function rankGroups(groups) {
  return Object.entries(groups)
    .map(([label, items]) => ({ label, count: items.length }))
    .sort((a, b) => b.count - a.count);
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key];
    acc[value] = acc[value] ?? [];
    acc[value].push(item);
    return acc;
  }, {});
}

function percent(count, total) {
  if (!total) return "0%";
  return `${Math.round((count / total) * 100)}%`;
}

function joinNatural(items) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function tokenize(value) {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "based",
    "do",
    "does",
    "for",
    "from",
    "how",
    "in",
    "is",
    "of",
    "on",
    "or",
    "the",
    "to",
    "users",
    "what",
    "which",
    "who",
    "why",
    "with"
  ]);

  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2 && !stopWords.has(term));
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] ?? 0) + 1;
    return acc;
  }, {});
}
