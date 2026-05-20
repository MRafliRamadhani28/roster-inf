import { api } from '../services/api.js';
import { MONTH_NAMES, DAY_NAMES } from '../utils/constants.js';
import { groupDaysByWeek } from '../utils/date-utils.js';

export class Dashboard {
  constructor(user, container) {
    this.user = user;
    this.container = container;
    
    // State
    const now = new Date();
    // Default to May 2026 as per user image for testing
    this.year = 2026;
    this.month = 5;
    
    this.employees = [];
    this.schedules = [];
    this.holidays = [];
    this.patternConfig = null;
    
    this.init();
  }

  async init() {
    this.renderSkeleton();
    await this.loadData();
    this.setupEventListeners();
  }

  renderSkeleton() {
    this.container.innerHTML = `
      <div class="top-section">
        <div class="legend-panel" id="legend-container">
          <div class="legend-title">Memuat pola...</div>
        </div>
        <div style="display: flex; gap: 1rem; align-items: center; margin-left: auto;">
          <select id="month-select" class="form-control" style="width: auto;">
            ${MONTH_NAMES.map((m, i) => `<option value="${i+1}" ${i+1 === this.month ? 'selected' : ''}>${m}</option>`).join('')}
          </select>
          <select id="year-select" class="form-control" style="width: auto;">
            ${[2024, 2025, 2026, 2027].map(y => `<option value="${y}" ${y === this.year ? 'selected' : ''}>${y}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="roster-tables-wrapper" id="roster-container">
        <div style="text-align: center; padding: 2rem;">Memuat data roster...</div>
      </div>
      <div class="notes-panel" id="notes-container" style="display: none;">
        <div class="notes-title">📝 Note:</div>
        <ul class="notes-list" id="notes-list"></ul>
      </div>
    `;
    
    document.getElementById('current-month-display').textContent = `Jadwal ${MONTH_NAMES[this.month - 1]} ${this.year}`;
  }

  async loadData() {
    try {
      // Load all necessary data in parallel
      const [empData, schedData, holData, patData] = await Promise.all([
        api.getEmployees(),
        api.getSchedules(this.year, this.month),
        api.getHolidays(this.year, this.month),
        api.getPatternConfig()
      ]);

      this.employees = empData;
      this.schedules = schedData;
      this.holidays = holData;
      this.patternConfig = patData.config;

      // Map dynamic colors to CSS variables based on pattern config
      this.applyDynamicColors();

      this.renderLegend();
      this.renderRoster();
      this.renderNotes();
      
    } catch (err) {
      window.showToast(err.message, 'error');
      this.container.innerHTML = `<div style="color: red; padding: 2rem;">Gagal memuat data: ${err.message}</div>`;
    }
  }

  applyDynamicColors() {
    if (!this.patternConfig || !this.patternConfig.scheduleTypes) return;
    
    const root = document.documentElement;
    this.patternConfig.scheduleTypes.forEach(type => {
      const varName = `--color-${type.code.toLowerCase()}`;
      root.style.setProperty(varName, type.color);
      
      // Also inject dynamic class rules if they don't exist
      if (!document.getElementById(`dynamic-style-${type.code}`)) {
        const style = document.createElement('style');
        style.id = `dynamic-style-${type.code}`;
        style.innerHTML = `.type-${type.code} { background-color: var(${varName}); color: white; }`;
        document.head.appendChild(style);
      }
    });
  }

  renderLegend() {
    const legendContainer = document.getElementById('legend-container');
    if (!this.patternConfig) return;

    const items = this.patternConfig.scheduleTypes.map(type => `
      <div class="legend-item">
        <span class="legend-color" style="background-color: var(--color-${type.code.toLowerCase()})"></span>
        <strong>${type.code}</strong> = ${type.hours !== '-' ? type.hours : type.label}
      </div>
    `).join('');

    legendContainer.innerHTML = `
      <div class="legend-title">POLA JADWAL</div>
      <div class="legend-items">${items}</div>
    `;
  }

  renderNotes() {
    const notesContainer = document.getElementById('notes-container');
    const notesList = document.getElementById('notes-list');
    
    let notesHtml = '';
    
    // Hardcoded notes from pattern hours
    if (this.patternConfig) {
      this.patternConfig.scheduleTypes.forEach(type => {
        if (type.hours !== '-') {
          notesHtml += `<li>Untuk Jadwal ${type.code}, ${type.hours}</li>`;
        }
      });
    }

    // Holiday notes
    if (this.holidays && this.holidays.length > 0) {
      // Sort by date just in case
      const sorted = [...this.holidays].sort((a, b) => new Date(a.date) - new Date(b.date));
      sorted.forEach(h => {
        const d = new Date(h.date);
        notesHtml += `<li>Tgl ${d.getDate()} ${h.name}</li>`;
      });
    }

    if (notesHtml) {
      notesList.innerHTML = notesHtml;
      notesContainer.style.display = 'block';
    } else {
      notesContainer.style.display = 'none';
    }
  }

  renderRoster() {
    const container = document.getElementById('roster-container');
    
    if (this.employees.length === 0) {
      container.innerHTML = '<div style="padding: 2rem; text-align: center;">Belum ada data karyawan. Silakan tambah karyawan terlebih dahulu.</div>';
      return;
    }

    const weeks = groupDaysByWeek(this.year, this.month);
    
    // Create a fast lookup map for schedules: scheduleMap['EMP_ID-YYYY-MM-DD'] = cell_data
    const scheduleMap = {};
    this.schedules.forEach(s => {
      scheduleMap[`${s.employee_id}-${s.date}`] = s;
    });

    // Create lookup for holidays
    const holidayMap = {};
    this.holidays.forEach(h => {
      holidayMap[h.date] = h;
    });

    const weekLabels = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    
    // Get today's date in YYYY-MM-DD
    const todayObj = new Date();
    const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;
    
    let html = '';
    
    weeks.forEach((week, weekIndex) => {
      const isCurrentWeek = week.some(day => day.date === todayStr);
      
      html += `
        <div class="week-panel ${isCurrentWeek ? 'highlight-week' : ''}">
          <div class="week-title">MINGGU ${weekLabels[weekIndex]}</div>
          <div class="table-responsive">
            <table class="roster-table">
              <thead>
                <tr>
                  <th class="col-static" rowspan="2" style="background-color: transparent; border: none; min-width: 200px;"></th>
                  ${week.map(day => {
                    let thClass = '';
                    if (holidayMap[day.date]) {
                      thClass = holidayMap[day.date].is_national_holiday ? 'th-holiday' : 'th-cuti';
                    } else if (day.isWeekend) {
                      thClass = 'th-weekend';
                    }
                    if (day.date === todayStr) thClass += ' th-today';
                    return `<th class="${thClass}">${DAY_NAMES[day.dayOfWeek]}</th>`;
                  }).join('')}
                </tr>
                <tr>
                  ${week.map(day => {
                    let thClass = '';
                    if (holidayMap[day.date]) {
                      thClass = holidayMap[day.date].is_national_holiday ? 'th-holiday' : 'th-cuti';
                    } else if (day.isWeekend) {
                      thClass = 'th-weekend';
                    }
                    if (day.date === todayStr) thClass += ' th-today';
                    return `<th class="${thClass}">${day.day}</th>`;
                  }).join('')}
                </tr>
              </thead>
              <tbody>
                ${this.employees.map(emp => `
                  <tr>
                    <td class="col-static">${emp.name}</td>
                    ${week.map(day => {
                      const schedule = scheduleMap[`${emp.id}-${day.date}`];
                      const type = schedule ? schedule.schedule_type : '';
                      const isManual = schedule ? schedule.is_manual_override : 0;
                      
                      let bgClass = 'bg-white';
                      if (type === '') {
                         if (holidayMap[day.date]) bgClass = holidayMap[day.date].is_national_holiday ? 'bg-holiday' : 'bg-cuti';
                         else if (day.isWeekend) bgClass = 'bg-weekend';
                      }
                      
                      if (day.date === todayStr) bgClass += ' td-today';

                      return `
                        <td 
                          class="${bgClass} ${type ? `type-${type}` : ''} cell-schedule" 
                          data-emp="${emp.id}" 
                          data-date="${day.date}"
                          data-current="${type}"
                          title="${isManual ? 'Manual Override' : ''}"
                        >
                          ${type}
                        </td>
                      `;
                    }).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    
    // Attach click events for editing if user is admin
    if (this.user.role === 'admin') {
      const cells = container.querySelectorAll('.cell-schedule');
      cells.forEach(cell => {
        cell.addEventListener('click', (e) => this.showCellEditor(e, cell));
      });
    }

    // Update document title month
    document.getElementById('current-month-display').textContent = `Jadwal ${MONTH_NAMES[this.month - 1]} ${this.year}`;
  }

  showCellEditor(e, cell) {
    // Remove any existing editors
    const existing = document.querySelector('.cell-editor');
    if (existing) existing.remove();

    const empId = cell.dataset.emp;
    const date = cell.dataset.date;
    const currentType = cell.dataset.current;
    
    const editor = document.createElement('div');
    editor.className = 'cell-editor';
    
    // Build options based on pattern config + empty option
    const options = [{ code: '', label: 'Kosong (Libur)' }, ...this.patternConfig.scheduleTypes];
    
    editor.innerHTML = options.map(opt => `
      <button class="editor-option" data-type="${opt.code}">
        ${opt.code ? `<span class="legend-color" style="background-color: var(--color-${opt.code.toLowerCase()})"></span>` : '<span class="legend-color" style="border: 1px dashed #ccc;"></span>'}
        ${opt.code || 'Kosong'}
        ${currentType === opt.code ? '✓' : ''}
      </button>
    `).join('');

    // Position the editor below the cell
    const rect = cell.getBoundingClientRect();
    editor.style.top = `${rect.bottom + window.scrollY}px`;
    editor.style.left = `${rect.left + window.scrollX}px`;
    
    document.body.appendChild(editor);

    // Handle option click
    const buttons = editor.querySelectorAll('.editor-option');
    buttons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const newType = btn.dataset.type;
        editor.remove();
        
        if (newType !== currentType) {
          try {
             // Optimistic update UI
             cell.dataset.current = newType;
             cell.textContent = newType;
             
             // Remove all type-* classes
             this.patternConfig.scheduleTypes.forEach(t => cell.classList.remove(`type-${t.code}`));
             
             if (newType) {
               cell.classList.add(`type-${newType}`);
             } else {
                // If empty, re-evaluate background based on day type (holiday/weekend)
                // Handled properly on full re-render, for optimistic we just clear it
                const hMap = {}; this.holidays.forEach(h=> hMap[h.date]=h);
                const isHol = hMap[date];
                const d = new Date(date).getDay();
                const isWk = d===0 || d===6;
                if(isHol) cell.className = `cell-schedule ${isHol.is_national_holiday?'bg-holiday':'bg-cuti'}`;
                else if(isWk) cell.className = `cell-schedule bg-weekend`;
                else cell.className = `cell-schedule bg-white`;
             }

             // API call
             await api.updateScheduleCell(empId, date, newType);
             
             // Reload data to ensure sync
             this.loadData();
             window.showToast('Jadwal berhasil diupdate');
          } catch (err) {
             window.showToast(err.message, 'error');
             this.loadData(); // Revert on failure
          }
        }
      });
    });

    // Close on click outside
    setTimeout(() => {
      const clickHandler = (evt) => {
        if (!editor.contains(evt.target)) {
          editor.remove();
          document.removeEventListener('click', clickHandler);
        }
      };
      document.addEventListener('click', clickHandler);
    }, 10);
  }

  setupEventListeners() {
    const monthSelect = document.getElementById('month-select');
    const yearSelect = document.getElementById('year-select');
    
    const reload = () => {
      this.month = parseInt(monthSelect.value);
      this.year = parseInt(yearSelect.value);
      this.loadData();
    };

    monthSelect.addEventListener('change', reload);
    yearSelect.addEventListener('change', reload);

    const btnGenerate = document.getElementById('btn-generate');
    if (btnGenerate) {
      btnGenerate.addEventListener('click', async () => {
        const confirmStr = `Auto-generate jadwal untuk ${MONTH_NAMES[this.month-1]} ${this.year}?\nIni akan menimpa jadwal otomatis sebelumnya (override manual tetap dipertahankan).`;
        if (confirm(confirmStr)) {
          btnGenerate.disabled = true;
          btnGenerate.textContent = 'Generating...';
          try {
            await api.generateSchedules(this.year, this.month);
            window.showToast('Jadwal berhasil di-generate!');
            await this.loadData();
          } catch (err) {
            window.showToast(err.message, 'error');
          } finally {
            btnGenerate.disabled = false;
            btnGenerate.textContent = '🔄 Generate Jadwal';
          }
        }
      });
    }

    const btnExcel = document.getElementById('btn-excel');
    if (btnExcel) {
      btnExcel.addEventListener('click', () => {
         window.showToast('Menyiapkan file Excel...', 'info');
         import('../services/export.js').then(module => {
            module.exportToExcel(this.year, this.month, this.schedules, this.employees, this.holidays, this.patternConfig);
         }).catch(err => {
            window.showToast('Gagal memuat modul export', 'error');
         });
      });
    }

    const btnPdf = document.getElementById('btn-pdf');
    if (btnPdf) {
      btnPdf.addEventListener('click', () => {
         import('../services/export.js').then(module => {
            module.exportToPDF(this.year, this.month);
         }).catch(err => {
            window.showToast('Gagal memuat modul export', 'error');
         });
      });
    }

    const btnEmployees = document.getElementById('btn-employees');
    if (btnEmployees) {
      btnEmployees.addEventListener('click', () => this.showEmployeeManager());
    }

    const btnPatterns = document.getElementById('btn-patterns');
    if (btnPatterns) {
      btnPatterns.addEventListener('click', () => this.showPatternEditor());
    }

    const btnUsers = document.getElementById('btn-users');
    if (btnUsers) {
      btnUsers.addEventListener('click', () => this.showUserManager());
    }
  }

  async showUserManager() {
    const existing = document.getElementById('user-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'user-modal';
    modal.className = 'modal-backdrop show';
    
    let usersData = [];
    try {
      usersData = await api.getUsers();
    } catch(err) {
      window.showToast('Gagal mengambil data user', 'error');
      return;
    }

    let rows = usersData.map(u => `
      <div class="form-group flex justify-between items-center" style="margin-bottom: 0.5rem; padding: 0.5rem; background: var(--bg-tertiary); border-radius: var(--radius-md);">
        <div>
          <strong>${u.display_name}</strong> (${u.username}) - <span style="text-transform: capitalize;">${u.role}</span>
        </div>
        ${u.id !== this.user.id ? `<button class="btn btn-outline btn-delete-user" data-id="${u.id}" style="color: red; padding: 0.25rem 0.5rem;">Hapus</button>` : '<span style="font-size: 0.8rem; color: var(--text-tertiary);">Akun Anda</span>'}
      </div>
    `).join('');

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header">
          <h3 class="modal-title">Kelola Akun (User Management)</h3>
          <button class="modal-close" id="close-user-modal">&times;</button>
        </div>
        <div class="modal-body">
          <div style="margin-bottom: 1.5rem; background: var(--bg-primary); padding: 1rem; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
            <h4>Buat Akun Baru</h4>
            <div class="flex" style="gap: 0.5rem; margin-top: 0.5rem;">
              <input type="text" id="new-user-username" class="form-control" placeholder="Username" />
              <input type="password" id="new-user-password" class="form-control" placeholder="Password" />
              <input type="text" id="new-user-name" class="form-control" placeholder="Nama Tampilan" />
              <select id="new-user-role" class="form-control">
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
              <button class="btn btn-primary" id="btn-add-user">Buat</button>
            </div>
          </div>
          <div>
            <h4>Daftar Akun</h4>
            <div style="margin-top: 0.5rem; max-height: 250px; overflow-y: auto;">
              ${rows || '<p>Belum ada user tambahan.</p>'}
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('close-user-modal').onclick = () => modal.remove();
    
    document.getElementById('btn-add-user').onclick = async () => {
      const username = document.getElementById('new-user-username').value;
      const password = document.getElementById('new-user-password').value;
      const displayName = document.getElementById('new-user-name').value;
      const role = document.getElementById('new-user-role').value;
      
      if (!username || !password || !displayName) {
        window.showToast('Username, password, dan nama wajib diisi', 'error');
        return;
      }

      try {
        await api.registerUser({ username, password, displayName, role });
        modal.remove();
        window.showToast('User berhasil dibuat!');
        this.showUserManager(); // Reload modal with new data
      } catch (err) {
        window.showToast(err.message, 'error');
      }
    };

    modal.querySelectorAll('.btn-delete-user').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Yakin ingin menghapus akun ini secara permanen?')) return;
        try {
          await api.deleteUser(btn.dataset.id);
          modal.remove();
          window.showToast('Akun berhasil dihapus');
          this.showUserManager(); // Reload modal
        } catch (err) {
          window.showToast(err.message, 'error');
        }
      };
    });
  }

  showEmployeeManager() {
    const existing = document.getElementById('employee-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'employee-modal';
    modal.className = 'modal-backdrop show';
    
    let rows = this.employees.map(emp => `
      <div class="form-group flex justify-between items-center" style="margin-bottom: 0.5rem; padding: 0.5rem; background: var(--bg-tertiary); border-radius: var(--radius-md);">
        <div>
          <strong>${emp.name}</strong> (Slot: ${emp.slot_position})
        </div>
        <button class="btn btn-outline btn-delete-emp" data-id="${emp.id}" style="color: red; padding: 0.25rem 0.5rem;">Hapus</button>
      </div>
    `).join('');

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">Manajemen Karyawan</h3>
          <button class="modal-close" id="close-emp-modal">&times;</button>
        </div>
        <div class="modal-body">
          <div style="margin-bottom: 1.5rem;">
            <h4>Tambah Karyawan Baru</h4>
            <div class="flex" style="gap: 0.5rem; margin-top: 0.5rem;">
              <input type="text" id="new-emp-name" class="form-control" placeholder="Nama Karyawan" />
              <button class="btn btn-primary" id="btn-add-emp">Tambah</button>
            </div>
          </div>
          <div>
            <h4>Daftar Karyawan Aktif</h4>
            <div style="margin-top: 0.5rem; max-height: 200px; overflow-y: auto;">
              ${rows || '<p>Belum ada karyawan.</p>'}
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('close-emp-modal').onclick = () => modal.remove();
    
    document.getElementById('btn-add-emp').onclick = async () => {
      const name = document.getElementById('new-emp-name').value;
      if (!name) return;
      try {
        await api.request('/employees', { method: 'POST', body: JSON.stringify({ name }) });
        modal.remove();
        window.showToast('Karyawan berhasil ditambah');
        this.loadData();
      } catch (err) {
        window.showToast(err.message, 'error');
      }
    };

    modal.querySelectorAll('.btn-delete-emp').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Yakin ingin menghapus karyawan ini?')) return;
        try {
          await api.request(`/employees/${btn.dataset.id}`, { method: 'DELETE' });
          modal.remove();
          window.showToast('Karyawan berhasil dihapus');
          this.loadData();
        } catch (err) {
          window.showToast(err.message, 'error');
        }
      };
    });
  }

  showPatternEditor() {
    const existing = document.getElementById('pattern-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'pattern-modal';
    modal.className = 'modal-backdrop show';
    
    // Just a basic JSON text editor for simplicity right now
    const jsonStr = JSON.stringify(this.patternConfig, null, 2);

    modal.innerHTML = `
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header">
          <h3 class="modal-title">Konfigurasi Pola Jadwal</h3>
          <button class="modal-close" id="close-pattern-modal">&times;</button>
        </div>
        <div class="modal-body">
          <p class="text-secondary" style="margin-bottom: 1rem; font-size: 0.875rem;">
            Edit konfigurasi pola menggunakan format JSON. Pastikan struktur scheduleTypes, workdayPattern, dan nonWorkdayPattern tidak berubah.
          </p>
          <textarea id="pattern-json-editor" class="form-control" style="height: 300px; font-family: monospace; font-size: 12px;" spellcheck="false">${jsonStr}</textarea>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" id="cancel-pattern-modal">Batal</button>
          <button class="btn btn-primary" id="save-pattern-modal">Simpan Pola</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => modal.remove();
    document.getElementById('close-pattern-modal').onclick = close;
    document.getElementById('cancel-pattern-modal').onclick = close;

    document.getElementById('save-pattern-modal').onclick = async () => {
      try {
        const val = document.getElementById('pattern-json-editor').value;
        const config = JSON.parse(val);
        await api.request('/patterns', { method: 'PUT', body: JSON.stringify({ config }) });
        modal.remove();
        window.showToast('Pola berhasil diupdate');
        this.loadData(); // reload UI with new colors/config
      } catch (err) {
        window.showToast('JSON tidak valid atau error: ' + err.message, 'error');
      }
    };
  }
}
