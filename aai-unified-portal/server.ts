import { createServer } from "http";
import { parse } from "url";
import next from "next";
import httpProxy from "http-proxy";
import path from "path";

// Suppress DEP0060: util._extend deprecation from http-proxy library
process.removeAllListeners("warning");
process.on("warning", (warning: Error & { code?: string }) => {
  if (warning.name === "DeprecationWarning" && warning.code === "DEP0060") return;
  console.warn(warning);
});

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const dir = path.resolve(__dirname);

const app = next({ dev, hostname, port, dir });
const handle = app.getRequestHandler();

const DA_ENGINE_URL: string =
  process.env.NEXT_PUBLIC_DA_ENGINE_URL || "http://localhost:8001";
const WMS_BACKEND_URL: string =
  process.env.WMS_BACKEND_URL || "https://localhost:443";

// ── DA Engine proxy (plain HTTP/WS) ──────────────────────────────────────
const daProxy = httpProxy.createProxyServer({
  target: DA_ENGINE_URL,
  changeOrigin: true,
  ws: true,
});

daProxy.on("error", (err: Error) => {
  console.error("[DA Proxy] Error:", err.message);
});

// ── WMS Backend proxy (HTTPS/WSS with self-signed certs) ─────────────────
const wmsProxy = httpProxy.createProxyServer({
  target: WMS_BACKEND_URL,
  changeOrigin: true,
  ws: true,
  secure: false,
  timeout: 30000,
  proxyTimeout: 30000,
});

wmsProxy.on("error", (err: NodeJS.ErrnoException, req: any, res: any) => {
  const isEconnreset = err.code === "ECONNRESET" || err.message.includes("ECONNRESET");
  const isEconnrefused = err.code === "ECONNREFUSED" || err.message.includes("ECONNREFUSED");
  
  if (isEconnreset) {
    console.warn("[WMS Proxy] Connection reset by peer - backend may be restarting or overloaded");
  } else if (isEconnrefused) {
    console.error("[WMS Proxy] Connection refused - WMS backend is not running at", WMS_BACKEND_URL);
  } else {
    console.error("[WMS Proxy] Error:", err.message);
  }
  
  if (res && !res.headersSent) {
    const statusCode = isEconnrefused ? 503 : 502;
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ 
      error: "WMS Backend unavailable", 
      code: err.code,
      retry: true 
    }));
  }
});

wmsProxy.on("proxyReq", (proxyReq) => {
  proxyReq.setHeader("Connection", "keep-alive");
});

// ── Start ────────────────────────────────────────────────────────────────
app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url || "/", true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error handling request:", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  server.on("upgrade", (req, socket, head) => {
    const parsedUrl = parse(req.url || "/", true);
    const pathname = parsedUrl.pathname || "";

    // DA Engine WebSocket: /ws or /api/da/ws -> http://localhost:8001/ws
    if (pathname === "/ws" || pathname === "/api/da/ws") {
      console.log(`[WS Proxy] DA Engine: ${pathname} -> ${DA_ENGINE_URL}/ws`);
      daProxy.ws(req, socket, head, { target: DA_ENGINE_URL });
    }
    // WMS Backend WebSocket: /wms/ws -> https://localhost:443/ws
    else if (pathname === "/wms/ws") {
      console.log(`[WS Proxy] WMS Backend: ${pathname} -> ${WMS_BACKEND_URL}/ws`);
      req.url = "/ws";
      wmsProxy.ws(req, socket, head, { target: WMS_BACKEND_URL });
    }
    else {
      // Let Next.js handle its own WebSocket connections (HMR, etc.)
      app.getUpgradeHandler()(req, socket, head);
    }
  });

  server.listen(port, hostname, (err?: NodeJS.ErrnoException) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WS Proxy [DA Engine]:   ws://${hostname}:${port}/ws -> ${DA_ENGINE_URL}/ws`);
    console.log(`> WS Proxy [WMS Backend]: ws://${hostname}:${port}/wms/ws -> ${WMS_BACKEND_URL}/ws`);
  });
});
