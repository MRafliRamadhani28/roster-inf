export function contrastText(hex){
  const lum = h => { h = String(h||'').replace('#','');
    if (h.length === 3) h = h.split('').map(c=>c+c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return 0.2;
    const c = [0,2,4].map(i=>{ const v=parseInt(h.substr(i,2),16)/255; return v<=0.03928? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; };
  const L = lum(hex), Lw = lum('#f3f5fe'), Ld = lum('#161826');
  return (Lw+0.05)/(L+0.05) >= (L+0.05)/(Ld+0.05) ? '#f3f5fe' : '#161826';
}

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function typeStyle(type) {
  if (!type) return '';
  return `--type-bg:${esc(type.color)};--type-fg:${contrastText(type.color)};`;
}

export const UNKNOWN_TYPE_STYLE = '--type-bg:var(--color-neutral-700);--type-fg:var(--color-text);';
