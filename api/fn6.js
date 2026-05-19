import api from './axios';

export const fn6Api = {
  login(username, password) {
    return api.post('/Sup/api/token/', { username, password });
  },
  list(params = {}) {
    return api.get('/Sup/api/fn6/', { params });
  },
  getByMco(mco) {
    return api.get(`/Sup/api/fn6/by-mco/${mco}/`);
  },
  uploadMedia(mco, file, mediaType = 'image') {
    const form = new FormData();
    form.append('file', file);
    form.append('media_type', mediaType);
    return api.post(`/Sup/api/fn6/${mco}/media/`, form);
  },
  deleteMedia(mediaId) {
    return api.delete(`/Sup/api/fn6/media/${mediaId}/`);
  },
};
