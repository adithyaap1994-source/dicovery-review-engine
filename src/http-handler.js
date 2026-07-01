import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fetchApifyDataset, runApifyActor } from "./apify-client.js";
import { fetchAppStoreFeedback } from "./app-store-client.js";
import { loadEnv } from "./load-env.js";
import { fetchRedditFeedback } from "./reddit-client.js";

loadEnv();

const contentTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".md": "text/markdown",
  ".png": "image/png"
};

export async function handleRequest(request, response, options = {}) {
  const port = Number(process.env.PORT ?? 4173);
  const root = options.root ?? process.cwd();
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);

  if (url.pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (url.pathname === "/api/reddit") {
    try {
      const query = url.searchParams.get("query")?.trim() || undefined;
      const subreddit = url.searchParams.get("subreddit")?.trim() || "spotify";
      const limit = Number(url.searchParams.get("limit") ?? 25);
      const items = await fetchRedditFeedback({ query, subreddit, limit });

      sendJson(response, 200, { items });
    } catch (error) {
      sendJson(response, 502, {
        error:
          error.message === "Reddit returned 403"
            ? "Reddit blocked public search. Add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET, then restart npm run ui."
            : error.message
      });
    }
    return;
  }

  if (url.pathname === "/api/app-store") {
    try {
      const appId = url.searchParams.get("appId")?.trim() || undefined;
      const country = url.searchParams.get("country")?.trim() || "us";
      const limit = Number(url.searchParams.get("limit") ?? 500);
      const items = await fetchAppStoreFeedback({ appId, country, limit });

      sendJson(response, 200, {
        items,
        meta: {
          requestedLimit: limit,
          returned: items.length,
          countries: [...new Set(items.map((item) => item.metadata?.country).filter(Boolean))]
        }
      });
    } catch (error) {
      sendJson(response, 502, { error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/apify-dataset") {
    try {
      const datasetId = url.searchParams.get("datasetId")?.trim() || undefined;
      const limit = Number(url.searchParams.get("limit") ?? 2000);
      const items = await fetchApifyDataset({ datasetId, limit });

      sendJson(response, 200, {
        items,
        meta: {
          requestedLimit: limit,
          returned: items.length,
          provider: "apify",
          datasets: process.env.APIFY_DATASET_ID
            ? process.env.APIFY_DATASET_ID.split(",").map((id) => id.trim()).filter(Boolean).length
            : 0,
          sourceCounts: countBy(items, (item) => item.source),
          datasetCounts: countBy(items, (item) => item.metadata?.datasetId || "unknown"),
          countries: [...new Set(items.map((item) => item.metadata?.country).filter(Boolean))]
        }
      });
    } catch (error) {
      sendJson(response, 502, { error: error.message });
    }
    return;
  }

  if (url.pathname === "/api/apify-run") {
    try {
      const actorId = url.searchParams.get("actorId")?.trim() || undefined;
      const limit = Number(url.searchParams.get("limit") ?? 2000);
      const items = await runApifyActor({ actorId, limit });

      sendJson(response, 200, {
        items,
        meta: {
          requestedLimit: limit,
          returned: items.length,
          provider: "apify"
        }
      });
    } catch (error) {
      sendJson(response, 502, { error: error.message });
    }
    return;
  }

  serveStaticFile({ url, response, root });
}

function serveStaticFile({ url, response, root }) {
  const requestedPath = url.pathname === "/" ? "/web/index.html" : url.pathname;
  const filePath = normalize(join(root, requestedPath));

  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream"
  });
  createReadStream(filePath).pipe(response);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload, null, 2));
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}
