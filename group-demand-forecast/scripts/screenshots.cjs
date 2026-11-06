/* Capture slide screenshots from the production build (out/) at 1600x900 in presentation mode, ES and EN.
   Also runs an end-to-end check that approvals on the order screen show up on Panorama.
   Usage: npm run build && npm run screenshots */
/* eslint-disable @typescript-eslint/no-require-imports */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..", "out");
const OUT = path.join(__dirname, "..", "screenshots");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".txt": "text/plain" };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split("?")[0]);
      let file = path.join(ROOT, url);
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        return res.end("not found");
      }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, () => resolve(server));
  });
}

const SHOTS = [
  { name: "panorama.png", path: "/", extra: "" },
  { name: "explorador.png", path: "/explorador/", extra: "&brand=QIY&store=QRO" },
  { name: "escenarios.png", path: "/escenarios/", extra: "&credit=2" },
  { name: "pedido-sugerido.png", path: "/pedido-sugerido/", extra: "&store=SAT&open=SAT:KX3" },
  { name: "como-funciona.png", path: "/como-funciona/", extra: "" },
];

(async () => {
  if (!fs.existsSync(ROOT)) throw new Error("Run npm run build first (out/ missing)");
  const server = await serve();
  const port = server.address().port;
  const browser = await chromium.launch();
  const errors = [];
  const only = process.argv[2];
  for (const lang of ["es", "en"]) {
    fs.mkdirSync(path.join(OUT, lang), { recursive: true });
    for (const s of SHOTS) {
      if (only && !s.name.startsWith(only)) continue;
      const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
      page.on("pageerror", (e) => errors.push(`${lang}${s.path}: ${e}`));
      page.on("console", (m) => m.type() === "error" && errors.push(`${lang}${s.path}: ${m.text().slice(0, 200)}`));
      await page.goto(`http://localhost:${port}${s.path}?lang=${lang}&present=1${s.extra}`, { waitUntil: "networkidle" });
      await page.waitForSelector("footer");
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(700);
      const file = path.join(OUT, lang, s.name);
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1600, height: 900 } });
      // overflow check: content must fit the fixed 1600x900 canvas
      const overflow = await page.evaluate(() => {
        const main = document.querySelector("main");
        return main ? main.scrollHeight - main.clientHeight : 0;
      });
      if (overflow > 2) errors.push(`${lang}${s.path}: main content overflows by ${overflow}px`);
      console.log("saved", path.relative(path.join(__dirname, ".."), file));
      await page.close();
    }
  }

  // End-to-end: approve on the order screen, then read the approved total on Panorama.
  if (!only) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.goto(`http://localhost:${port}/pedido-sugerido/?lang=es`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Aprobar todo lo visible" }).click();
    await page.waitForTimeout(300);
    const orderText = (await page.getByTestId("order-approved").innerText()).replace(/\s+/g, " ");
    await page.getByRole("link", { name: "Panorama" }).click();
    await page.waitForSelector("[data-testid=panorama-approved]");
    const panText = (await page.getByTestId("panorama-approved").innerText()).replace(/\s+/g, " ");
    const num = (s) => (s.match(/[\d,]+(?= unidades)/) || [""])[0];
    const ok = num(orderText) !== "" && num(orderText) === num(panText) && num(orderText) !== "0";
    console.log(`${ok ? "PASS" : "FAIL"}  e2e approvals: order screen "${orderText}" | Panorama "${panText}"`);
    if (!ok) errors.push("approved totals differ between screens");
    await page.close();
  }
  await browser.close();
  server.close();
  if (errors.length) {
    console.log("Problems:\n" + errors.join("\n"));
    process.exit(1);
  }
})();
