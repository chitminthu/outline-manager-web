import axios from 'axios';
import https from 'https';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

export const outlineApi = axios.create({
  baseURL: process.env.OUTLINE_API_URL,
  httpsAgent,
});