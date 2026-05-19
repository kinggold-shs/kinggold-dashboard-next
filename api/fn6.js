import api from './axios';

export const fn6Api = {
  login(username, password) {
    return api.post('/Sup/api/token/', { username, password });
  },

  // Authenticated list — used by dashboard page (br=2 filter applied by caller)
  list(params = {}) {
    return api.get('/Sup/api/fn6/', { params });
  },

  // Public single-item lookup by mco — used by scan page (no auth needed)
  getByMco(mco) {
    return api.get(`/Sup/api/fn6/by-mco/${mco}/`);
  },
};
