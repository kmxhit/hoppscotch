import axios from 'axios';

export default (url = import.meta.env.VITE_BACKEND_GQL_URL) => {
  return axios.create({
    baseURL: url,
    headers: {
      'Content-type': 'application/json',
    },
    withCredentials: true,
  });
};
