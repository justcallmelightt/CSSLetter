import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const root = process.cwd();
const output = join(root, "dist");
const sourceFiles = [
  ["/", "index.html", "text/html; charset=utf-8", "text"],
  ["/index.html", "index.html", "text/html; charset=utf-8", "text"],
  ["/style.css", "style.css", "text/css; charset=utf-8", "text"],
  ["/script.js", "script.js", "text/javascript; charset=utf-8", "text"],
  ["/assets/og-v4.png", "assets/og-v4.png", "image/png", "base64"],
  ["/assets/vendor/lucide-0.468.0.min.js", "assets/vendor/lucide-0.468.0.min.js", "text/javascript; charset=utf-8", "text"],
  ["/assets/vendor/PretendardVariable.woff2", "assets/vendor/PretendardVariable.woff2", "font/woff2", "base64"],
];

await rm(output, { recursive: true, force: true });
await mkdir(join(output, "server"), { recursive: true });
await mkdir(join(output, "static", "assets", "vendor"), { recursive: true });

const assets = {};
for (const [urlPath, filePath, contentType, encoding] of sourceFiles) {
  const buffer = await readFile(join(root, filePath));
  assets[urlPath] = {
    contentType,
    encoding,
    body: encoding === "base64" ? buffer.toString("base64") : buffer.toString("utf8"),
  };
}

const worker = `const assets = ${JSON.stringify(assets)};

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.endsWith("/") && url.pathname !== "/" ? url.pathname.slice(0, -1) : url.pathname;
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const asset = assets[path];
    if (!asset) return new Response("Not found", { status: 404 });
    const isVersionedAsset = path.startsWith("/assets/vendor/") || path === "/assets/og-v4.png";
    const headers = new Headers({
      "Content-Type": asset.contentType,
      "Cache-Control": isVersionedAsset ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Frame-Options": "DENY",
    });
    const rawBody = asset.encoding === "base64" ? decodeBase64(asset.body) : asset.body;
    const body = asset.contentType.startsWith("text/html")
      ? rawBody.replace("./assets/og-v4.png", new URL("/assets/og-v4.png", request.url).href)
      : rawBody;
    return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
  },
};
`;

await writeFile(join(output, "server", "index.js"), worker);
await cp(join(root, "index.html"), join(output, "static", "index.html"));
await cp(join(root, "style.css"), join(output, "static", "style.css"));
await cp(join(root, "script.js"), join(output, "static", "script.js"));
await cp(join(root, "assets", "og-v4.png"), join(output, "static", "assets", "og-v4.png"));
await cp(join(root, "assets", "vendor", "lucide-0.468.0.min.js"), join(output, "static", "assets", "vendor", "lucide-0.468.0.min.js"));
await cp(join(root, "assets", "vendor", "PretendardVariable.woff2"), join(output, "static", "assets", "vendor", "PretendardVariable.woff2"));

console.log("CSSLetter build ready.");
