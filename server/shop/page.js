// Whole HTML documents for a product's page, /shop/<product-id>, the same for every creator, first-party included:
// title "<title> · AutoStacc", the creator and project it comes from, canonical + Open Graph + Product JSON-LD (an Offer
// only while it is for sale) for a trusted creator's product, noindex otherwise, and a 404 page for an unknown id.
// The buy area is a static first draw: js/product-page.js redraws it with the visitor's own state (owned, cart).
import { esc } from "../sites/text.js";
import { SITE_NAME, clip, local, abs, orgRef, webPage, head, crumbNav } from "../content/page.js";

const FONTS = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600;700&display=swap";
const CSS = ["core", "platform", "layout", "skeleton", "forms", "product-page", "shop", "store"];
const JS = ["data/site.js", "data/projects.js", "data/product-types.js", "js/util.js", "js/skeleton.js", "js/layout.js", "js/account-nav.js", "js/site-notice.js",
  "data/vocabulary.js", "data/licenses.js", "js/product-card.js", "js/taste.js", "js/product-view.js", "js/product-page.js", "data/features.js", "js/product-contents.js",
  "js/product-reviews.js", "js/similar.js", "js/wishlist.js", "js/store.js", "js/motion.js", "js/prefetch.js"];
const money = (c, cur) => { try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur || "USD" }).format(c / 100); } catch { return (c / 100).toFixed(2); } };
const day = (d) => { try { return new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }); } catch { return d; } };
const kind = (t) => String(t || "").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

function documentFor(siteUrl, page, crumbs, title, main) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${head(siteUrl, page)}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${FONTS.replace(/&/g, "&amp;")}" rel="stylesheet">
  <link rel="icon" href="/img/favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="/img/apple-touch-icon.png">
  <meta name="theme-color" content="#111318">
  <meta name="color-scheme" content="light dark">
  <script src="/js/theme.js"></script>
${CSS.map((s) => `  <link rel="stylesheet" href="/css/${s}.css">`).join("\n")}
</head>
<body data-page="product" data-section="shop">
  <header id="site-header"></header>

  <main id="main" class="platform">
    <div class="page-hero detail-hero">
      <div class="wrap">
        ${crumbNav(crumbs)}
        <h1 class="glitch" data-text="${esc(title)}">${esc(title)}</h1>
      </div>
    </div>
${main}
  </main>

  <footer id="site-footer"></footer>

${JS.map((s) => `  <script src="/${s}"></script>`).join("\n")}
</body>
</html>
`;
}

// "What's inside": the lines the creator wrote in the Studio, as js/product-view.js shows them.
const includes = (p) => {
  const list = ((p.metadata && p.metadata.includes) || []).filter((x) => typeof x === "string" && x);
  return list.length ? `<h2>What's inside</h2><ul>${list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "";
};

// The product's static first draw: the same parts js/product-view.js draws, without anything personal.
function view(p, s) {
  const by = s ? ` · by <a href="${esc(s.projectPath)}">${esc(s.projectName)}</a> from <a href="${esc(s.creatorPath)}">${esc(s.creatorName)}</a>` : "";
  const art = local(p.artwork);
  const soon = p.comingSoon && p.comingSoon.on;
  const action = soon ? `<p class="msg coming-soon"><strong>Coming soon.</strong> On sale from ${esc(day(soon))}.</p>`
    : !p.available ? '<p class="msg">Not on sale right now.</p>'
    : p.free ? '<button class="btn" type="button" data-claim>Get it free</button>' : '<button class="btn" type="button" data-buy>Add to cart</button>';
  return `${art ? `<img class="product-art" src="${esc(art)}" alt="" width="480" height="480">` : ""}
          <div class="product-info">
            <p class="small-print">${esc(kind(p.type))}${by}${s && !s.trusted ? ' <span class="tag unverified">Unverified creator</span>' : ""}</p>
            <p class="product-price">${p.priceCents ? esc(money(p.priceCents, p.currency)) : "Free"}</p>
            ${p.description ? `<p class="product-desc">${esc(p.description)}</p>` : ""}
            ${includes(p)}
            ${p.tags.length ? `<p class="small-print">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(" ")}</p>` : ""}
            ${action}
            <p class="msg" role="status" hidden></p>
            <p class="small-print">By buying you accept the <a href="/terms">terms</a> and the <a href="/license">licence</a> for this kind of product. <a href="/refunds">Refunds</a>.</p>
          </div>`;
}

function productLd(siteUrl, p, s, url, forSale) {
  const art = local(p.artwork);
  return {
    "@type": "Product", "@id": url + "#product", name: p.title, description: p.description || p.title, sku: p.id, url,
    ...(art && { image: abs(siteUrl, art) }),
    ...(s && { brand: { "@type": "Brand", name: s.projectName } }),
    ...(forSale && { offers: { "@type": "Offer", url, price: (p.priceCents / 100).toFixed(2), priceCurrency: p.currency,
      availability: "https://schema.org/InStock", seller: orgRef(siteUrl) } })
  };
}

// p: the public product (server/catalog/products.js publicProduct); s: { creatorName, creatorPath, projectName,
// projectPath, trusted } or null; index: a trusted creator's product; forSale: it can be bought right now.
export function renderProduct(siteUrl, p, s, { index, forSale }) {
  const path = `/shop/${p.id}`;
  const url = abs(siteUrl, path);
  const crumbs = [["Home", "/"], ["Store", "/shop"], ...(s ? [[s.creatorName, s.creatorPath]] : []), [p.title, path]];
  const from = s ? ` by ${s.projectName} from ${s.creatorName}` : "";
  const description = clip(`${p.title}${from}: ${p.description || kind(p.type)} ${p.priceCents ? money(p.priceCents, p.currency) : "Free"}.`);
  const title = `${p.title} · ${SITE_NAME}`;
  const art = local(p.artwork);
  const page = {
    path, title, description, index, ogType: "product",
    ...(art && { image: { src: art, width: null, height: null, alt: "" } }),
    og: forSale ? { "product:price:amount": (p.priceCents / 100).toFixed(2), "product:price:currency": p.currency } : {},
    schema: index ? [webPage(siteUrl, { path, title, description }, url + "#product", crumbs), productLd(siteUrl, p, s, url, forSale)] : []
  };
  const main = `    <section>
      <div class="wrap">
        <div id="product-app" class="product-page" data-product="${esc(p.id)}">
          ${view(p, s)}
        </div>
      </div>
    </section>

    <section class="contents-section" data-product-contents="${esc(p.id)}" hidden></section>
    <section class="reviews-section" data-reviews="${esc(p.id)}" hidden></section>
    <section class="similar-section" data-similar="${esc(p.id)}" hidden></section>`;
  return documentFor(siteUrl, page, crumbs, p.title, main);
}

// An unknown, unpublished or removed product: a 404 that says so and offers nothing to buy.
export function renderMissing(siteUrl, path) {
  const crumbs = [["Home", "/"], ["Store", "/shop"], ["Not available", path]];
  const page = { path, title: `Product not available · ${SITE_NAME}`, description: "That product isn't available on AutoStacc.", index: false, ogType: "website", schema: [] };
  const main = `    <section>
      <div class="wrap">
        <div id="product-app" class="product-page">
          <p class="msg error">That product isn't available. <a href="/shop">Back to the store</a></p>
        </div>
      </div>
    </section>`;
  return documentFor(siteUrl, page, crumbs, "Not available", main);
}
