import { createServer } from "node:http";
import { handleRequest } from "./src/http-handler.js";

export default function handler(request, response) {
  return handleRequest(request, response, { root: process.cwd() });
}

if (!process.env.VERCEL && process.argv[1] === new URL(import.meta.url).pathname) {
  const port = Number(process.env.PORT ?? 4173);

  const server = createServer((request, response) => {
    handler(request, response).catch((error) => {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    });
  });

  server.listen(port, () => {
    console.log(`Review Discovery Engine UI running at http://localhost:${port}`);
  });
}