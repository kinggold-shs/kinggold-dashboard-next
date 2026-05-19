import api from './axios';

export const fn6Api = {
  login(username, password) {
    return api.post('/Sup/api/token/', { username, password });
  },

  list(params = {}) {
    return api.get('/Sup/api/fn6/dashboard/', { params });
  },

  get(mco) {
    return api.get(`/Sup/api/fn6/dashboard/${mco}/`);
  },

  stats(params = {}) {
    return api.get('/Sup/api/dashboard/stats/', { params });
  },

  goldPrices() {
    return api.get('/Sup/api/gold-price/');
  },

  listMedia(mco) {
    return api.get(`/Sup/api/fn6/dashboard/${mco}/media/`);
  },

  addMedia(mco, formData) {
    return api.post(`/Sup/api/fn6/dashboard/${mco}/media/`, formData);
  },

  deleteMedia(mco, id) {
    return api.delete(`/Sup/api/fn6/dashboard/${mco}/media/${id}/`);
  },
};
