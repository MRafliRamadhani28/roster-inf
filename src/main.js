import '@phosphor-icons/web/regular';
import '@phosphor-icons/web/fill';
import './styles/tokens.css';
import './styles/app.css';
import { api } from './services/api.js';
import './ui/toast.js';
import { esc } from './utils/color.js';

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
      <div class="login">
        <div class="login-hero">
          <span class="login-brand"><span class="brand-logo"><i class="ph ph-calendar-dots"></i></span>Jadwal Travel Management</span>
          <div class="login-copy">
            <span class="login-h">Roster kerja bulanan tim Anda.</span>
            <span class="login-p">Masuk sebagai admin untuk mengelola jadwal, atau sebagai viewer untuk melihat dan export.</span>
          </div>
        </div>
        <div class="login-panel">
          <form id="login-form" class="login-form">
            <h2>Login Roster</h2>
            <div class="field">
              <label for="username">Username</label>
              <input type="text" id="username" class="input" required />
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input type="password" id="password" class="input" required />
            </div>
            <button type="submit" class="btn btn-primary login-submit">Login</button>
            <div id="login-error" class="login-error" role="alert" hidden></div>
          </form>
        </div>
      </div>
    `;

    const passField = document.getElementById('password');
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const userValue = document.getElementById('username').value;
      const passValue = passField.value;
      const errorDiv = document.getElementById('login-error');

      try {
        const data = await api.login(userValue, passValue);
        api.setToken(data.token);
        this.user = data.user;
        this.renderDashboard();
      } catch (err) {
        errorDiv.innerHTML = `<i class="ph-fill ph-warning-circle"></i>${esc(err.message)}`;
        errorDiv.hidden = false;
        passField.setAttribute('aria-invalid', 'true');
      }
    });
  }

  renderDashboard() {
    this.root.innerHTML = '';
    import('./pages/dashboard.js').then(module => {
      new module.Dashboard(this.user, this.root);
    });
  }
}

new App();
