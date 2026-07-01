import { get, request } from "node:https";

export async function fetchApifyDataset({ datasetId = process.env.APIFY_DATASET_ID, limit = 2000 } = {}) {
  assertApifyToken();
  if (!datasetId) {
    throw new Error("Missing APIFY_DATASET_ID. Run an Apify scraper, then set APIFY_DATASET_ID to its dataset id.");
  }

  const datasetIds = parseDatasetIds(datasetId);
  const batches = await Promise.allSettled(
    datasetIds.map((id) => fetchOneDataset({ datasetId: id, limit }))
  );
  const successfulBatches = batches
    .filter((batch) => batch.status === "fulfilled")
    .map((batch) => batch.value);
  const failedBatches = batches.filter((batch) => batch.status === "rejected");

  if (successfulBatches.length === 0) {
    throw failedBatches[0]?.reason ?? new Error("No Apify datasets returned reviews.");
  }

  return dedupeById(successfulBatches.flat())
    .filter((item) => item.text.length >= 20)
    .filter(isRelevantToSpotify)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

export async function runApifyActor({
  actorId = process.env.APIFY_ACTOR_ID,
  input = parseActorInput(process.env.APIFY_ACTOR_INPUT_JSON),
  limit = 2000,
  waitForFinish = 120
} = {}) {
  assertApifyToken();
  if (!actorId) {
    throw new Error("Missing APIFY_ACTOR_ID. Set it to the Apify actor you want to run.");
  }

  const runUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(
    actorId
  )}/runs?waitForFinish=${encodeURIComponent(waitForFinish)}`;
  const runPayload = await requestJson(runUrl, {
    method: "POST",
    body: JSON.stringify(input ?? {}),
    headers: {
      "content-type": "application/json"
    }
  });
  const datasetId = runPayload?.data?.defaultDatasetId;

  if (!datasetId) {
    throw new Error("Apify actor did not return a default dataset id.");
  }

  return fetchApifyDataset({ datasetId, limit });
}

async function fetchOneDataset({ datasetId, limit }) {
  const url = `https://api.apify.com/v2/datasets/${encodeURIComponent(
    datasetId
  )}/items?clean=true&format=json&limit=${encodeURIComponent(limit)}`;
  const payload = await requestJson(url);
  const rows = Array.isArray(payload) ? payload : [];

  return rows.map((row, index) => normalizeApifyReview(row, index, datasetId));
}

function normalizeApifyReview(row, index, datasetId) {
  const title = pickString(row, ["title", "reviewTitle", "name", "subject"]);
  const content = pickString(row, ["text", "review", "reviewText", "content", "body", "comment", "description"]);
  const text = stripWhitespace([title, content].filter(Boolean).join(". "));
  const rawId = pickString(row, ["id", "reviewId", "review_id", "url", "reviewUrl"]) || `apify-${Date.now()}-${index}`;
  const country = pickString(row, ["country", "countryCode", "market"]);
  const source = inferReviewSource(row);

  return {
    id: `apify-${source}-${rawId}`,
    source,
    text,
    rating: Number(row.rating ?? row.stars ?? row.score ?? row.reviewRating ?? 0) || null,
    url: pickString(row, ["url", "reviewUrl", "appUrl"]) || "",
    createdAt: normalizeDate(row.date ?? row.createdAt ?? row.created_at ?? row.updated ?? row.reviewDate),
    metadata: {
      provider: "apify",
      datasetId,
      country,
      author: pickString(row, ["author", "userName", "username", "user"]),
      version: pickString(row, ["version", "appVersion"]),
      raw: row
    }
  };
}

function inferReviewSource(row) {
  const values = [
    row.source,
    row.platform,
    row.store,
    row.type,
    row.socialNetwork,
    row.network,
    row.service,
    row.appStore,
    row.market,
    row.url,
    row.reviewUrl,
    row.postUrl,
    row.permalink,
    row.subreddit,
    row.communityName,
    row.appId,
    row.bundleId
  ]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).toLowerCase())
    .join(" ");

  if (
    values.includes("twitter") ||
    values.includes("x.com") ||
    values.includes("tweet") ||
    values.includes("tweets") ||
    values.includes("twitter.com") ||
    row.tweetId ||
    row.conversationId
  ) {
    return "social";
  }

  if (
    values.includes("reddit") ||
    values.includes("subreddit") ||
    values.includes("reddit.com") ||
    row.subreddit ||
    row.communityName
  ) {
    return "reddit";
  }

  if (
    values.includes("google") ||
    values.includes("play.google") ||
    values.includes("play store") ||
    values.includes("playstore") ||
    values.includes("android") ||
    values.includes("com.spotify.music")
  ) {
    return "play_store";
  }

  return "app_store";
}

function isRelevantToSpotify(item) {
  if (item.source === "app_store" || item.source === "play_store") return true;

  const raw = item.metadata?.raw ?? {};
  const haystack = [
    item.text,
    item.url,
    raw.url,
    raw.postUrl,
    raw.permalink,
    raw.subreddit,
    raw.communityName,
    raw.query,
    raw.searchQuery,
    raw.keyword,
    raw.hashtags,
    raw.appName
  ]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).toLowerCase())
    .join(" ");

  return SPOTIFY_RELEVANCE_TERMS.some((term) => haystack.includes(term));
}

const SPOTIFY_RELEVANCE_TERMS = [
  "spotify",
  "discover weekly",
  "release radar",
  "daylist",
  "smart shuffle",
  "spotify wrapped",
  "spotify dj",
  "blend playlist",
  "playlist radio",
  "song radio"
];

function parseDatasetIds(value) {
  return String(value)
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function requestJson(url, options = {}) {
  const parsedUrl = new URL(url);
  const method = options.method ?? "GET";
  const body = options.body ?? null;

  return new Promise((resolve, reject) => {
    const client = method === "GET" ? get : request;
    const apiRequest = client(
      {
        method,
        hostname: parsedUrl.hostname,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        headers: {
          authorization: `Bearer ${process.env.APIFY_TOKEN}`,
          "user-agent": "ai-review-discovery-engine/0.1 research prototype",
          ...(body ? { "content-length": Buffer.byteLength(body) } : {}),
          ...(options.headers ?? {})
        },
        timeout: 30000
      },
      (response) => {
        let responseBody = "";

        response.on("data", (chunk) => {
          responseBody += chunk;
        });

        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Apify returned ${response.statusCode}: ${responseBody.slice(0, 180)}`));
            return;
          }

          try {
            resolve(JSON.parse(responseBody));
          } catch (error) {
            reject(new Error(`Unable to parse Apify response: ${error.message}`));
          }
        });
      }
    );

    apiRequest.on("timeout", () => {
      apiRequest.destroy(new Error("Apify request timed out"));
    });
    apiRequest.setTimeout(30000, () => {
      apiRequest.destroy(new Error("Apify request timed out"));
    });

    apiRequest.on("error", reject);
    if (body) apiRequest.write(body);
    apiRequest.end();
  });
}

function assertApifyToken() {
  if (!process.env.APIFY_TOKEN) {
    throw new Error("Missing APIFY_TOKEN. Create an Apify API token and restart npm run ui with APIFY_TOKEN set.");
  }
}

function parseActorInput(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`APIFY_ACTOR_INPUT_JSON is not valid JSON: ${error.message}`);
  }
}

function pickString(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }

  return "";
}

function normalizeDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function stripWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}
