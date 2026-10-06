// Stand-in for the real Jaljeevika applications during end-to-end tests:
// answers every path with "STUB <path>" so tests can see where a launch landed.
import http from "node:http";

const port = Number(process.env.STUB_APPS_PORT ?? 3199);
http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><title>stub</title><h1>STUB ${req.url}</h1><p id="referrer">${req.headers.referer ?? "none"}</p>`);
  })
  .listen(port, "127.0.0.1", () => console.log(`[stub-apps] on 127.0.0.1:${port}`));
