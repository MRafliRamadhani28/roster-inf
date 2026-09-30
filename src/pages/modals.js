import { api } from '../services/api.js';
import { esc, typeStyle } from '../utils/color.js';
import { showToast } from '../ui/toast.js';
import { openModal, confirmDialog } from '../ui/overlay.js';

function keepFocus(modal) {
  if (!modal.el.contains(document.activeElement)) modal.el.focus();
}

export async function showUserManager(dash) {
  let users;
  try {
    users = await api.getUsers();
  } catch (err) {
    showToast('Gagal mengambil data user', 'error');
    return;
  }

  const renderBody = () => {
    const rows = users.map(u => `
      <div class="row-item">
        <span class="avatar">${esc(String(u.display_name || '').charAt(0))}</span>
        <span class="ri-text"><strong>${esc(u.display_name)}</strong><span class="ri-sub">${esc(u.username)}</span></span>
        <span class="tag tag-neutral tag-role">${esc(u.role)}</span>
        ${u.id !== dash.user.id
          ? `<button type="button" class="btn btn-del w92" data-del="${u.id}"><i class="ph ph-trash"></i>Hapus</button>`
          : '<span class="self-label">Akun Anda</span>'}
      </div>`).join('');
    return `
      <div class="mb">
        <section class="sec">
          <h4>Buat Akun Baru</h4>
          <div class="user-form">
            <div class="field"><label for="new-user-username">Username</label><input type="text" id="new-user-username" class="input" placeholder="Username" autocomplete="off" /></div>
            <div class="field"><label for="new-user-password">Password</label><input type="password" id="new-user-password" class="input" placeholder="Password" autocomplete="new-password" /></div>
            <div class="field"><label for="new-user-name">Nama Tampilan</label><input type="text" id="new-user-name" class="input" placeholder="Nama Tampilan" /></div>
            <div class="field"><label for="new-user-role">Role</label>
              <select id="new-user-role" class="input"><option value="viewer">Viewer</option><option value="admin">Admin</option></select>
            </div>
            <button type="button" class="btn btn-primary btn-create" id="btn-add-user"><i class="ph ph-plus"></i>Buat</button>
          </div>
        </section>
        <section class="sec-list">
          <h4>Daftar Akun</h4>
          ${rows || '<span class="help">Belum ada user tambahan.</span>'}
        </section>
      </div>`;
  };

  const modal = openModal({ title: 'Kelola Akun (User Management)', width: 760, body: renderBody() });
  const refresh = async () => {
    users = await api.getUsers();
    modal.body.innerHTML = renderBody();
    keepFocus(modal);
  };

  modal.el.addEventListener('click', async e => {
    if (e.target.closest('#btn-add-user')) {
      const username = document.getElementById('new-user-username').value;
      const password = document.getElementById('new-user-password').value;
      const displayName = document.getElementById('new-user-name').value;
      const role = document.getElementById('new-user-role').value;
      if (!username || !password || !displayName) {
        showToast('Username, password, dan nama wajib diisi', 'error');
        return;
      }
      try {
        await api.registerUser({ username, password, displayName, role });
        showToast('User berhasil dibuat!');
        await refresh();
      } catch (err) {
        showToast(err.message, 'error');
      }
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const u = users.find(x => String(x.id) === del.dataset.del);
      const ok = await confirmDialog({
        title: 'Hapus akun',
        message: 'Yakin ingin menghapus akun ini secara permanen?',
        detail: u ? `${u.display_name} (${u.username})` : '',
        action: 'Hapus akun',
        danger: true,
      });
      if (!ok) return;
      try {
        await api.deleteUser(del.dataset.del);
        showToast('Akun berhasil dihapus');
        await refresh();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  });
}

export function showEmployeeManager(dash) {
  const nextSlot = () => dash.employees.reduce((a, e) => Math.max(a, Number(e.slot_position) || 0), 0) + 1;

  const renderBody = () => {
    const rows = dash.employees.map(emp => `
      <div class="row-item">
        <span class="slot-badge">Slot: ${esc(emp.slot_position)}</span>
        <strong>${esc(emp.name)}</strong>
        <button type="button" class="btn btn-del" data-del="${emp.id}"><i class="ph ph-trash"></i>Hapus</button>
      </div>`).join('');
    return `
      <div class="mb">
        <section class="sec">
          <h4>Tambah Karyawan Baru</h4>
          <div class="emp-form">
            <input type="text" id="new-emp-name" class="input" aria-label="Nama Karyawan" placeholder="Nama Karyawan" />
            <button type="button" class="btn btn-primary" id="btn-add-emp"><i class="ph ph-plus"></i>Tambah</button>
          </div>
          <span class="help">Slot diberikan otomatis: Slot ${nextSlot()}.</span>
        </section>
        <section class="sec-list">
          <h4>Daftar Karyawan Aktif</h4>
          ${rows || '<span class="help">Belum ada karyawan.</span>'}
        </section>
      </div>`;
  };

  const modal = openModal({ title: 'Manajemen Karyawan', width: 520, body: renderBody() });
  const refresh = async () => {
    await dash.loadData();
    modal.body.innerHTML = renderBody();
    keepFocus(modal);
  };

  const add = async () => {
    const input = document.getElementById('new-emp-name');
    const name = input.value;
    if (!name) return input.focus();
    try {
      await api.request('/employees', { method: 'POST', body: JSON.stringify({ name }) });
      showToast('Karyawan berhasil ditambah');
      await refresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  modal.el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'new-emp-name') add();
  });
  modal.el.addEventListener('click', async e => {
    if (e.target.closest('#btn-add-emp')) return add();
    const del = e.target.closest('[data-del]');
    if (!del) return;
    const emp = dash.employees.find(x => String(x.id) === del.dataset.del);
    const ok = await confirmDialog({
      title: 'Hapus karyawan',
      message: 'Yakin ingin menghapus karyawan ini?',
      detail: emp ? `${emp.name} (Slot: ${emp.slot_position})` : '',
      action: 'Hapus karyawan',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.request(`/employees/${del.dataset.del}`, { method: 'DELETE' });
      showToast('Karyawan berhasil dihapus');
      await refresh();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

const clone = v => JSON.parse(JSON.stringify(v));

function validateConfig(c) {
  if (!c || !Array.isArray(c.scheduleTypes) || !c.workdayPattern || !Array.isArray(c.workdayPattern.slots) || !c.nonWorkdayPattern) {
    throw new Error('struktur scheduleTypes / workdayPattern / nonWorkdayPattern tidak lengkap');
  }
  return c;
}

export function showPatternEditor(dash) {
  let draft = clone(dash.patternConfig);
  let mode = 'form';
  let json = JSON.stringify(draft, null, 2);

  const typeOf = code => draft.scheduleTypes.find(t => t.code === code);

  const formHtml = () => {
    const types = draft.scheduleTypes;
    const wp = draft.workdayPattern;
    const nw = draft.nonWorkdayPattern;
    const slots = wp.slots;
    const cycLen = wp.cycleLength || 1;
    const codeOptions = cur => ['', ...types.map(t => t.code)]
      .map(v => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${v ? esc(v) : '—'}</option>`).join('');

    const typeRows = types.map((t, i) => `
      <div class="type-grid">
        <input type="color" aria-label="Warna ${esc(t.code)}" value="${esc(t.color)}" data-f="type.${i}.color" />
        <input class="input code" aria-label="Kode" value="${esc(t.code)}" style="text-transform:uppercase" data-f="type.${i}.code" />
        <input class="input" aria-label="Label" value="${esc(t.label)}" data-f="type.${i}.label" />
        <input class="input" aria-label="Jam" value="${esc(t.hours)}" data-f="type.${i}.hours" />
        <span class="preview-chip" style="${typeStyle(t)}">${esc(t.code)}</span>
        <button type="button" class="btn btn-secondary btn-icon btn-x" aria-label="Hapus tipe ${esc(t.code)}" data-a="rm-type" data-i="${i}" data-f="rm-type.${i}"><i class="ph ph-x"></i></button>
      </div>`).join('');

    const slotRows = slots.map((s, si) => {
      const cycle = s.cycle || [];
      const steps = Array.from({ length: cycLen }, (_, ci) => {
        const v = cycle[ci] || '';
        const t = typeOf(v);
        return `
          <label class="step">Hari ${ci + 1}
            <select class="input" data-f="step.${si}.${ci}">${codeOptions(v)}</select>
          </label>
          <span class="step-chip" style="${t ? typeStyle(t) : '--type-bg:var(--color-neutral-800);--type-fg:var(--color-text);'}">${esc(v)}</span>
          ${ci < cycLen - 1 ? '<i class="ph ph-arrow-right step-arrow"></i>' : ''}`;
      }).join('');
      return `
        <div class="slot-row">
          <span class="slot-name">Slot ${esc(s.position)}</span>
          ${steps}
          <button type="button" class="btn btn-secondary btn-icon btn-x" aria-label="Hapus slot ${esc(s.position)}" data-a="rm-slot" data-i="${si}" data-f="rm-slot.${si}"><i class="ph ph-x"></i></button>
        </div>`;
    }).join('');

    const ocSlots = nw.ocSlots || [];
    const ocChips = slots.map(s => {
      const on = ocSlots.includes(s.position);
      return `<button type="button" class="oc-chip" aria-pressed="${on}" data-a="oc" data-p="${esc(s.position)}" data-f="oc.${esc(s.position)}">${on ? '✓ ' : ''}Slot ${esc(s.position)}</button>`;
    }).join('');
    const slotOptions = slots.map(s => `<option value="${esc(s.position)}" ${String(s.position) === String(nw.btSlot) ? 'selected' : ''}>Slot ${esc(s.position)}</option>`).join('');
    const rotation = nw.ocRotation || 'alternate';

    return `
      <div class="pf">
        <section>
          <div class="pf-title"><h4>Tipe jadwal</h4><code>scheduleTypes</code></div>
          <div class="type-scroll">
            <div class="type-grid head"><span>Warna</span><span>Kode</span><span>Label</span><span>Jam ("-" bila tidak ada)</span><span>Pratinjau</span><span></span></div>
            ${typeRows}
          </div>
          <button type="button" class="btn btn-ghost btn-add" data-a="add-type" data-f="add-type"><i class="ph ph-plus"></i>Tambah tipe</button>
        </section>
        <section>
          <div class="pf-title"><h4>Siklus hari kerja per slot</h4><code>workdayPattern</code></div>
          <div class="stepper">
            <span>Panjang siklus</span>
            <div class="stepper-ctl">
              <button type="button" class="btn btn-secondary btn-icon" aria-label="Kurangi panjang siklus" data-a="cyc-dec" data-f="cyc-dec"><i class="ph ph-minus"></i></button>
              <span class="stepper-val">${cycLen}</span>
              <button type="button" class="btn btn-secondary btn-icon" aria-label="Tambah panjang siklus" data-a="cyc-inc" data-f="cyc-inc"><i class="ph ph-plus"></i></button>
            </div>
            <span class="stepper-hint">hari kerja, lalu berulang</span>
          </div>
          ${slotRows}
          <button type="button" class="btn btn-ghost btn-add" data-a="add-slot" data-f="add-slot"><i class="ph ph-plus"></i>Tambah slot</button>
        </section>
        <section>
          <div class="pf-title"><h4>Weekend &amp; libur</h4><code>nonWorkdayPattern</code></div>
          <div class="nw-grid">
            <span>Slot OC (On Call)</span>
            <div class="oc-chips">${ocChips}</div>
            <span>Slot BT (Back Up)</span>
            <select class="input" style="width:140px" data-f="bt">${slotOptions}</select>
            <span>Rotasi OC</span>
            <select class="input" style="width:220px" data-f="rot">
              <option value="alternate" ${rotation === 'alternate' ? 'selected' : ''}>Bergantian (alternate)</option>
              ${rotation !== 'alternate' ? `<option value="${esc(rotation)}" selected>${esc(rotation)}</option>` : ''}
            </select>
          </div>
        </section>
      </div>`;
  };

  const jsonHtml = () => `
    <div class="pj">
      <p>Edit konfigurasi pola menggunakan format JSON. Pastikan struktur scheduleTypes, workdayPattern, dan nonWorkdayPattern tidak berubah.</p>
      <textarea class="input" id="pattern-json-editor" aria-label="JSON pola jadwal" spellcheck="false" data-f="json">${esc(json)}</textarea>
    </div>`;

  const bodyHtml = () => `
    <div class="seg-row">
      <div class="seg" role="tablist" aria-label="Mode editor">
        <button type="button" role="tab" class="seg-opt" aria-selected="${mode === 'form'}" data-tab="form"><i class="ph ph-list-bullets"></i>Form visual</button>
        <button type="button" role="tab" class="seg-opt" aria-selected="${mode === 'json'}" data-tab="json"><i class="ph ph-brackets-curly"></i>JSON</button>
      </div>
      <span class="help">Keduanya menyimpan pattern_config yang sama.</span>
    </div>
    ${mode === 'form' ? formHtml() : jsonHtml()}`;

  const footer = `
    <div class="pf-foot">
      <span>Disimpan sebagai JSON pattern_config</span>
      <button type="button" class="btn btn-secondary" data-close-pattern>Batal</button>
      <button type="button" class="btn btn-primary" data-save-pattern><i class="ph ph-floppy-disk"></i>Simpan Pola</button>
    </div>`;

  const modal = openModal({ title: 'Konfigurasi Pola Jadwal', width: 820, body: bodyHtml(), footer });

  const render = () => {
    const f = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.f : null;
    modal.body.innerHTML = bodyHtml();
    const target = f ? modal.el.querySelector(`[data-f="${f}"]`) : null;
    if (target) target.focus();
    else keepFocus(modal);
  };

  const setField = (path, value) => {
    const [kind, a, b] = path.split('.');
    if (kind === 'type') draft.scheduleTypes[a][b] = b === 'code' ? value.toUpperCase() : value;
    else if (kind === 'step') {
      const s = draft.workdayPattern.slots[a];
      s.cycle = s.cycle || [];
      s.cycle[b] = value;
    } else if (kind === 'bt') draft.nonWorkdayPattern.btSlot = parseInt(value, 10);
    else if (kind === 'rot') draft.nonWorkdayPattern.ocRotation = value;
  };

  modal.el.addEventListener('input', e => {
    const f = e.target.dataset.f;
    if (!f) return;
    if (f === 'json') json = e.target.value;
    else if (f.startsWith('type.')) setField(f, e.target.value);
  });

  modal.el.addEventListener('change', e => {
    const f = e.target.dataset.f;
    if (!f || f === 'json') return;
    setField(f, e.target.value);
    setTimeout(render, 0);
  });

  const switchTab = tab => {
    if (tab === mode) return;
    if (tab === 'json') {
      json = JSON.stringify(draft, null, 2);
      mode = 'json';
    } else {
      try {
        draft = validateConfig(JSON.parse(json));
        mode = 'form';
      } catch (err) {
        showToast('JSON tidak valid atau error: ' + err.message, 'error');
        return;
      }
    }
    modal.body.innerHTML = bodyHtml();
    const tabBtn = modal.el.querySelector(`[data-tab="${tab}"]`);
    if (tabBtn) tabBtn.focus();
  };

  const save = async () => {
    try {
      const config = mode === 'json' ? JSON.parse(json) : draft;
      await api.request('/patterns', { method: 'PUT', body: JSON.stringify({ config }) });
      modal.close();
      showToast('Pola berhasil diupdate');
      dash.loadData();
    } catch (err) {
      showToast('JSON tidak valid atau error: ' + err.message, 'error');
    }
  };

  modal.el.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) return switchTab(tab.dataset.tab);
    if (e.target.closest('[data-close-pattern]')) return modal.close();
    if (e.target.closest('[data-save-pattern]')) return save();
    const a = e.target.closest('[data-a]');
    if (!a) return;
    const wp = draft.workdayPattern;
    const nw = draft.nonWorkdayPattern;
    const i = parseInt(a.dataset.i, 10);
    switch (a.dataset.a) {
      case 'add-type':
        draft.scheduleTypes.push({ code: `X${draft.scheduleTypes.length + 1}`, label: 'Tipe baru', hours: '-', color: '#9397ab' });
        break;
      case 'rm-type':
        draft.scheduleTypes.splice(i, 1);
        break;
      case 'cyc-inc':
      case 'cyc-dec': {
        const len = a.dataset.a === 'cyc-inc' ? Math.min(7, (wp.cycleLength || 1) + 1) : Math.max(1, (wp.cycleLength || 1) - 1);
        wp.cycleLength = len;
        wp.slots.forEach(s => {
          s.cycle = s.cycle || [];
          while (s.cycle.length < len) s.cycle.push(s.cycle[s.cycle.length - 1] || '');
          s.cycle = s.cycle.slice(0, len);
        });
        break;
      }
      case 'add-slot': {
        const position = wp.slots.reduce((m, s) => Math.max(m, Number(s.position) || 0), 0) + 1;
        const first = (draft.scheduleTypes[0] || {}).code || '';
        wp.slots.push({ position, cycle: Array.from({ length: wp.cycleLength || 1 }, () => first) });
        break;
      }
      case 'rm-slot':
        wp.slots.splice(i, 1);
        break;
      case 'oc': {
        const p = Number(a.dataset.p);
        const list = nw.ocSlots || [];
        nw.ocSlots = list.includes(p) ? list.filter(v => v !== p) : [...list, p].sort((x, y) => x - y);
        break;
      }
    }
    render();
  });
}
