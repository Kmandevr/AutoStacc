// A small JSON Schema checker for the engine contract (engine/contract/v1/): type, enum, required, properties, items,
// pattern and $ref to a sibling file. Enough for the contract's own schemas; not a general validator. No dependencies.
const fs = require("fs");
const path = require("path");

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);

/** Returns a list of problems ("files[3].facts.sampleRate: expected integer, got string"); empty when valid. */
function check(schemaFile, value) {
  const dir = path.dirname(schemaFile);
  const cache = new Map();
  const load = (file) => {
    if (!cache.has(file)) cache.set(file, JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")));
    return cache.get(file);
  };
  const problems = [];
  const walk = (schema, v, at) => {
    if (schema.$ref) return walk(load(schema.$ref), v, at);
    if (schema.enum && !schema.enum.includes(v)) return problems.push(`${at}: ${JSON.stringify(v)} isn't one of ${JSON.stringify(schema.enum)}`);
    if (schema.type) {
      const t = typeOf(v);
      const ok = schema.type === t || (schema.type === "number" && t === "integer");
      if (!ok) return problems.push(`${at}: expected ${schema.type}, got ${t}`);
    }
    if (typeof v === "number" && schema.minimum !== undefined && v < schema.minimum) problems.push(`${at}: below ${schema.minimum}`);
    if (typeof v === "number" && schema.maximum !== undefined && v > schema.maximum) problems.push(`${at}: above ${schema.maximum}`);
    if (schema.pattern && typeof v === "string" && !new RegExp(schema.pattern).test(v)) problems.push(`${at}: doesn't match ${schema.pattern}`);
    if (typeOf(v) === "object") {
      for (const k of schema.required || []) if (!(k in v)) problems.push(`${at}: missing ${k}`);
      for (const [k, sub] of Object.entries(schema.properties || {})) if (k in v) walk(sub, v[k], `${at}.${k}`);
    }
    if (typeOf(v) === "array" && schema.items) v.forEach((x, i) => walk(schema.items, x, `${at}[${i}]`));
  };
  walk(load(path.basename(schemaFile)), value, "$");
  return problems;
}

module.exports = { check };
