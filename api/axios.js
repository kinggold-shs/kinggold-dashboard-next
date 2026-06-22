import axios from 'axios';
import { getPublicApiBaseUrl } from '../lib/publicEnv';
import { applyFn6Price18kPayload, isFn6EndpointUrl } from '../lib/fn6Price18k';

const BASE_URL = getPublicApiBaseUrl();

const api = axios.create({
  baseURL: BASE_URL,
  headers: {},
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('kg_token');
  if (token) {
    config.headers.Authorization = `Token ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    try {
      const url = response?.config?.url || '';
      if (isFn6EndpointUrl(url) && response?.data) {
        applyFn6Price18kPayload(response.data);
      }
    } catch {
      // never let the transform break the response
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('kg_token');
      localStorage.removeItem('kg_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
