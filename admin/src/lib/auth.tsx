import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { api, getToken, setToken } from "./api";

export type AdminRole = "admin" | "manager";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
};

type AuthState = {
  admin: AdminUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    api
      .get("/admin/auth/me")
      .then((res) => setAdmin(res.data.admin))
      .catch(() => setToken(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.post("/admin/auth/login", { email, password });
    setToken(res.data.token);
    setAdmin(res.data.admin);
  }

  function logout() {
    setToken(null);
    setAdmin(null);
  }

  return <AuthContext.Provider value={{ admin, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
