// public/js/palette.js
// Command palette ⌘K — busca APIs + ações rápidas.

import { $, pad3 } from './format.js';

let _state = null;
let _onPick = null;
let _selectedIndex = 0;
let _filteredItems = [];

const ACTIONS = [
  { id: 'a:catalog',  title: 'Ir para o Catálogo',       sub: 'tab', hint: '1' },
  { id: 'a:session',  title: 'Ir para a Sessão',         sub: 'tab', hint: '2' },
  { id: 'a:select-all', title: 'Selecionar tudo visível',sub: 'ação', hint: '⌘ A' },
  { id: 'a:clear',    title: 'Limpar seleção',           sub: 'ação', hint: '⌘ ⇧ ⌫' },
  { id: 'a:execute',  title: 'Executar APIs selecionadas', sub: 'ação', hint: '⌘ ↵' },
];

export function initPalette({ getState, onPick }) {
  _state = getState;
  _onPick = onPick;

  const palette = $('#palette');
  const input = $('#palette-input');
  const list = $('#palette-list');

  $('#open-palette').addEventListener('click', () => open());

  input.addEventListener('input', () => render(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(+1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(e.shiftKey); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });

  palette.addEventListener('close', () => {
    input.value = '';
    list.innerHTML = '';
    _selectedIndex = 0;
  });

  // backdrop click fecha
  palette.addEventListener('click', (e) => {
    if (e.target === palette) close();
  });

  function open() {
    if (palette.open) return;
    palette.showModal();
    setTimeout(() => input.focus(), 0);
    render('');
  }
  function close() { palette.close(); }

  function render(query) {
    const q = query.toLowerCase().trim();
    const state = _state();
    const apis = state.catalog
      .filter((a) => {
        if (!q) return true;
        const blob = `${a.name} ${a.provider} ${a.rapidapi_host} ${a.description} ${a.subcategory}`.toLowerCase();
        return blob.includes(q);
      })
      .slice(0, 30);

    const actions = ACTIONS.filter((a) =>
      !q ? true : a.title.toLowerCase().includes(q),
    );

    _filteredItems = [
      ...actions.map((a) => ({ type: 'action', item: a })),
      ...apis.map((a) => ({ type: 'api', item: a })),
    ];

    _selectedIndex = 0;
    list.innerHTML = '';
    const tpl = $('#tpl-palette-item');
    for (let i = 0; i < _filteredItems.length; i++) {
      const { type, item } = _filteredItems[i];
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.idx = i;
      node.dataset.type = type;
      if (i === _selectedIndex) node.setAttribute('aria-selected', 'true');
      if (type === 'api') {
        node.querySelector('[data-field="pre"]').textContent = `#${pad3(item.id)}`;
        node.querySelector('[data-field="title"]').textContent = item.name;
        node.querySelector('[data-field="sub"]').textContent = `${item.subcategory} · ${item.rapidapi_host}`;
        node.querySelector('[data-field="hint"]').textContent = item.pricing;
      } else {
        node.querySelector('[data-field="pre"]').textContent = '⌘';
        node.querySelector('[data-field="title"]').textContent = item.title;
        node.querySelector('[data-field="sub"]').textContent = item.sub;
        node.querySelector('[data-field="hint"]').textContent = item.hint;
      }
      node.addEventListener('click', () => { _selectedIndex = i; pick(false); });
      list.appendChild(node);
    }
  }

  function move(delta) {
    if (_filteredItems.length === 0) return;
    _selectedIndex = (_selectedIndex + delta + _filteredItems.length) % _filteredItems.length;
    $$listItems().forEach((el, idx) => {
      el.setAttribute('aria-selected', String(idx === _selectedIndex));
      if (idx === _selectedIndex) el.scrollIntoView({ block: 'nearest' });
    });
  }
  function $$listItems() { return Array.from(list.querySelectorAll('.palette__item')); }

  function pick(shift) {
    const current = _filteredItems[_selectedIndex];
    if (!current) return;
    _onPick?.(current, { shift });
    close();
  }

  return { open, close };
}
