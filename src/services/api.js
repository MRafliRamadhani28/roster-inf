import { API_BASE_URL } from '../utils/constants.js';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('token');
    this.activeRequests = 0;
  }

  showLoading() {
    this.activeRequests++;
    let loader = document.getElementById('global-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'global-loader';
      loader.innerHTML = `
        <div class="loader-spinner"></div>
        <div style="margin-top: 1rem; color: white; font-weight: 500; font-family: sans-serif;">Memproses...</div>
      `;
      Object.assign(loader.style, {
        position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', zIndex: '9999',
        backdropFilter: 'blur(3px)'
      });
      const style = document.createElement('style');
      style.innerHTML = `
        .loader-spinner {
          border: 4px solid rgba(255,255,255,0.3); border-top: 4px solid white;
          border-radius: 50%; width: 40px; height: 40px;
          animation: spin 1s linear infinite;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `;
      document.head.appendChild(style);
      document.body.appendChild(loader);
    }
    loader.style.display = 'flex';
  }

  hideLoading() {
    this.activeRequests--;
    if (this.activeRequests <= 0) {
      this.activeRequests = 0;
      const loader = document.getElementById('global-loader');
      if (loader) loader.style.display = 'none';
    }
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  getToken() {
    return this.token;
  }

  logout() {
    this.setToken(null);
    localStorage.removeItem('user');
    window.location.reload();
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config = {
      ...options,
      headers,
    };

    if (!options.hideLoader) this.showLoading();

    try {
      const response = await fetch(url, config);
      
      if (response.status === 401) {
        this.logout();
        throw new Error('Sesi telah berakhir, silakan login kembali.');
      }

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Terjadi kesalahan pada server');
      }

      return data;
    } catch (err) {
      console.error(`API Error (${endpoint}):`, err);
      throw err;
    } finally {
      if (!options.hideLoader) this.hideLoading();
    }
  }

  // Auth
  login(username, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  getMe() {
    return this.request('/auth/me');
  }

  getUsers() {
    return this.request('/auth/users');
  }

  registerUser(userData) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  deleteUser(userId) {
    return this.request(`/auth/users/${userId}`, {
      method: 'DELETE',
    });
  }

  // Employees
  getEmployees() {
    return this.request('/employees');
  }

  // Schedules
  getSchedules(year, month) {
    return this.request(`/schedules?year=${year}&month=${month}`);
  }

  generateSchedules(year, month) {
    return this.request('/schedules/generate', {
      method: 'POST',
      body: JSON.stringify({ year, month }),
    });
  }

  resetSchedules(year, month) {
    return this.request(`/schedules/reset?year=${year}&month=${month}`, {
      method: 'DELETE',
    });
  }

  updateScheduleCell(employeeId, date, scheduleType) {
    return this.request(`/schedules/cell/${employeeId}/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ schedule_type: scheduleType }),
    });
  }

  // Patterns
  getPatternConfig() {
    return this.request('/patterns');
  }

  // Holidays
  getHolidays(year, month) {
    let endpoint = `/holidays?year=${year}`;
    if (month) endpoint += `&month=${month}`;
    return this.request(endpoint);
  }
}

export const api = new ApiService();
