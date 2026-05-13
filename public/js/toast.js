// public/js/toast.js
// Toast notifications discretas, auto-dismiss em 4s.

import { $ } from './format.js';

const TIMEOUT_MS = 4000;
const root = () => $('#toasts');

export function toast({ title = '', body = '', kind = 'success' } = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.dataset.kind = kind;
  el.innerHTML = `
    <div>
      ${title ? `<div class="toast__title">${escapeHtml(title)}</div>` : ''}
      <div class="toast__body">${escapeHtml(body)}</div>
    </div>
  `;
  root().appendChild(el);
  setTimeout(() => el.remove(), TIMEOUT_MS);
}

export const toastOk    = (body, title = 'Pronto')      => toast({ title, body, kind: 'success' });
export const toastInfo  = (body, title = 'Aviso')        => toast({ title, body, kind: 'info' });
export const toastWarn  = (body, title = 'Atenção')      => toast({ title, body, kind: 'warn' });
export const toastError = (body, title = 'Falhou')       => toast({ title, body, kind: 'error' });

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
