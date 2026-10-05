import http from "node:http";
import { createRuntime } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const runtime = createRuntime(config);
const server = http.createServer(runtime.handler);

server.listen(config.port, () => {
  console.log(JSON.stringify({
    event: "server.started",
    url: config.origin,
    adapters: {
      qloo: runtime.adapters.qloo.mode,
      catalog: runtime.adapters.catalog.mode,
      paypal: runtime.adapters.paypal.mode
    }
  }));
});

function shutdown(signal) {
  console.log(JSON.stringify({ event: "server.stopping", signal }));
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
