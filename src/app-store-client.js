import { get } from "node:https";

const SPOTIFY_IOS_APP_ID = "324684580";
const REVIEWS_PER_PAGE = 50;
const MAX_PAGES = 40;
const DEFAULT_COUNTRIES = [
  "us",
  "gb",
  "ca",
  "au",
  "in",
  "de",
  "fr",
  "br",
  "mx",
  "jp",
  "kr",
  "es",
  "it",
  "nl",
  "se",
  "no",
  "dk",
  "fi",
  "ie",
  "nz",
  "sg",
  "ph",
  "my",
  "za"
];

export async function fetchAppStoreFeedback({ appId = SPOTIFY_IOS_APP_ID, country = "us", limit = 50 } = {}) {
  const targetLimit = Math.min(Math.max(Number(limit) || REVIEWS_PER_PAGE, 1), REVIEWS_PER_PAGE * MAX_PAGES);
  const countries = parseCountries(country);
  const batches = [];

  for (const countryCode of countries) {
    const remaining = targetLimit - dedupeById(batches).length;
    if (remaining <= 0) break;

    const countryItems = await fetchCountryReviews({
      appId,
      country: countryCode,
      limit: Math.min(remaining, REVIEWS_PER_PAGE * MAX_PAGES)
    });
    batches.push(...countryItems);
  }

  return dedupeById(batches)
    .filter((item) => item.text.length >= 20)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, targetLimit);
}

async function fetchCountryReviews({ appId, country, limit }) {
  const pageCount = Math.ceil(limit / REVIEWS_PER_PAGE);
  const items = [];

  for (let page = 1; page <= pageCount; page += 1) {
    const entries = await fetchReviewPageOrEmpty({ appId, country, page });
    if (entries.length === 0) break;
    items.push(...entries.map((entry, index) => normalizeReview(entry, index, country, appId, page)));
    if (entries.length < REVIEWS_PER_PAGE) break;
  }

  return items.slice(0, limit);
}

function parseCountries(country) {
  if (Array.isArray(country)) return country;
  if (country === "all") return DEFAULT_COUNTRIES;
  return String(country)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

async function fetchReviewPageOrEmpty({ appId, country, page }) {
  try {
    return await fetchReviewPage({ appId, country, page });
  } catch (error) {
    if (error.message === "App Store returned 400") {
      return [];
    }

    throw error;
  }
}

async function fetchReviewPage({ appId, country, page }) {
  const url = `https://itunes.apple.com/${encodeURIComponent(country)}/rss/customerreviews/page=${page}/id=${encodeURIComponent(
    appId
  )}/sortBy=mostRecent/json`;
  const payload = await requestJson(url);
  const entries = Array.isArray(payload?.feed?.entry) ? payload.feed.entry : [];

  return entries.filter((entry) => entry?.["im:rating"]);
}

function normalizeReview(entry, index, country, appId, page) {
  const title = entry?.title?.label ?? "";
  const content = entry?.content?.label ?? "";
  const text = [title, content].filter(Boolean).join(". ");
  const reviewId = entry?.id?.label ?? `${appId}-${country}-${page}-${index}`;

  return {
    id: `app-store-${reviewId}`,
    source: "app_store",
    text: stripWhitespace(text),
    rating: Number(entry?.["im:rating"]?.label ?? 0) || null,
    url: entry?.link?.attributes?.href ?? "",
    createdAt: entry?.updated?.label ? entry.updated.label.slice(0, 10) : "",
    metadata: {
      appId,
      country,
      page,
      author: entry?.author?.name?.label ?? "",
      version: entry?.["im:version"]?.label ?? ""
    }
  };
}

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      {
        headers: {
          "user-agent": "ai-review-discovery-engine/0.1 research prototype"
        },
        timeout: 12000
      },
      (response) => {
        let body = "";

        response.on("data", (chunk) => {
          body += chunk;
        });

        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`App Store returned ${response.statusCode}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Unable to parse App Store response: ${error.message}`));
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("App Store request timed out"));
    });

    request.on("error", reject);
  });
}

function stripWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}
