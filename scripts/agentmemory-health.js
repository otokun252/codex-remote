const http = require("http");

const url = new URL(process.env.AGENTMEMORY_URL || "http://127.0.0.1:3111/agentmemory/health");

const req = http.get(url, (res) => {
  let body = "";
  res.setEncoding("utf8");
  res.on("data", (chunk) => {
    body += chunk;
  });
  res.on("end", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log(body || `agentmemory is healthy at ${url}`);
      return;
    }
    console.error(`agentmemory health check failed: HTTP ${res.statusCode}`);
    if (body) console.error(body);
    process.exit(1);
  });
});

req.on("error", (error) => {
  console.error(`agentmemory is not reachable at ${url}: ${error.message}`);
  console.error("Start it with: npm run memory:start");
  process.exit(1);
});

req.setTimeout(5000, () => {
  req.destroy(new Error("timeout"));
});

