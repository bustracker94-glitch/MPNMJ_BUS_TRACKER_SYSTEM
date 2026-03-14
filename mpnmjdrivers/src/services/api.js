import axios from 'axios';
import { config } from '../config/env';

const api = axios.create({
  baseURL: config.backendUrl + '/api',
  timeout: 10000,
});

export const loginDriver = async (phone, password) => {
  try {
    const response = await api.post('/driver/login', { phone, password });
    return response.data;
  } catch (error) {
    throw error.response?.data?.error || 'Failed to login';
  }
};

export const updateLocation = async (data) => {
  try {
    const response = await api.post('/update-location', data);
    return response.data;
  } catch (error) {
    console.error('Failed to update location:', error.message);
    throw error;
  }
};

export default api;
