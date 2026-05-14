// src/metrics.js
// Métricas in-memory leves. Formato compatível com Prometheus text exposition
// no endpoint /api/metrics — scrapeable por qualquer coletor padrão.

const counters = new Map();
const histograms = new Map(); // {name -> {buckets, sum, count}}

const DEFAULT_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

const startTime = Date.now();

export function inc(name, labels = {}, value = 1) {
  const key = serieKey(name, labels);
  counters.set(key, (counters.get(key) || 0) + value);
}

export function observe(name, labels = {}, valueMs) {
  const key = serieKey(name, labels);
  let h = histograms.get(key);
  if (!h) {
    h = { buckets: new Array(DEFAULT_BUCKETS_MS.length).fill(0), sum: 0, count: 0 };
    histograms.set(key, h);
  }
  h.sum += valueMs;
  h.count += 1;
  for (let i = 0; i < DEFAULT_BUCKETS_MS.length; i++) {
    if (valueMs <= DEFAULT_BUCKETS_MS[i]) h.buckets[i] += 1;
  }
}

function serieKey(name, labels) {
  const lbls = Object.keys(labels).sort().map((k) => `${k}="${escape(labels[k])}"`).join(',');
  return lbls ? `${name}{${lbls}}` : name;
}
function escape(v) {
  return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/** Snapshot puro — útil para /api/health resumido. */
export function snapshot() {
  return {
    uptime_s: Math.round((Date.now() - startTime) / 1000),
    counters: Object.fromEntries(counters),
    histograms: Object.fromEntries(
      Array.from(histograms.entries()).map(([k, h]) => [
        k,
        { count: h.count, sum_ms: h.sum, avg_ms: h.count ? +(h.sum / h.count).toFixed(2) : 0 },
      ]),
    ),
  };
}

/** Saída em formato Prometheus text exposition format (v0.0.4). */
export function toPrometheus() {
  const lines = [];
  lines.push(`# HELP app_uptime_seconds Uptime of the process in seconds`);
  lines.push(`# TYPE app_uptime_seconds counter`);
  lines.push(`app_uptime_seconds ${Math.round((Date.now() - startTime) / 1000)}`);

  // Counters
  const counterNames = new Set();
  for (const k of counters.keys()) {
    const m = k.match(/^([a-z_][a-z0-9_]*)/);
    if (m) counterNames.add(m[1]);
  }
  for (const name of counterNames) {
    lines.push(`# HELP ${name} Counter ${name}`);
    lines.push(`# TYPE ${name} counter`);
    for (const [k, v] of counters) if (k.startsWith(name)) lines.push(`${k} ${v}`);
  }

  // Histograms
  const histNames = new Set();
  for (const k of histograms.keys()) {
    const m = k.match(/^([a-z_][a-z0-9_]*)/);
    if (m) histNames.add(m[1]);
  }
  for (const name of histNames) {
    lines.push(`# HELP ${name} Histogram ${name}`);
    lines.push(`# TYPE ${name} histogram`);
    for (const [k, h] of histograms) {
      if (!k.startsWith(name)) continue;
      const labelPart = k.includes('{') ? k.slice(k.indexOf('{')) : '';
      for (let i = 0; i < DEFAULT_BUCKETS_MS.length; i++) {
        const le = DEFAULT_BUCKETS_MS[i];
        const lblWithLe = labelPart
          ? labelPart.replace('}', `,le="${le}"}`)
          : `{le="${le}"}`;
        lines.push(`${name}_bucket${lblWithLe} ${h.buckets[i]}`);
      }
      const inf = labelPart ? labelPart.replace('}', `,le="+Inf"}`) : `{le="+Inf"}`;
      lines.push(`${name}_bucket${inf} ${h.count}`);
      lines.push(`${name}_sum${labelPart} ${h.sum}`);
      lines.push(`${name}_count${labelPart} ${h.count}`);
    }
  }
  return lines.join('\n') + '\n';
}

/** Reset apenas em testes. */
export function _resetForTests() {
  counters.clear();
  histograms.clear();
}
