/* ============================================================
   api.js — Axios-like fetch wrapper with JWT interceptor
   ============================================================ */

import { API_BASE } from './config.js';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('th_token') || null;
  }

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('th_token', token);
    else localStorage.removeItem('th_token');
  }

  async request(method, path, { body, params, isFormData } = {}) {
    let url = `${API_BASE}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) url += `?${qs}`;
    }

    const headers = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const opts = { method, headers };
    if (body) {
      opts.body = isFormData ? body : JSON.stringify(body);
    }

    const res = await fetch(url, opts);
    const data = res.headers.get('content-type')?.includes('json')
      ? await res.json()
      : await res.text();

    if (!res.ok) {
      const err = new Error(data?.detail || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  get(path, params)       { return this.request('GET', path, { params }); }
  post(path, body)        { return this.request('POST', path, { body }); }
  put(path, body)         { return this.request('PUT', path, { body }); }
  patch(path, body)       { return this.request('PATCH', path, { body }); }
  delete(path)            { return this.request('DELETE', path); }
  upload(path, formData)  { return this.request('POST', path, { body: formData, isFormData: true }); }
}

const api = new ApiClient();
export default api;
