// The site-wide search results page (/search?q=; owner, 2026-10-27, #230; docs/search.md): what the header's search bar
// opens on Enter. The frame and an empty results area; js/search-page.js asks every source (js/search-sources.js) and
// shows a tab per group (All, Store, Creators & projects, Community, Help) with tags first. Results change with every
// query, so it stays out of search engines (noindex). Returns { file, page, html }.
const H = require("./head");
const { shell, suffix } = require("./pages");

function searchPage(SITE) {
  const title = `Search${suffix(SITE.name)}`;
  const description = "Search everything on AutoStacc: the store, creators and projects, the community, help and tags.";
  const page = { path: "/search", title, description, index: false, ogType: "website",
    schema: [H.webPage(SITE, { path: "/search", title, description }, "WebPage")] };
  const main = `    <section>
      <div class="wrap search-main" data-search-page>
        <h1 class="search-title">Search</h1>
        <p class="search-hint">Type in the search bar at the top. Start with # to find a tag.</p>
        <noscript><p>Search needs JavaScript. Browse the <a href="/shop">store</a>, <a href="/discover">Discover</a>, the <a href="/community">community</a> or <a href="/help">help</a> instead.</p></noscript>
      </div>
    </section>`;
  const html = shell(SITE, { page, section: "search", styles: ["search"], scripts: ["js/search-page.js"], main });
  return { file: "search.html", page, html };
}

module.exports = { searchPage };
