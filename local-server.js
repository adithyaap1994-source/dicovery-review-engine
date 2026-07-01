import { createServer } from "node:http";
import { handleRequest } from "./src/http-handler.js";

const port = Number(process.env.PORT ?? 4173);

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: error.message }));
  });
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.log(`Review Discovery Engine UI may already be running at http://localhost:${port}`);
    return;
  }

  throw error;
});

server.listen(port, () => {
  console.log(`Review Discovery Engine UI running at http://localhost:${port}`);
});
