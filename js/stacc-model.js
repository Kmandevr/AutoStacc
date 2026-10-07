// Your Stacc's model (docs/library.md): turns the library API's owned products and files plus the static hierarchy
// (data/projects.js, stacclets.js, pacs.js, content-types.js) into one list of assets, then builds the views from that
// list. Pure functions, no DOM: every view holds the same asset objects, never copies. Sets GS.stacc for
// js/library.js; also loads in Node for the unit tests (test/unit/stacc-model.test.js). Needs js/util.js in pages.
(function (root) {
  "use strict";

  const byId = (list) => new Map((list || []).map((x) => [x.id, x]));
  const formatOf = (filename) => {
    const m = /\.([a-z0-9]+)$/i.exec(String(filename || ""));
    return m ? m[1].toLowerCase() : "";
  };

  // The admin's chosen kind, else the first content type listing the file's extension, else "other".
  function kindOf(file, contentTypes) {
    if (file.kind && contentTypes[file.kind]) return file.kind;
    const format = formatOf(file.filename);
    const hit = Object.keys(contentTypes).find((k) => (contentTypes[k].formats || []).includes(format));
    return hit || "other";
  }

  // One asset per owned file, carrying every relationship as an id: project, Stacclet, Pac, product.
  function assetsFrom(items, catalog) {
    const pacs = byId(catalog.pacs), stacclets = byId(catalog.stacclets);
    const types = catalog.contentTypes || {};
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
          kind: kindOf(f, types),
          sizeBytes: f.sizeBytes || 0,
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

  // Empty filter fields match everything.
  const matches = (a, f = {}) =>
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

  // Content types across everything: MIDI (n), Samples (n), ...
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
          kinds: kindGroups(inPac, catalog)
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

  const api = { assetsFrom, kindOf, formatOf, filter, byKind, tree, facets };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GS.stacc = api;
})(typeof window !== "undefined" ? window : globalThis);
