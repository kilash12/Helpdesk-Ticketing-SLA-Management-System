import { createContext, useContext, useEffect, useState, useCallback } from "react";
import client, { formatApiError } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);       // user object when logged in
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState(null);

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await client.get("/auth/me/");
      setUser(data);
    } catch (e) {
      setUser(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = async (email, password) => {
    setError(null);
    try {
      const { data } = await client.post("/auth/login/", { email, password });
      setUser(data);
      return data;
    } catch (e) {
      const msg = formatApiError(e.response?.data?.detail || e.response?.data);
      setError(msg);
      throw new Error(msg);
    }
  };

  const register = async (payload) => {
    setError(null);
    try {
      const { data } = await client.post("/auth/register/", payload);
      setUser(data);
      return data;
    } catch (e) {
      const msg = formatApiError(e.response?.data);
      setError(msg);
      throw new Error(msg);
    }
  };

  const logout = async () => {
    try { await client.post("/auth/logout/"); } catch (e) {}
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, checking, error, login, register, logout, refreshMe: fetchMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
