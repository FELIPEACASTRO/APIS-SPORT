// @ts-check
// public/js/format.js
// Funções puras de formatação.

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function pad3(n) { return String(n).padStart(3, '0'); }

export function debounce(fn, ms = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function prettyJson(obj) {
  try { return JSON.stringify(obj, null, 2); }
  catch { return String(obj); }
}

/** Converte objeto/array em árvore HTML colorida. */
export function toTreeHTML(value, depth = 0) {
  if (value === null) return `<span class="tree-node__val--null">null</span>`;
  const type = typeof value;
  if (type === 'string')  return `<span class="tree-node__val--string">"${escape(value)}"</span>`;
  if (type === 'number')  return `<span class="tree-node__val--number">${value}</span>`;
  if (type === 'boolean') return `<span class="tree-node__val--boolean">${value}</span>`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `<span class="tree-node__bracket">[ ]</span>`;
    const items = value
      .map(
        (item, i) =>
          `<div class="tree-node"><span class="tree-node__key">${i}</span><span class="tree-node__sep">:</span>${toTreeHTML(item, depth + 1)}</div>`,
      )
      .join('');
    return `<span class="tree-node__bracket">[</span><div class="tree-children">${items}</div><span class="tree-node__bracket">]</span>`;
  }
  if (type === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return `<span class="tree-node__bracket">{ }</span>`;
    const items = keys
      .map(
        (k) =>
          `<div class="tree-node"><span class="tree-node__key">${escape(k)}</span><span class="tree-node__sep">:</span>${toTreeHTML(value[k], depth + 1)}</div>`,
      )
      .join('');
    return `<span class="tree-node__bracket">{</span><div class="tree-children">${items}</div><span class="tree-node__bracket">}</span>`;
  }
  return String(value);
}

/** Escape para uso em texto E em atributos HTML (single/double quotes incluídos). */
export function escape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function copyToClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; }
}
