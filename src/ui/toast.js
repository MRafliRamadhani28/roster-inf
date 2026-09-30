import { esc } from '../utils/color.js';

const ICONS = {
  success: 'ph-fill ph-check-circle',
  error: 'ph-fill ph-warning-circle',
  info: 'ph-fill ph-info',
};

export function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  const kind = ICONS[type] ? type : 'success';
  const toast = document.createElement('div');
  toast.className = `toast toast-${kind}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `<i class="${ICONS[kind]}"></i>${esc(message)}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

window.showToast = showToast;
