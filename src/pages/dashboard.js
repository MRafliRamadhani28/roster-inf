import { api } from '../services/api.js';
import { MONTH_NAMES, DAY_NAMES } from '../utils/constants.js';
import { groupDaysByWeek } from '../utils/date-utils.js';
import { esc, typeStyle, UNKNOWN_TYPE_STYLE } from '../utils/color.js';
import { showToast } from '../ui/toast.js';
import { openSheet, confirmDialog, hasOverlay } from '../ui/overlay.js';
import { showUserManager, showEmployeeManager, showPatternEditor } from './modals.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
const YEARS = [2024, 2025, 2026, 2027];
const MIN_PERIOD = 2024 * 12;
const MAX_PERIOD = 2027 * 12 + 11;

function todayString() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export class Dashboard {
  constructor(user, container) {
    this.user = user;
    this.container = container;
    this.isAdmin = user.role === 'admin';
    this.mq = window.matchMedia('(max-width: 767px)');

    const now = new Date();
    this.year = now.getFullYear();
    this.month = now.getMonth() + 1;

    this.employees = [];
    this.schedules = [];
    this.holidays = [];
    this.patternConfig = null;

    this.status = 'loading';
    this.errorMessage = '';
    this.editing = null;
    this.editSheet = null;
    this.loadSeq = 0;
    this.scrollPending = true;

    this.init();
  }

  get isMobile() {
    return this.mq.matches;
  }

  async init() {
    this.bindEvents();
    this.renderShell();
    await this.loadData(true);
  }

  bindEvents() {
    this.container.addEventListener('click', e => this.onClick(e));
    this.container.addEventListener('change', e => {
      if (e.target.id === 'month-select' || e.target.id === 'year-select') {
        this.setPeriod(parseInt(document.getElementById('year-select').value), parseInt(document.getElementById('month-select').value));
      }
    });
    document.addEventListener('mousedown', e => {
      if (!this.editing || this.editSheet) return;
      if (e.target.closest('[data-cell-editor]') || e.target.closest('[data-cell]')) return;
      this.editing = null;
      this.renderRoster();
    });
    document.addEventListener('keydown', e => this.onKey(e));
    this.mq.addEventListener('change', () => {
      this.editing = null;
      this.scrollPending = true;
      this.renderShell();
    });
  }

  onClick(e) {
    const act = e.target.closest('[data-act]');
    if (act) return this.doAction(act.dataset.act);
    const pick = e.target.closest('[data-pick]');
    if (pick) return this.pick(pick.dataset.pick);
    const cell = e.target.closest('button.cell');
    if (cell) return this.openEditor(cell.dataset.emp, cell.dataset.date);
    const jump = e.target.closest('[data-jump]');
    if (jump) this.scrollToCol(parseInt(jump.dataset.jump), false);
  }

  doAction(act) {
    switch (act) {
      case 'logout': return api.logout();
      case 'users': return showUserManager(this);
      case 'employees': return showEmployeeManager(this);
      case 'patterns': return showPatternEditor(this);
      case 'prev': return this.shiftMonth(-1);
      case 'next': return this.shiftMonth(1);
      case 'today': return this.goToday();
      case 'excel': return this.exportExcel();
      case 'pdf': return this.exportPdf();
      case 'generate': return this.generate();
      case 'reset': return this.resetMonth();
      case 'sheet-menu': return this.openActionSheet('menu');
      case 'sheet-export': return this.openActionSheet('export');
      case 'sheet-jadwal': return this.openActionSheet('jadwal');
    }
  }

  initial() {
    return esc(String(this.user.displayName || '').charAt(0).toUpperCase());
  }

  greeting() {
    return `Halo, ${esc(this.user.displayName)} (${esc(this.user.role)})`;
  }

  periodOptions() {
    const months = MONTH_NAMES.map((m, i) => `<option value="${i + 1}" ${i + 1 === this.month ? 'selected' : ''}>${m}</option>`).join('');
    const years = YEARS.map(y => `<option value="${y}" ${y === this.year ? 'selected' : ''}>${y}</option>`).join('');
    return { months, years };
  }

  renderShell() {
    this.container.innerHTML = this.isMobile ? this.mobileShell() : this.desktopShell();
    this.renderTitle();
    this.renderLegend();
    this.renderRoster();
    this.renderNotes();
  }

  desktopShell() {
    const { months, years } = this.periodOptions();
    const admin = this.isAdmin;
    return `
      <header class="app-header">
        <div class="brand">
          <span class="brand-logo"><i class="ph ph-calendar-dots"></i></span>
          <span class="brand-name">Jadwal Travel Management</span>
        </div>
        ${admin ? `
          <nav class="kelola" aria-label="Kelola">
            <button type="button" class="btn btn-secondary btn-flat" data-act="users"><i class="ph ph-user-gear"></i>Kelola Akun</button>
            <button type="button" class="btn btn-secondary btn-flat" data-act="employees"><i class="ph ph-users-three"></i>Karyawan</button>
            <button type="button" class="btn btn-secondary btn-flat" data-act="patterns"><i class="ph ph-sliders-horizontal"></i>Pola</button>
          </nav>
          <span class="vrule"></span>` : ''}
        <div class="user-chip"><span class="avatar">${this.initial()}</span><span>${this.greeting()}</span></div>
        <button type="button" class="btn btn-secondary btn-logout" data-act="logout"><i class="ph ph-sign-out"></i>Logout</button>
      </header>
      <div class="month-row">
        <div class="month-col">
          <h1 data-month-title></h1>
          <div class="month-nav">
            <button type="button" class="btn btn-secondary btn-icon" aria-label="Bulan sebelumnya" data-act="prev"><i class="ph ph-caret-left"></i></button>
            <select class="input" id="month-select" aria-label="Bulan">${months}</select>
            <select class="input year" id="year-select" aria-label="Tahun">${years}</select>
            <button type="button" class="btn btn-secondary btn-icon" aria-label="Bulan berikutnya" data-act="next"><i class="ph ph-caret-right"></i></button>
            <button type="button" class="btn btn-primary btn-today" data-act="today"><i class="ph ph-crosshair"></i>Hari ini</button>
          </div>
        </div>
        <div class="actions">
          <div class="action-group" role="group" aria-label="Export">
            <span class="caption">Export</span>
            <div class="row">
              <button type="button" class="btn btn-secondary" id="btn-excel" data-act="excel"><i class="ph ph-file-xls"></i>Excel</button>
              <button type="button" class="btn btn-secondary" id="btn-pdf" data-act="pdf"><i class="ph ph-file-pdf"></i>PDF</button>
            </div>
          </div>
          ${admin ? `
            <div class="action-group" role="group" aria-label="Jadwal">
              <span class="caption">Jadwal</span>
              <button type="button" class="btn btn-primary" id="btn-generate" data-act="generate"><i class="ph ph-magic-wand"></i><span data-gen-label>Generate</span></button>
            </div>
            <span class="vsep"></span>
            <div class="action-group" role="group" aria-label="Zona berbahaya">
              <span class="caption caption-danger">Berbahaya</span>
              <button type="button" class="btn btn-danger" id="btn-reset" data-act="reset"><i class="ph ph-trash"></i>Reset</button>
            </div>` : ''}
        </div>
      </div>
      <div class="legend" id="legend"></div>
      <main class="roster-card" id="roster"></main>
      <div class="notes-grid" id="notes"></div>
    `;
  }

  mobileShell() {
    const { months, years } = this.periodOptions();
    const cols = this.isAdmin ? 3 : 2;
    return `
      <header class="app-header">
        <span class="brand-logo"><i class="ph ph-calendar-dots"></i></span>
        <span class="brand-name" style="margin-right:auto">Jadwal Travel Management</span>
        <button type="button" class="avatar-btn" aria-label="Menu akun" data-act="sheet-menu"><span class="avatar">${this.initial()}</span></button>
      </header>
      <div class="m-top">
        <h1 data-month-title></h1>
        <div class="m-nav">
          <button type="button" class="btn btn-secondary" aria-label="Bulan sebelumnya" data-act="prev"><i class="ph ph-caret-left"></i></button>
          <select class="input" id="month-select" aria-label="Bulan">${months}</select>
          <select class="input" id="year-select" aria-label="Tahun">${years}</select>
          <button type="button" class="btn btn-secondary" aria-label="Bulan berikutnya" data-act="next"><i class="ph ph-caret-right"></i></button>
        </div>
        <div class="m-actions" style="--cols:${cols}">
          <button type="button" class="btn btn-primary" data-act="today"><i class="ph ph-crosshair"></i>Hari ini</button>
          <button type="button" class="btn btn-secondary" data-act="sheet-export"><i class="ph ph-download-simple"></i>Export</button>
          ${this.isAdmin ? '<button type="button" class="btn btn-secondary" data-act="sheet-jadwal"><i class="ph ph-magic-wand"></i>Jadwal<i class="ph ph-caret-down"></i></button>' : ''}
        </div>
      </div>
      <div class="m-legend" id="legend"></div>
      <nav class="week-jump" id="week-jump" aria-label="Lompat ke minggu" hidden></nav>
      <main class="roster-card" id="roster"></main>
      <div class="notes-grid" id="notes"></div>
    `;
  }

  renderTitle() {
    const title = `Jadwal ${MONTH_NAMES[this.month - 1]} ${this.year}`;
    this.container.querySelectorAll('[data-month-title]').forEach(el => { el.textContent = title; });
    const ms = document.getElementById('month-select');
    const ys = document.getElementById('year-select');
    if (ms) ms.value = String(this.month);
    if (ys) ys.value = String(this.year);
    const period = this.year * 12 + this.month - 1;
    const prev = this.container.querySelector('[data-act="prev"]');
    const next = this.container.querySelector('[data-act="next"]');
    if (prev) prev.disabled = period <= MIN_PERIOD;
    if (next) next.disabled = period >= MAX_PERIOD;
  }

  shiftMonth(delta) {
    const period = this.year * 12 + this.month - 1 + delta;
    if (period < MIN_PERIOD || period > MAX_PERIOD) return;
    this.setPeriod(Math.floor(period / 12), (period % 12) + 1);
  }

  setPeriod(year, month) {
    this.year = year;
    this.month = month;
    this.editing = null;
    this.renderTitle();
    return this.loadData(true);
  }

  async loadData(blank = false) {
    const seq = ++this.loadSeq;
    if (blank) {
      this.status = 'loading';
      this.renderRoster();
    }
    try {
      const [empData, schedData, holData, patData] = await Promise.all([
        api.getEmployees(),
        api.getSchedules(this.year, this.month),
        api.getHolidays(this.year, this.month),
        api.getPatternConfig()
      ]);
      if (seq !== this.loadSeq) return;
      this.employees = empData;
      this.schedules = schedData;
      this.holidays = holData;
      this.patternConfig = patData.config;
      this.status = this.employees.length ? 'ok' : 'empty';
    } catch (err) {
      if (seq !== this.loadSeq) return;
      this.status = 'error';
      this.errorMessage = err.message;
      showToast(err.message, 'error');
    }
    this.renderTitle();
    this.renderLegend();
    this.renderRoster();
    this.renderNotes();
  }

  get scheduleTypes() {
    return (this.patternConfig && this.patternConfig.scheduleTypes) || [];
  }

  typeByCode(code) {
    return this.scheduleTypes.find(t => t.code === code);
  }

  renderLegend() {
    const el = document.getElementById('legend');
    if (!el) return;
    if (!this.patternConfig) {
      el.innerHTML = '';
      return;
    }
    const items = this.scheduleTypes.map(type => `
      <span class="legend-item">
        <span class="legend-chip type-chip" style="${typeStyle(type)}">${esc(type.code)}</span>
        <span class="legend-text">= ${esc(type.hours !== '-' ? type.hours : type.label)}</span>
      </span>`).join('');
    if (this.isMobile) {
      el.innerHTML = `<span class="m-legend-title">POLA JADWAL</span><div class="m-legend-items">${items}</div>`;
      return;
    }
    el.innerHTML = `
      <span class="caption">POLA JADWAL</span>
      ${items}
      <div class="daykey">
        <span><span class="key-today"></span>Hari ini</span>
        <span><span class="key-weekend"></span>Weekend</span>
        <span><i class="ph-fill ph-flag flag"></i>Libur nasional</span>
        <span><span class="key-cuti">C</span>Cuti bersama</span>
        <span><span class="key-manual"></span>Manual override</span>
      </div>`;
  }

  renderNotes() {
    const el = document.getElementById('notes');
    if (!el) return;
    const notes = this.scheduleTypes.filter(t => t.hours !== '-').map(t => `<li>Untuk Jadwal ${esc(t.code)}, ${esc(t.hours)}</li>`).join('');
    const sorted = [...this.holidays].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const holidays = sorted.map(h => `<li>Tgl ${parseInt(String(h.date).slice(8, 10), 10)} ${esc(h.name)}</li>`).join('');
    el.innerHTML = `
      ${notes ? `
        <section class="note-card">
          <h2><i class="ph ph-note"></i>Note Jadwal</h2>
          <ul>${notes}</ul>
        </section>` : ''}
      <section class="note-card note-holiday">
        <h2><i class="ph-fill ph-flag"></i>INFO LIBUR</h2>
        <ul>${holidays || '<li>Tidak ada hari libur/cuti bulan ini</li>'}</ul>
      </section>`;
  }

  buildColumns() {
    const weeks = groupDaysByWeek(this.year, this.month);
    const cols = [];
    weeks.forEach((week, wi) => week.forEach((day, i) => {
      cols.push({ ...day, wi, first: wi > 0 && i === 0, idx: cols.length });
    }));
    return { weeks, cols };
  }

  renderRoster() {
    const el = document.getElementById('roster');
    if (!el) return;
    const prevScroll = document.getElementById('grid-scroller');
    const scrollLeft = prevScroll ? prevScroll.scrollLeft : 0;

    if (this.status === 'loading') {
      el.innerHTML = '<div class="state state-loading" aria-busy="true"><span class="spinner"></span>Memuat data roster...</div>';
      this.renderWeekJump();
      return;
    }
    if (this.status === 'error') {
      el.innerHTML = `<div class="state state-error" role="alert"><i class="ph ph-warning-circle"></i>Gagal memuat data: ${esc(this.errorMessage)}</div>`;
      this.renderWeekJump();
      return;
    }
    if (this.status === 'empty') {
      el.innerHTML = `
        <div class="state state-empty">
          <i class="ph ph-users-three"></i>
          <span>Belum ada data karyawan. Silakan tambah karyawan terlebih dahulu.</span>
          ${this.isAdmin ? '<button type="button" class="btn btn-primary" data-act="employees"><i class="ph ph-plus"></i>Karyawan</button>' : ''}
        </div>`;
      this.renderWeekJump();
      return;
    }

    el.innerHTML = this.gridHtml();
    this.renderWeekJump();
    const scroller = document.getElementById('grid-scroller');
    if (this.isMobile && scroller) {
      if (this.scrollPending) {
        this.scrollPending = false;
        this.scrollToDate(todayString(), true);
      } else {
        scroller.scrollLeft = scrollLeft;
      }
    }
  }

  dayKind(day, holiday) {
    if (holiday) return holiday.is_national_holiday ? 'holiday' : 'cuti';
    return day.isWeekend ? 'weekend' : 'work';
  }

  gridHtml() {
    const mobile = this.isMobile;
    const cw = mobile ? 44 : 38;
    const { weeks, cols } = this.buildColumns();
    const today = todayString();
    const scheduleMap = {};
    this.schedules.forEach(s => { scheduleMap[`${s.employee_id}-${s.date}`] = s; });
    const holidayMap = {};
    this.holidays.forEach(h => { holidayMap[h.date] = h; });
    const curWeek = weeks.findIndex(w => w.some(d => d.date === today));

    const weekHead = weeks.map((w, wi) => {
      const width = w.length * cw;
      const title = width < 80 ? (width < 60 ? ROMAN[wi] : `MGG ${ROMAN[wi]}`) : `MINGGU ${ROMAN[wi]}`;
      const isCur = wi === curWeek;
      return `
        <div class="wk-head${isCur ? ' is-cur' : ''}${wi > 0 ? ' gap-l' : ''}" style="grid-column:span ${w.length}">
          <span class="wk-label" title="MINGGU ${ROMAN[wi]}">${title}</span>
          ${isCur && !mobile ? '<span class="wk-tag">Minggu Ini</span>' : ''}
        </div>`;
    }).join('');

    const dayHead = cols.map(c => {
      const hol = holidayMap[c.date];
      const kind = this.dayKind(c, hol);
      const title = hol ? hol.name : (c.isWeekend ? 'Weekend' : '');
      const mark = kind === 'holiday'
        ? '<i class="ph-fill ph-flag flag" aria-label="Libur nasional"></i>'
        : kind === 'cuti' ? '<span class="cuti-badge" aria-label="Cuti bersama">C</span>' : '';
      return `
        <div class="dh k-${kind}${c.date === today ? ' is-today' : ''}${c.first ? ' gap-l' : ''}" data-date="${c.date}" data-col="${c.idx}" title="${esc(title)}">
          <span class="dow">${DAY_NAMES[c.dayOfWeek]}</span>
          <span class="dnum">${c.day}</span>
          <span class="dmark">${mark}</span>
        </div>`;
    }).join('');

    const rows = this.employees.map(emp => {
      const cells = cols.map(c => this.cellHtml(emp, c, scheduleMap, holidayMap, today, cols.length)).join('');
      return `
        <div class="gr">
          <div class="nm"><span class="nm-name">${esc(emp.name)}</span><span class="nm-slot">Slot ${esc(emp.slot_position)}</span></div>
          ${cells}
        </div>`;
    }).join('');

    return `
      <div class="scroller" id="grid-scroller">
        <div class="scroller-in" style="--n:${cols.length}">
          <div class="gr gr-wk"><div class="corner"></div>${weekHead}</div>
          <div class="gr gr-dow"><div class="corner corner-k">KARYAWAN</div>${dayHead}</div>
          ${rows}
        </div>
      </div>
      ${mobile ? `
        <div class="m-key">
          <span><i class="ph-fill ph-flag flag"></i>Libur nasional</span>
          <span><span class="k-weekend-s"></span>Weekend</span>
          <span><span class="key-manual"></span>Manual override</span>
          <span>Geser tabel ke samping →</span>
        </div>` : ''}`;
  }

  cellHtml(emp, c, scheduleMap, holidayMap, today, colCount) {
    const s = scheduleMap[`${emp.id}-${c.date}`];
    const code = s ? s.schedule_type : '';
    const manual = !!(s && s.is_manual_override);
    const hol = holidayMap[c.date];
    const kind = this.dayKind(c, hol);
    const type = this.typeByCode(code);
    const style = code ? (type ? typeStyle(type) : UNKNOWN_TYPE_STYLE) : '';
    const dateLabel = `${DAY_NAMES[c.dayOfWeek]}, ${c.day} ${MONTH_NAMES[this.month - 1]} ${this.year}`;
    const aria = `${emp.name}, ${dateLabel}: ${code || 'kosong'}${manual ? ' (manual override)' : ''}${hol ? `, ${hol.name}` : ''}`;
    const editing = this.editing && String(this.editing.empId) === String(emp.id) && this.editing.date === c.date;
    const cls = `cell ${code ? 'type-chip' : `is-empty k-${kind}`}${editing ? ' editing' : ''}`;
    const inner = `${esc(code)}${manual ? '<span class="tri"></span>' : ''}`;
    const attrs = `class="${cls}" style="${style}" title="${manual ? 'Manual Override' : ''}" aria-label="${esc(aria)}"`;
    const body = this.isAdmin
      ? `<button type="button" ${attrs} data-emp="${emp.id}" data-date="${c.date}" aria-haspopup="dialog" aria-expanded="${editing ? 'true' : 'false'}">${inner}</button>`
      : `<div ${attrs}>${inner}</div>`;
    const popover = editing && !this.isMobile ? this.editorHtml(emp, c, code, manual, c.idx > colCount - 7) : '';
    return `<div class="cw${c.date === today ? ' is-today' : ''}${c.first ? ' gap-l' : ''}" data-cell>${body}${popover}</div>`;
  }

  editorOptions(code) {
    return [{ code: '', label: 'Kosong', hours: 'Hapus isi sel' }, ...this.scheduleTypes].map((o, i) => ({
      key: i,
      code: o.code,
      label: o.code ? o.label : 'Kosong',
      hours: o.code ? o.hours : 'Hapus isi sel',
      style: o.code ? typeStyle(o) : '',
      current: code === o.code,
    }));
  }

  editorHtml(emp, c, code, manual, toRight) {
    const dateLabel = `${DAY_NAMES[c.dayOfWeek]}, ${c.day} ${MONTH_NAMES[this.month - 1]} ${this.year}`;
    const options = this.editorOptions(code).map(o => `
      <button type="button" class="ed-opt" data-pick="${esc(o.code)}" aria-pressed="${o.current}">
        <span class="ed-key">${o.key}</span>
        <span class="ed-chip ${o.code ? 'type-chip' : 'is-empty'}" style="${o.style}">${o.code ? esc(o.code) : '—'}</span>
        <span class="ed-text"><span class="ed-label">${esc(o.label)}</span><span class="ed-hours">${esc(o.hours)}</span></span>
        <span class="ed-check">${o.current ? '✓' : ''}</span>
      </button>`).join('');
    return `
      <div class="cell-editor${toRight ? ' to-right' : ''}" data-cell-editor role="dialog" aria-label="Ubah jadwal">
        <div class="ed-head">
          <div class="ed-head-text"><span class="ed-name">${esc(emp.name)}</span><span class="ed-date">${esc(dateLabel)}</span></div>
          ${manual ? '<span class="tag tag-neutral">Manual Override</span>' : ''}
        </div>
        ${options}
        <div class="ed-foot">Tekan 0–${this.scheduleTypes.length} untuk memilih · Del = Kosong · Esc menutup</div>
      </div>`;
  }

  renderWeekJump() {
    const nav = document.getElementById('week-jump');
    if (!nav) return;
    if (this.status !== 'ok') {
      nav.hidden = true;
      nav.innerHTML = '';
      return;
    }
    const { weeks, cols } = this.buildColumns();
    const today = todayString();
    nav.innerHTML = weeks.map((w, wi) => {
      const start = cols.find(c => c.wi === wi).idx;
      const first = w[0].day;
      const last = w[w.length - 1].day;
      return `
        <button type="button" class="wj${w.some(d => d.date === today) ? ' is-cur' : ''}" data-jump="${start}">
          <span class="wj-roman">${ROMAN[wi]}</span>
          <span class="wj-range">${first === last ? first : `${first}–${last}`}</span>
        </button>`;
    }).join('');
    nav.hidden = false;
  }

  scrollToDate(date, instant) {
    const { cols } = this.buildColumns();
    const col = cols.find(c => c.date === date);
    if (col) this.scrollToCol(col.idx, instant);
  }

  scrollToCol(idx, instant) {
    const scroller = document.getElementById('grid-scroller');
    const head = scroller && scroller.querySelector(`[data-col="${idx}"]`);
    if (!head) return;
    const left = Math.max(0, head.offsetLeft - 112 - 4);
    if (instant) scroller.scrollLeft = left;
    else scroller.scrollTo({ left, behavior: 'smooth' });
  }

  async goToday() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    if (year !== this.year || month !== this.month) await this.setPeriod(year, month);
    const today = todayString();
    if (this.isMobile) return this.scrollToDate(today, false);
    const cell = this.container.querySelector(`button.cell[data-date="${today}"]`);
    if (cell) return cell.focus();
    const head = this.container.querySelector(`.dh[data-date="${today}"]`);
    if (head) head.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  currentCode(empId, date) {
    const s = this.schedules.find(x => String(x.employee_id) === String(empId) && x.date === date);
    return s ? s.schedule_type : '';
  }

  openEditor(empId, date) {
    if (!this.isAdmin) return;
    const same = this.editing && String(this.editing.empId) === String(empId) && this.editing.date === date;
    if (same) return this.closeEditor(true);
    this.editing = { empId, date };
    if (this.isMobile) return this.openEditorSheet();
    this.renderRoster();
    const popover = this.container.querySelector('[data-cell-editor]');
    if (popover) (popover.querySelector('[aria-pressed="true"]') || popover.querySelector('.ed-opt')).focus();
  }

  openEditorSheet() {
    const { empId, date } = this.editing;
    const emp = this.employees.find(x => String(x.id) === String(empId));
    const s = this.schedules.find(x => String(x.employee_id) === String(empId) && x.date === date);
    const code = s ? s.schedule_type : '';
    const manual = !!(s && s.is_manual_override);
    const day = new Date(`${date}T00:00:00`);
    const dateLabel = `${DAY_NAMES[day.getDay()]}, ${day.getDate()} ${MONTH_NAMES[this.month - 1]} ${this.year}`;
    const options = this.editorOptions(code).map(o => `
      <button type="button" class="sheet-opt" data-pick="${esc(o.code)}" aria-pressed="${o.current}">
        <span class="ed-chip ${o.code ? 'type-chip' : 'is-empty'}" style="${o.style}">${o.code ? esc(o.code) : '—'}</span>
        <span class="ed-text"><span class="ed-label">${esc(o.label)}</span><span class="ed-hours">${esc(o.hours)}</span></span>
        <span class="ed-check">${o.current ? '✓' : ''}</span>
      </button>`).join('');
    const sheet = openSheet({
      title: 'Ubah jadwal',
      body: `
        <div class="sheet-ed-meta"><span>${esc(emp ? emp.name : '')} · ${esc(dateLabel)}</span>${manual ? '<span class="tag tag-neutral">Manual Override</span>' : ''}</div>
        <div class="sheet-opts">${options}</div>`,
      onClose: () => {
        this.editSheet = null;
        if (this.editing) {
          this.editing = null;
          this.renderRoster();
        }
      },
    });
    this.editSheet = sheet;
    sheet.el.addEventListener('click', e => {
      const pick = e.target.closest('[data-pick]');
      if (pick) this.pick(pick.dataset.pick);
    });
  }

  closeEditor(focusCell) {
    const ed = this.editing;
    if (!ed) return;
    this.editing = null;
    if (this.editSheet) {
      const sheet = this.editSheet;
      this.editSheet = null;
      sheet.close();
    }
    this.renderRoster();
    if (focusCell) {
      const cell = this.container.querySelector(`button.cell[data-emp="${ed.empId}"][data-date="${ed.date}"]`);
      if (cell) cell.focus();
    }
  }

  onKey(e) {
    if (!this.editing) return;
    const active = document.activeElement;
    if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
    if (hasOverlay() && !this.editSheet) return;
    const inside = this.container.contains(active) || (this.editSheet && this.editSheet.el.contains(active));
    if (!inside) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      return this.closeEditor(true);
    }
    if (e.key === 'Delete' || e.key === 'Backspace' || e.key === '0') {
      e.preventDefault();
      return this.pick('');
    }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= this.scheduleTypes.length) {
      e.preventDefault();
      this.pick(this.scheduleTypes[n - 1].code);
    }
  }

  async pick(newType) {
    const { empId, date } = this.editing;
    const currentType = this.currentCode(empId, date);
    this.closeEditor(true);
    if (newType === currentType) return;

    const existing = this.schedules.find(x => String(x.employee_id) === String(empId) && x.date === date);
    if (existing) {
      existing.schedule_type = newType;
      existing.is_manual_override = true;
    } else {
      this.schedules.push({ employee_id: empId, date, schedule_type: newType, is_manual_override: true });
    }
    this.renderRoster();

    try {
      await api.updateScheduleCell(empId, date, newType);
      this.loadData();
      showToast('Jadwal berhasil diupdate');
    } catch (err) {
      showToast(err.message, 'error');
      this.loadData();
    }
  }

  setGenerating(on) {
    this.container.querySelectorAll('[data-act="generate"]').forEach(btn => { btn.disabled = on; });
    this.container.querySelectorAll('[data-gen-label]').forEach(l => { l.textContent = on ? 'Memproses...' : 'Generate'; });
  }

  async generate() {
    const period = `${MONTH_NAMES[this.month - 1]} ${this.year}`;
    const ok = await confirmDialog({
      title: 'Generate jadwal',
      message: `Auto-generate jadwal untuk ${period}? Ini akan menimpa jadwal otomatis sebelumnya (override manual tetap dipertahankan).`,
      action: 'Generate',
    });
    if (!ok) return;
    this.setGenerating(true);
    try {
      await api.generateSchedules(this.year, this.month);
      showToast('Jadwal berhasil di-generate!');
      await this.loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      this.setGenerating(false);
    }
  }

  async resetMonth() {
    const period = `${MONTH_NAMES[this.month - 1]} ${this.year}`;
    const filled = this.schedules.filter(s => s.schedule_type);
    const manual = filled.filter(s => s.is_manual_override).length;
    const ok = await confirmDialog({
      title: 'Reset jadwal',
      message: `HAPUS SEMUA jadwal (termasuk jadwal manual) untuk ${period}? Tindakan ini tidak dapat dibatalkan.`,
      detail: `${filled.length} sel terisi akan dikosongkan, termasuk ${manual} manual override.`,
      action: 'Hapus semua jadwal',
      danger: true,
    });
    if (!ok) return;
    const btn = document.getElementById('btn-reset');
    if (btn) btn.disabled = true;
    try {
      await api.resetSchedules(this.year, this.month);
      showToast('Jadwal bulan ini berhasil di-reset!');
      await this.loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  exportExcel() {
    showToast('Menyiapkan file Excel...', 'info');
    import('../services/export.js').then(module => {
      module.exportToExcel(this.year, this.month, this.schedules, this.employees, this.holidays, this.patternConfig);
    }).catch(() => {
      showToast('Gagal memuat modul export', 'error');
    });
  }

  exportPdf() {
    import('../services/export.js').then(module => {
      module.exportToPDF(this.year, this.month, this.schedules, this.employees, this.holidays, this.patternConfig);
    }).catch(() => {
      showToast('Gagal memuat modul export', 'error');
    });
  }

  openActionSheet(kind) {
    const item = (act, icon, label, cls = 'h52') => `<button type="button" class="sheet-item ${cls}" data-act="${act}"><i class="ph ${icon}"></i>${label}</button>`;
    let title = '';
    let body = '';
    if (kind === 'menu') {
      title = 'Menu';
      body = `
        <div class="sheet-greet"><span class="avatar">${this.initial()}</span><span>${this.greeting()}</span></div>
        ${this.isAdmin ? `
          ${item('users', 'ph-user-gear', 'Kelola Akun', '')}
          ${item('employees', 'ph-users-three', 'Karyawan', '')}
          ${item('patterns', 'ph-sliders-horizontal', 'Pola', '')}` : ''}
        ${item('logout', 'ph-sign-out', 'Logout', 'logout')}`;
    } else if (kind === 'export') {
      title = 'Export';
      body = `${item('excel', 'ph-file-xls', 'Export Excel')}${item('pdf', 'ph-file-pdf', 'Export PDF')}`;
    } else {
      title = 'Jadwal';
      body = `
        <button type="button" class="sheet-item h56" data-act="generate"><i class="ph ph-magic-wand accent"></i><span class="two"><span data-gen-label>Generate</span><small>Override manual tetap dipertahankan</small></span></button>
        <div class="sheet-danger-h">BERBAHAYA</div>
        <button type="button" class="sheet-item h56 danger" data-act="reset"><i class="ph ph-trash"></i><span class="two"><span>Reset</span><small>Hapus semua jadwal bulan ini, termasuk manual</small></span></button>`;
    }
    const sheet = openSheet({ title, body });
    sheet.el.addEventListener('click', e => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      sheet.close();
      this.doAction(act.dataset.act);
    });
  }
}
