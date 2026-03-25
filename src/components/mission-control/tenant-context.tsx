"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

const STORAGE_KEY = "arkon-active-tenant";

interface TenantContextValue {
  /** null = "All Tenants" (owner view), string = specific tenant id */
  activeTenant: string | null;
  setActiveTenant: (id: string | null) => void;
}

const TenantContext = createContext<TenantContextValue>({
  activeTenant: null,
  setActiveTenant: () => {},
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const [activeTenant, setActiveTenantRaw] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });

  const setActiveTenant = useCallback((id: string | null) => {
    setActiveTenantRaw(id);
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEY, id);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Silent
    }
  }, []);

  return (
    <TenantContext.Provider value={{ activeTenant, setActiveTenant }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenantFilter() {
  return useContext(TenantContext);
}
