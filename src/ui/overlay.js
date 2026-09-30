import { esc } from '../utils/color.js';

const stack = [];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function hasOverlay() {
  return stack.length > 0;
}

document.addEventListener('keydown', e => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    top.dismiss();
    return;
  }
  if (e.key !== 'Tab') return;
  const items = [...top.dialog.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
  if (!items.length) {
    e.preventDefault();
    top.dialog.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (!top.dialog.contains(active)) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && (active === first || active === top.dialog)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}, true);

function mount({ root, dialog, onClose, initialFocus, closeOnScrim }) {
  const trigger = document.activeElement;
  const entry = {
    dialog,
    closed: false,
    dismiss() { close(); },
  };
  function close() {
    if (entry.closed) return;
    entry.closed = true;
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
    root.remove();
    if (trigger && document.contains(trigger) && typeof trigger.focus === 'function') trigger.focus();
    if (onClose) onClose();
  }
  stack.push(entry);
  document.body.appendChild(root);
  if (closeOnScrim) root.querySelector('[data-scrim]').addEventListener('click', () => close());
  const target = (initialFocus && dialog.querySelector(initialFocus)) || dialog;
  target.focus();
  return { close };
}

export function openModal({ title, width, body, footer = '', onClose }) {
  const root = document.createElement('div');
  root.className = 'overlay';
  root.innerHTML = `
    <div class="scrim scrim-modal" data-scrim></div>
    <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1" style="--modal-w:${width}px">
      <div class="modal-head">
        <h3>${esc(title)}</h3>
        <button type="button" class="btn btn-secondary btn-close" aria-label="Tutup" data-close><i class="ph ph-x"></i></button>
      </div>
      <div data-body>${body}</div>
      <div data-footer>${footer}</div>
    </div>`;
  const dialog = root.querySelector('.modal');
  const { close } = mount({ root, dialog, onClose, closeOnScrim: true });
  root.querySelector('[data-close]').addEventListener('click', () => close());
  return {
    el: dialog,
    body: root.querySelector('[data-body]'),
    footer: root.querySelector('[data-footer]'),
    close,
  };
}

export function openSheet({ title, body, onClose }) {
  const root = document.createElement('div');
  root.className = 'overlay';
  root.className = 'overlay overlay-sheet';
  root.innerHTML = `
    <div class="scrim scrim-sheet" data-scrim></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1">
      <span class="sheet-grabber"></span>
      <div class="sheet-head">
        <span class="sheet-title">${esc(title)}</span>
        <button type="button" class="btn btn-secondary btn-close" aria-label="Tutup" data-close><i class="ph ph-x"></i></button>
      </div>
      <div data-body>${body}</div>
    </div>`;
  const dialog = root.querySelector('.sheet');
  const { close } = mount({ root, dialog, onClose, closeOnScrim: true });
  root.querySelector('[data-close]').addEventListener('click', () => close());
  return { el: dialog, body: root.querySelector('[data-body]'), close };
}

export function confirmDialog({ title, message, detail, action, danger = false }) {
  return new Promise(resolve => {
    const root = document.createElement('div');
    root.className = 'overlay overlay-confirm';
    root.innerHTML = `
      <div class="scrim scrim-confirm"></div>
      <div class="confirm ${danger ? 'is-danger' : ''}" role="alertdialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1">
        <div class="confirm-head">
          <span class="confirm-icon"><i class="ph ${danger ? 'ph-warning' : 'ph-magic-wand'}"></i></span>
          <span class="confirm-title">${esc(title)}</span>
        </div>
        <p class="confirm-message">${esc(message)}</p>
        ${detail ? `<p class="confirm-detail">${esc(detail)}</p>` : ''}
        <div class="confirm-actions">
          <button type="button" class="btn btn-secondary confirm-cancel" data-cancel>Batal</button>
          <button type="button" class="btn ${danger ? 'btn-danger-strong' : 'btn-primary'} confirm-ok" data-ok><i class="ph ${danger ? 'ph-trash' : 'ph-magic-wand'}"></i>${esc(action)}</button>
        </div>
      </div>`;
    const dialog = root.querySelector('.confirm');
    let result = false;
    const { close } = mount({ root, dialog, initialFocus: '[data-cancel]', onClose: () => resolve(result) });
    root.querySelector('[data-cancel]').addEventListener('click', () => close());
    root.querySelector('[data-ok]').addEventListener('click', () => { result = true; close(); });
  });
}
