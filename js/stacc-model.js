// Your Stacc's model (docs/library.md): turns the library API's owned products and files, its Stacclets and Pacs, and
// data/projects.js and content-types.js (with its old-name aliases) into one list of assets, then builds the views from that
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

  // One asset per owned file, carrying every relationship as an id: project, Stacclet, Pac, product. personal (signed-in
  // people, /api/collections): { tags: { key: [tag] }, collections: [{ id, items: [key] }] }, the person's own
  // organization, by item key (the file's asset, the same across a Pac's versions, or its file id).
  function assetsFrom(items, catalog, personal) {
    const tags = (personal && personal.tags) || {};
    const inCollections = new Map();
    for (const c of (personal && personal.collections) || []) for (const k of c.items) inCollections.set(k, [...(inCollections.get(k) || []), c.id]);
    const pacs = byId(catalog.pacs), stacclets = byId(catalog.stacclets);
    const types = catalog.contentTypes || {};
    const aliases = catalog.kindAliases || {};
    const out = [];
    for (const item of items || []) {
      for (const f of item.files || []) {
        const pac = f.pacId && (item.pacs || []).includes(f.pacId) ? pacs.get(f.pacId) : null;
        const stacclet = pac ? stacclets.get(pac.stacclet) : null;
        const key = f.assetId || f.id;
        out.push({
          id: f.id,
          key,
          tags: tags[key] || [],
          collections: inCollections.get(key) || [],
          name: f.label || f.filename,
          filename: f.filename,
          format: formatOf(f.filename),
          kind: kindOf(f, types, aliases),
          sizeBytes: f.sizeBytes || 0,
          folder: f.folderPath || "",
          bundleable: Boolean(f.bundleable),
          // Removed or replaced by an update of its pack: still the buyer's until availableUntil (docs/packs.md H8).
          availableUntil: f.retiredAt ? f.availableUntil || null : null,
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

  // Empty filter fields match everything. q: words that must all appear in the file's name, file name, product title,
  // folder or the person's own tags. collection, tag: the person's own (personal, above).
  const words = (q) => String(q || "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const matches = (a, f = {}) =>
    words(f.q).every((w) => `${a.name} ${a.filename} ${a.productTitle} ${a.folder} ${(a.tags || []).join(" ")}`.toLowerCase().includes(w)) &&
    (!f.collection || (a.collections || []).includes(f.collection)) && (!f.tag || (a.tags || []).includes(f.tag)) &&
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

  // What each owned product says about itself beside its files (GET /api/library): its read me (the text of the Pac's
  // top-level "Read me….txt", or null) and its public preview clips ({ pacId, title, url }, at most 3 per Pac; only
  // root-relative /media/ addresses are kept). { productId: { readme, previews } }.
  const CLIPS_PER_PAC = 3;
  const okClip = (c) => c && typeof c.url === "string" && /^\/media\/[^\s"'<>]+$/.test(c.url);
  function extrasFrom(items) {
    const out = {};
    for (const item of items || []) {
      const per = new Map();
      const previews = (Array.isArray(item.previews) ? item.previews : []).filter(okClip).filter((c) => {
        const n = per.get(c.pacId || "") || 0;
        per.set(c.pacId || "", n + 1);
        return n < CLIPS_PER_PAC;
      }).map((c) => ({ pacId: c.pacId || null, title: String(c.title || "Preview"), url: c.url }));
      out[item.productId] = { readme: typeof item.readme === "string" && item.readme.trim() ? item.readme : null, previews };
    }
    return out;
  }

  // A Pac's read me and clips: the clips are that Pac's own; the read me is its product's (a Pack Builder product has one Pac).
  function extrasOf(list, extras, pacId) {
    const products = [...new Set(list.map((a) => a.productId))].map((id) => (extras || {})[id]).filter(Boolean);
    const seen = new Set();
    const previews = products.flatMap((x) => x.previews).filter((c) => (pacId === undefined || c.pacId === pacId) && !seen.has(c.url) && seen.add(c.url));
    const readme = products.map((x) => x.readme).find(Boolean) || null;
    return { readme, previews: pacId === undefined ? previews : previews.slice(0, CLIPS_PER_PAC) };
  }

  // Project → Stacclet → Pac → content type (or the creator's folders) → assets; files without a Pac sit under their
  // product. extras: extrasFrom(items), for each Pac's and product's read me and previews.
  function tree(assets, catalog, f, extras) {
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
          folders: foldersOf(inPac),
          updated: inPac.some((a) => a.availableUntil),
          ...extrasOf(inPac, extras, pid)
        }))
      })),
      products: groupBy(inProject.filter((a) => !a.staccletId), (a) => a.productId, []).map(([productId, inProduct]) => ({
        id: productId,
        title: inProduct[0].productTitle,
        count: inProduct.length,
        kinds: kindGroups(inProduct, catalog),
        folders: foldersOf(inProduct),
        updated: inProduct.some((a) => a.availableUntil),
        ...extrasOf(inProduct, extras)
      }))
    }));
  }

  // Files published from the Pack Builder keep their creator's folders: shown instead of content types when present
  // (files whose Pac the store didn't name sit under their product, folders and all). A nested tree:
  // { name, path, assets (the files directly in it, in their order), folders (sorted by name), count (files in it and
  // below) }; the root has name and path "". null when no file has a folder.
  function foldersOf(list) {
    if (!list.some((a) => a.folder)) return null;
    const node = (name, path) => ({ name, path, assets: [], folders: [], count: 0, kids: new Map() });
    const root = node("", "");
    for (const a of list) {
      let at = root;
      root.count++;
      for (const part of String(a.folder || "").split("/").filter(Boolean)) {
        if (!at.kids.has(part)) {
          const kid = node(part, at.path ? `${at.path}/${part}` : part);
          at.kids.set(part, kid);
          at.folders.push(kid);
        }
        at = at.kids.get(part);
        at.count++;
      }
      at.assets.push(a);
    }
    const tidy = (n) => {
      delete n.kids;
      n.folders.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0)).forEach(tidy);
      return n;
    };
    return tidy(root);
  }

  // Values present in the assets, for the filter menus: [[value, count]].
  function facets(assets) {
    const count = (key) => groupBy(assets, (a) => a[key], []).map(([k, l]) => [k, l.length]).filter(([k]) => k);
    const tags = groupBy(assets.flatMap((a) => (a.tags || []).map((tag) => ({ tag }))), (x) => x.tag, []).map(([k, l]) => [k, l.length]);
    return { projects: count("projectId"), kinds: count("kind"), formats: count("format"), tags };
  }

  // One request from js/stacc-client.js, answered the same in the worker or on the page. "build" turns the owned items
  // into assets and keeps them (and the catalog) in memo; "view" builds one view, filtered, plus the filter menus and how many files match.
  function answer(memo, msg) {
    if (msg.type === "build") {
      memo.catalog = msg.catalog || {};
      memo.assets = assetsFrom(msg.items, memo.catalog, msg.personal || null);
      memo.extras = extrasFrom(msg.items);
      return { assets: memo.assets };
    }
    if (msg.type !== "view") throw new Error(`Unknown Stacc request: ${msg.type}`);
    const assets = memo.assets || [], catalog = memo.catalog || {};
    const groups = msg.view === "kinds" ? byKind(assets, catalog, msg.filter) : tree(assets, catalog, msg.filter, memo.extras);
    return { view: msg.view, groups, facets: facets(assets), count: filter(assets, msg.filter).length, total: assets.length };
  }

  const api = { assetsFrom, extrasFrom, kindOf, formatOf, filter, byKind, tree, foldersOf, facets, answer };
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.GS = root.GS || {}).stacc = api;
})(typeof self !== "undefined" ? self : globalThis);
