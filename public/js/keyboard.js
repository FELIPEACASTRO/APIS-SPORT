// @ts-check
// public/js/keyboard.js
// Atalhos globais. Considera meta key cross-platform (Cmd no mac, Ctrl no resto).

const isMac = navigator.platform.toLowerCase().includes('mac');
const metaPressed = (e) => (isMac ? e.metaKey : e.ctrlKey);

const tagBlocksTyping = (el) =>
  el && /^(input|textarea|select)$/i.test(el.tagName) && !el.readOnly;

export function initKeyboard(handlers) {
  document.addEventListener('keydown', (e) => {
    // Esc fecha overlays — sempre
    if (e.key === 'Escape') {
      handlers.closeAll?.();
      return;
    }

    // ⌘K / Ctrl-K  → palette
    if ((e.key === 'k' || e.key === 'K') && metaPressed(e)) {
      e.preventDefault();
      handlers.openPalette?.();
      return;
    }

    // "/" foca o campo de busca do catálogo (só fora de inputs)
    if (e.key === '/' && !tagBlocksTyping(document.activeElement)) {
      e.preventDefault();
      handlers.focusSearch?.();
      return;
    }

    // 1 / 2 / 3 trocam de tab (fora de inputs)
    if (['1', '2', '3'].includes(e.key) && !tagBlocksTyping(document.activeElement)) {
      e.preventDefault();
      const map = { '1': 'catalog', '2': 'session', '3': 'dashboard' };
      handlers.switchTab?.(map[e.key]);
      return;
    }

    // ⌘ ↵ executa
    if (e.key === 'Enter' && metaPressed(e)) {
      e.preventDefault();
      handlers.execute?.();
      return;
    }

    // ⌘ A seleciona tudo visível
    if ((e.key === 'a' || e.key === 'A') && metaPressed(e) && !tagBlocksTyping(document.activeElement)) {
      e.preventDefault();
      handlers.selectAllVisible?.();
      return;
    }

    // ⌘ ⇧ Backspace limpa seleção
    if (e.key === 'Backspace' && metaPressed(e) && e.shiftKey) {
      e.preventDefault();
      handlers.clearSelection?.();
      return;
    }

    // ? abre atalhos
    if (e.key === '?' && !tagBlocksTyping(document.activeElement)) {
      e.preventDefault();
      handlers.openShortcuts?.();
    }
  });
}
