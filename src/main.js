import { api } from './services/api.js';

class App {
  constructor() {
    this.user = null;
    this.root = document.getElementById('app');
    this.init();
  }

  async init() {
    const token = api.getToken();
    if (token) {
      try {
        this.user = await api.getMe();
        this.renderDashboard();
      } catch (err) {
        console.error('Invalid token, logging out');
        api.logout();
        this.renderLogin();
      }
    } else {
      this.renderLogin();
    }
  }

  renderLogin() {
    this.root.innerHTML = `
      <div style="display: flex; height: 100vh; align-items: center; justify-content: center; background-color: var(--bg-primary)">
        <div class="modal-content" style="padding: 2rem; max-width: 400px; box-shadow: var(--shadow-lg);">
          <h2 style="text-align: center; margin-bottom: 1.5rem;">Login Roster</h2>
          <form id="login-form">
            <div class="form-group">
              <label class="form-label">Username</label>
              <input type="text" id="username" class="form-control" required />
            </div>
            <div class="form-group">
              <label class="form-label">Password</label>
              <input type="password" id="password" class="form-control" required />
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 1rem;">Login</button>
            <div id="login-error" style="color: red; margin-top: 1rem; text-align: center; display: none;"></div>
          </form>
        </div>
      </div>
    `;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const userField = document.getElementById('username').value;
      const passField = document.getElementById('password').value;
      const errorDiv = document.getElementById('login-error');
      
      try {
        const data = await api.login(userField, passField);
        api.setToken(data.token);
        this.user = data.user;
        this.renderDashboard();
      } catch (err) {
        errorDiv.textContent = err.message;
        errorDiv.style.display = 'block';
      }
    });
  }

  renderDashboard() {
    // Basic shell first. The dashboard logic will be built out in the next steps.
    this.root.innerHTML = `
      <header class="app-header">
        <h1 class="app-title">🗓️ Jadwal Travel Management</h1>
        <div class="header-controls">
          <span>Halo, ${this.user.displayName} (${this.user.role})</span>
          ${this.user.role === 'admin' ? `
            <button id="btn-users" class="btn btn-header-outline">Kelola Akun</button>
          ` : ''}
          <button id="btn-logout" class="btn btn-danger">Logout</button>
        </div>
      </header>
      <div class="toolbar">
        <div>
          <h2 id="current-month-display">Bulan ...</h2>
        </div>
        <div class="toolbar-actions">
          ${this.user.role === 'admin' ? `
            <button class="btn btn-primary" id="btn-generate">🔄 Generate</button>
            <button class="btn btn-danger" id="btn-reset" style="background-color: #ef4444; color: white;">🗑️ Reset</button>
            <button class="btn btn-outline" id="btn-employees">👥 Karyawan</button>
            <button class="btn btn-outline" id="btn-patterns">⚙️ Pola</button>
          ` : ''}
          <button class="btn btn-outline" id="btn-excel">📥 Excel</button>
          <button class="btn btn-outline" id="btn-pdf">📄 PDF</button>
        </div>
      </div>
      <div class="dashboard-container fade-in" id="dashboard-content">
        Loading data...
      </div>
    `;

    document.getElementById('btn-logout').addEventListener('click', () => {
      api.logout();
    });

    // In the next task phase, we will load dashboard.js to populate the content
    import('./pages/dashboard.js').then(module => {
      new module.Dashboard(this.user, document.getElementById('dashboard-content'));
    });
  }
}

// Global toast function for UI feedback
window.showToast = function(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

// Boot app
new App();
