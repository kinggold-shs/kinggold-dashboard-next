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

  create(data) {
    return api.post('/Sup/api/fn6/dashboard/', data);
  },

  update(mco, data) {
    return api.patch(`/Sup/api/fn6/dashboard/${mco}/`, data);
  },

  delete(mco) {
    return api.delete(`/Sup/api/fn6/dashboard/${mco}/`);
  },

  stats() {
    return api.get('/Sup/api/dashboard/stats/');
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
