// Minimal method + path router. Patterns use :name segments; each module exports its own route table.

export function createRouter(tables) {
  const routes = tables.flat().map(([method, pattern, handler, opts = {}]) => {
    const names = [];
    const re = new RegExp("^" + pattern.replace(/:([a-zA-Z]+)/g, (_, n) => (names.push(n), "([^/]+)")) + "/?$");
    return { method, re, names, handler, opts };
  });
  return {
    match(method, path) {
      let pathMatched = false;
      for (const r of routes) {
        const m = path.match(r.re);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== method && !(method === "HEAD" && r.method === "GET")) continue;
        const params = {};
        r.names.forEach((n, i) => {
          try {
            params[n] = decodeURIComponent(m[i + 1]);
          } catch {
            params[n] = "";
          }
        });
        return { route: r, params };
      }
      return pathMatched ? { methodNotAllowed: true } : null;
    }
  };
}
