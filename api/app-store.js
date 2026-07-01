import { handleRequest } from "../src/http-handler.js";

export default function handler(request, response) {
  return handleRequest(request, response);
}
