import { createServer, IncomingMessage, Server, ServerResponse } from "http";
import net from "net";

export interface CallbackResponse {
  data?: any;
}

export interface CallbackServerConfig {
  timeout?: number;
}

const ALLOWED_ORIGIN = "https://21st.dev";
// Any single POST to /data resolves the callback, so cap the body to stop a
// malicious localhost caller from holding the connection open with an
// unbounded stream.
const MAX_BODY_BYTES = 1024 * 1024;

export class CallbackServer {
  private server: Server | null = null;
  private port: number;
  private timeoutId?: NodeJS.Timeout;
  private promiseResolve?: (value: CallbackResponse) => void;
  private promiseReject?: (reason: any) => void;

  constructor(port = 9221) {
    this.port = port;
  }

  getPort(): number {
    return this.port;
  }

  private async findAvailablePort(startPort: number, maxAttempts = 10): Promise<number> {
    for (let i = 0; i < maxAttempts; i++) {
      const port = startPort + i;
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }
    throw new Error(`No available port found in range ${startPort}-${startPort + maxAttempts - 1}`);
  }

  private parseBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = "";
      let size = 0;
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(new Error("Callback body too large"));
          req.destroy();
          return;
        }
        body += chunk.toString();
      });
      req.on("end", () => {
        resolve(body);
      });
      req.on("error", reject);
    });
  }

  private handleRequest = async (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;

    // Origin is browser-controlled and cannot be spoofed by a webpage, so
    // this blocks callbacks forged by other tabs/sites even though the
    // server only binds to 127.0.0.1. Non-browser localhost callers won't
    // send an Origin header at all, so we only reject a *mismatched* one.
    if (origin && origin !== ALLOWED_ORIGIN) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Forbidden");
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/data") {
      let body: string;
      try {
        body = await this.parseBody(req);
      } catch (error) {
        res.writeHead(413, { "Content-Type": "text/plain" });
        res.end("Payload too large");
        return;
      }

      if (this.promiseResolve) {
        if (this.timeoutId) clearTimeout(this.timeoutId);
        
        this.promiseResolve({ data: body });
        this.shutdown();

        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("success");
      } else {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Server not ready");
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  };

  private async shutdown(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const tester = net
        .createServer()
        .once("error", () => resolve(false))
        .once("listening", () => {
          tester.close();
          resolve(true);
        })
        .listen(port, "127.0.0.1");
    });
  }

  async waitForCallback(config: CallbackServerConfig = {}): Promise<CallbackResponse> {
    const { timeout = 600000 } = config;

    try {
      this.port = await this.findAvailablePort(this.port);

      this.server = createServer(this.handleRequest);
      this.server.listen(this.port, "127.0.0.1");

      return new Promise<CallbackResponse>((resolve, reject) => {
        this.promiseResolve = resolve;
        this.promiseReject = reject;

        if (!this.server) {
          reject(new Error("Failed to start server"));
          return;
        }

        this.server.on("error", (error) => {
          if (this.promiseReject) this.promiseReject(error);
        });

        this.timeoutId = setTimeout(() => {
          resolve({ data: { timedOut: true } });
          this.shutdown();
        }, timeout);

        console.log(`Callback server listening on http://127.0.0.1:${this.port}/data`);
      });
    } catch (error) {
      await this.shutdown();
      throw error;
    }
  }
}
