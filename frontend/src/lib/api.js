import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({
  baseURL: API,
  withCredentials: true,
  xsrfCookieName: "csrftoken",
  xsrfHeaderName: "X-CSRFToken",
});

// Refresh-on-401 interceptor
let refreshing = null;
client.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      !original._retry &&
      !original.url?.includes("/auth/login") &&
      !original.url?.includes("/auth/refresh") &&
      !original.url?.includes("/auth/me")
    ) {
      original._retry = true;
      try {
        if (!refreshing) refreshing = client.post("/auth/refresh/");
        await refreshing;
        refreshing = null;
        return client(original);
      } catch (e) {
        refreshing = null;
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export default client;

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((e) => (e?.msg ?? JSON.stringify(e))).join(" ");
  if (typeof detail === "object") {
    // DRF error dict
    const parts = [];
    for (const [k, v] of Object.entries(detail)) {
      if (Array.isArray(v)) parts.push(`${k}: ${v.join(", ")}`);
      else parts.push(`${k}: ${v}`);
    }
    return parts.join(" | ") || JSON.stringify(detail);
  }
  return String(detail);
}
