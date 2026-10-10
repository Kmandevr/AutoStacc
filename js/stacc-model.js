// Your Stacc's model (docs/library.md): turns the library API's owned products and files plus the static hierarchy
// (data/projects.js, stacclets.js, pacs.js, content-types.js with its old-name aliases) into one list of assets, then builds the views from that
// list. Pure functions, no DOM or window-only APIs: every view holds the same asset objects, never copies. Sets GS.stacc
// in pages and in js/stacc-worker.js (Your Stacc's background thread); also loads in Node for the unit tests
// (test/unit/stacc-model.test.js).
(function (root) {
  "use strict";

  const byId = (list) => new Map((list || []).map((x) => [x.id, x]));
  const formatOf = (filename) => {
    const m = /\.([a-z0-9]+)$/i.exec(String(filename || ""));
    return m ? m[1].toLowerCase() : "";
  };

  // The chosen kind (an old name like "samples" counts as its new one through aliases), else the first content type listing
  // the file's extension, else "other".
  function kindOf(file, contentTypes, aliases = {}) {
    const chosen = file.kind && (contentTypes[file.kind] ? file.kind : aliases[file.kind]);
    if (chosen && contentTypes[chosen]) return chosen;
    const format = formatOf(file.filename);
    const hit = Object.keys(contentTypes).find((k) => (contentTypes[k].formats || []).includes(format));
    return hit || "other";
  }

  // One asset per owned file, carrying every relationship as an id: project, Stacclet, Pac, product.
  function assetsFrom(items, catalog) {
    const pacs = byId(catalog.pacs), stacclets = byId(catalog.stacclets);
    const types = catalog.contentTypes || {};
    const aliases = catalog.kindAliases || {};
    const out = [];
    for (const item of items || []) {
      for (const f of item.files || []) {
        const pac = f.pacId && (item.pacs || []).includes(f.pacId) ? pacs.get(f.pacId) : null;
        const stacclet = pac ? stacclets.get(pac.stacclet) : null;
        out.push({
          id: f.id,
          name: f.label || f.filename,
          filename: f.filename,
          format: formatOf(f.filename),
          kind: kindOf(f, types, aliases),
          sizeBytes: f.sizeBytes || 0,
          folder: f.folderPath || "",
          bundleable: Boolean(f.bundleable),
          productId: item.productId,
          productTitle: item.title,
          projectId: (stacclet && stacclet.project) || item.projectId || "",
          staccletId: stacclet ? stacclet.id : null,
          pacId: stacclet ? pac.id : null,
          sources: item.sources || []
        });
      }
    }
    return out;
  }

  // Empty filter fields match everything. q: words that must all appear in the file's name, file name or product title.
  const words = (q) => String(q || "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const matches = (a, f = {}) =>
    words(f.q).every((w) => `${a.name} ${a.filename} ${a.productTitle} ${a.folder}`.toLowerCase().includes(w)) &&
    (!f.project || a.projectId === f.project) && (!f.stacclet || a.staccletId === f.stacclet) &&
    (!f.pac || a.pacId === f.pac) && (!f.kind || a.kind === f.kind) && (!f.format || a.format === f.format);
  const filter = (assets, f) => assets.filter((a) => matches(a, f));

  // Groups assets by key in the given key order; keys not in the order come last, sorted.
  function groupBy(assets, keyOf, order) {
    const groups = new Map();
    for (const a of assets) {
      const k = keyOf(a);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(a);
    }
    const known = order.filter((k) => groups.has(k));
    const rest = [...groups.keys()].filter((k) => !order.includes(k)).sort();
    return [...known, ...rest].map((k) => [k, groups.get(k)]);
  }

  const kindGroups = (assets, catalog) => {
    const types = catalog.contentTypes || {};
    return groupBy(assets, (a) => a.kind, Object.keys(types)).map(([kind, list]) => ({ kind, label: (types[kind] || {}).label || kind, assets: list }));
  };

  // Content types across everything: MIDI (n), One-shots (n), ...
  const byKind = (assets, catalog, f) => kindGroups(filter(assets, f), catalog);

  // Project → Stacclet → Pac → content type → assets; files without a Pac sit under their product.
  function tree(assets, catalog, f) {
    const projects = byId(catalog.projects), stacclets = byId(catalog.stacclets), pacs = byId(catalog.pacs);
    const list = filter(assets, f);
    return groupBy(list, (a) => a.projectId, (catalog.projects || []).map((p) => p.id)).map(([projectId, inProject]) => ({
      id: projectId,
      name: (projects.get(projectId) || {}).name || "Other",
      count: inProject.length,
      stacclets: groupBy(inProject.filter((a) => a.staccletId), (a) => a.staccletId, (catalog.stacclets || []).map((s) => s.id)).map(([sid, inStacclet]) => ({
        id: sid,
        title: (stacclets.get(sid) || {}).title || sid,
        count: inStacclet.length,
        pacs: groupBy(inStacclet, (a) => a.pacId, (catalog.pacs || []).map((p) => p.id)).map(([pid, inPac]) => ({
          id: pid,
          title: (pacs.get(pid) || {}).title || pid,
          count: inPac.length,
          kinds: kindGroups(inPac, catalog),
          // A Pac published from Pack Builder keeps its creator's folders: shown instead of content types when present.
          folders: inPac.some((a) => a.folder) ? groupBy(inPac, (a) => a.folder, []).map(([path, inFolder]) => ({ path, label: path || "Top level", assets: inFolder })) : null
        }))
      })),
      products: groupBy(inProject.filter((a) => !a.staccletId), (a) => a.productId, []).map(([productId, inProduct]) => ({
        id: productId,
        title: inProduct[0].productTitle,
        count: inProduct.length,
        kinds: kindGroups(inProduct, catalog)
      }))
    }));
  }

  // Values present in the assets, for the filter menus: [[value, count]].
  function facets(assets) {
    const count = (key) => groupBy(assets, (a) => a[key], []).map(([k, l]) => [k, l.length]).filter(([k]) => k);
    return { projects: count("projectId"), kinds: count("kind"), formats: count("format") };
  }

  // One request from js/stacc-client.js, answered the same in the worker or on the page. "build" turns the owned items
  // into assets and keeps them (and the catalog) in memo; "view" builds one view, filtered, plus the filter menus and how many files match.
  function answer(memo, msg) {
    if (msg.type === "build") {
      memo.catalog = msg.catalog || {};
      memo.assets = assetsFrom(msg.items, memo.catalog);
      return { assets: memo.assets };
    }
    if (msg.type !== "view") throw new Error(`Unknown Stacc request: ${msg.type}`);
    const assets = memo.assets || [], catalog = memo.catalog || {};
    const groups = msg.view === "kinds" ? byKind(assets, catalog, msg.filter) : tree(assets, catalog, msg.filter);
    return { view: msg.view, groups, facets: facets(assets), count: filter(assets, msg.filter).length, total: assets.length };
  }

  const api = { assetsFrom, kindOf, formatOf, filter, byKind, tree, facets, answer };
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.GS = root.GS || {}).stacc = api;
})(typeof self !== "undefined" ? self : globalThis);
