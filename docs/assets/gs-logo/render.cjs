// Renders logo.html into the Glitches & Stitches logo PNGs (needs Playwright, as the browser tests do).
// Usage: node docs/assets/gs-logo/render.cjs
const path = require("path"), { execSync } = require("child_process");
const { chromium } = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
const OUT = path.resolve(__dirname, "../../../img/projects/glitches-and-stitches");
(async () => {
  const b = await chromium.launch();
  for (const [kind, file, transparent] of [["mark", "icon.png", false], ["logo", "logo.png", true], ["og", "og.png", false]]) {
    const p = await b.newPage();
    await p.goto(`file://${path.join(__dirname, "logo.html")}#${kind}`);
    await p.waitForSelector(`body[data-ready="${kind}"]`);
    await p.locator("#out svg").screenshot({ path: path.join(OUT, file), omitBackground: transparent });
    await p.close();
  }
  await b.close();
  console.log("rendered icon.png, logo.png, og.png");
})();
