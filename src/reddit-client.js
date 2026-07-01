import { get } from "node:https";
import { request } from "node:https";

const DEFAULT_QUERIES = [
  "spotify recommendations repetitive",
  "spotify discover weekly same songs",
  "spotify recommendations stale",
  "spotify new music discovery"
];

export async function fetchRedditFeedback({ query, subreddit = "spotify", limit = 25 } = {}) {
  const queries = query ? [query] : DEFAULT_QUERIES;
  const batches = await Promise.all(
    queries.map((searchQuery) => fetchRedditSearch({ query: searchQuery, subreddit, limit }))
  );

  return dedupeById(batches.flat()).slice(0, limit);
}

function fetchRedditSearch({ query, subreddit, limit }) {
  const encodedQuery = encodeURIComponent(query);
  const encodedSubreddit = encodeURIComponent(subreddit);
  const hasCredentials = process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET;

  if (hasCredentials) {
    return fetchRedditOauthSearch({ query, subreddit, limit });
  }

  const url = `https://www.reddit.com/r/${encodedSubreddit}/search.json?q=${encodedQuery}&restrict_sr=1&sort=relevance&t=year&limit=${limit}`;

  return requestJson(url).then((payload) => {
    const posts = payload?.data?.children ?? [];
    return posts
      .map((post) => normalizePost(post.data))
      .filter((item) => item.text.length >= 40);
  });
}

async function fetchRedditOauthSearch({ query, subreddit, limit }) {
  const token = await fetchAccessToken();
  const encodedQuery = encodeURIComponent(query);
  const encodedSubreddit = encodeURIComponent(subreddit);
  const url = `https://oauth.reddit.com/r/${encodedSubreddit}/search?q=${encodedQuery}&restrict_sr=1&sort=relevance&t=year&limit=${limit}`;

  return requestJson(url, {
    authorization: `Bearer ${token}`,
    "user-agent": "ai-review-discovery-engine/0.1 by research-prototype"
  }).then((payload) => {
    const posts = payload?.data?.children ?? [];
    return posts
      .map((post) => normalizePost(post.data))
      .filter((item) => item.text.length >= 40);
  });
}

function fetchAccessToken() {
  const credentials = Buffer.from(
    `${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`
  ).toString("base64");

  return requestForm("https://www.reddit.com/api/v1/access_token", "grant_type=client_credentials", {
    authorization: `Basic ${credentials}`,
    "content-type": "application/x-www-form-urlencoded",
    "user-agent": "ai-review-discovery-engine/0.1 by research-prototype"
  }).then((payload) => {
    if (!payload.access_token) {
      throw new Error("Reddit OAuth did not return an access token.");
    }

    return payload.access_token;
  });
}

function normalizePost(post) {
  const title = stripWhitespace(post.title ?? "");
  const body = stripWhitespace(post.selftext ?? "");
  const text = body ? `${title}. ${body}` : title;

  return {
    id: `reddit-${post.id}`,
    source: "reddit",
    text,
    rating: null,
    url: post.permalink ? `https://www.reddit.com${post.permalink}` : "",
    createdAt: post.created_utc ? new Date(post.created_utc * 1000).toISOString().slice(0, 10) : "",
    metadata: {
      subreddit: post.subreddit,
      score: post.score,
      comments: post.num_comments,
      queryMatched: true
    }
  };
}

function requestJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      {
        headers: {
          "user-agent": "ai-review-discovery-engine/0.1 research prototype"
          ,
          ...headers
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
            reject(new Error(`Reddit returned ${response.statusCode}`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Unable to parse Reddit response: ${error.message}`));
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Reddit request timed out"));
    });

    request.on("error", reject);
  });
}

function requestForm(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const formRequest = request(
      {
        method: "POST",
        hostname: parsedUrl.hostname,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        headers: {
          "content-length": Buffer.byteLength(body),
          ...headers
        },
        timeout: 12000
      },
      (response) => {
        let responseBody = "";

        response.on("data", (chunk) => {
          responseBody += chunk;
        });

        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Reddit OAuth returned ${response.statusCode}`));
            return;
          }

          try {
            resolve(JSON.parse(responseBody));
          } catch (error) {
            reject(new Error(`Unable to parse Reddit OAuth response: ${error.message}`));
          }
        });
      }
    );

    formRequest.on("timeout", () => {
      formRequest.destroy(new Error("Reddit OAuth request timed out"));
    });

    formRequest.on("error", reject);
    formRequest.write(body);
    formRequest.end();
  });
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
