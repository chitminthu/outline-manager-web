//lib/outlineClient.js
import axios from 'axios';
import https from 'https';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Factory — creates an axios instance for any Outline API URL.
// Used by all per-server API routes.
export function createOutlineApi(baseURL) {
  return axios.create({ baseURL, httpsAgent });
}

// Backward-compatible singleton for single-server setups that still use
// process.env.OUTLINE_API_URL directly. This is kept so the codebase works
// out of the box without any extra configuration.
export const outlineApi = createOutlineApi(process.env.OUTLINE_API_URL);