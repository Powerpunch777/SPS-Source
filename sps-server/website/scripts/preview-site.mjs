import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const siteDirectory = resolve(scriptDirectory, "..");
const port = Number.parseInt(process.env.SPS_SITE_PORT ?? "4173", 10);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  if (requestUrl.pathname === "/_shutdown") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    response.end("SPS website preview stopped.");
    server.close();
    return;
  }

  let decodedPathname;
  try {
    decodedPathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }

  const relativePath = decodedPathname.replace(/^\/+/, "") || "index.html";
  const targetPath = resolve(siteDirectory, relativePath);
  if (targetPath !== siteDirectory && !targetPath.startsWith(`${siteDirectory}${sep}`)) {
    response.writeHead(403).end();
    return;
  }

  try {
    await access(targetPath);
    const targetStat = await stat(targetPath);
    if (!targetStat.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": mimeTypes[extname(targetPath)] ?? "application/octet-stream",
    });
    createReadStream(targetPath).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`SPS website preview: http://127.0.0.1:${port}`);
});
