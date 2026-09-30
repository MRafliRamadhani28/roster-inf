import { API_BASE_URL } from '../utils/constants.js';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('token');
    this.activeRequests = 0;
  }

  showLoading() {
    this.activeRequests++;
    if (this.loaderTimer || this.loaderShown) return;
    this.loaderTimer = setTimeout(() => {
      this.loaderTimer = null;
      let loader = document.getElementById('global-loader');
      if (!loader) {
        loader = document.createElement('div');
        loader.id = 'global-loader';
        loader.setAttribute('aria-live', 'polite');
        loader.innerHTML = '<span class="spinner spinner-lg"></span><span class="loader-text">Memproses...</span>';
        document.body.appendChild(loader);
      }
      loader.style.display = 'flex';
      this.loaderShown = true;
    }, 300);
  }

  hideLoading() {
    this.activeRequests--;
    if (this.activeRequests <= 0) {
      this.activeRequests = 0;
      clearTimeout(this.loaderTimer);
      this.loaderTimer = null;
      this.loaderShown = false;
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
      
      if (response.status === 401 && this.token) {
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
