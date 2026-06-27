#!/usr/bin/env python3
# NodeWorm connector wrapper server.
# Bundled static file. Never edited by the capture tool or the LLM.
# Usage: python3 nodeworm-connector-server.py --client <path/to/api_client.py> --port <port>
#
# Loads the generated api_client.py, introspects every public function, and
# exposes each as POST /<fn_name> accepting a JSON body mapped to kwargs.
# GET /health returns 200 so NodeWorm's verify probe works.
# GET /ready returns 200 once the client has loaded successfully.

import argparse
import importlib.util
import inspect
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

client_module = None
fn_map: dict = {}

def load_client(path: str) -> None:
    global client_module, fn_map
    spec = importlib.util.spec_from_file_location("api_client", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load client from {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[attr-defined]
    client_module = mod
    fn_map = {
        name: fn
        for name, fn in inspect.getmembers(mod, inspect.isfunction)
        if not name.startswith("_")
    }

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_): pass

    def _send(self, status: int, body: object) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        if self.path in ("/health", "/ready"):
            self._send(200, {"ok": True, "tools": list(fn_map.keys())})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):
        name = self.path.lstrip("/")
        fn = fn_map.get(name)
        if fn is None:
            self._send(404, {"error": f"no tool '{name}'"})
            return
        length = int(self.headers.get("Content-Length", 0))
        kwargs = {}
        if length:
            try:
                kwargs = json.loads(self.rfile.read(length))
            except json.JSONDecodeError:
                self._send(400, {"error": "invalid JSON body"})
                return
        try:
            result = fn(**kwargs)
            self._send(200, {"ok": True, "result": result})
        except Exception as exc:
            self._send(500, {"error": str(exc)})

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--client", required=True, help="Path to generated api_client.py")
    parser.add_argument("--port", type=int, default=9080)
    args = parser.parse_args()

    try:
        load_client(args.client)
    except Exception as exc:
        print(f"[nodeworm-connector-server] Failed to load client: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"[nodeworm-connector-server] Loaded {len(fn_map)} tools: {', '.join(fn_map)}", flush=True)
    print(f"[nodeworm-connector-server] Listening on http://localhost:{args.port}", flush=True)
    HTTPServer(("127.0.0.1", args.port), Handler).serve_forever()

if __name__ == "__main__":
    main()
