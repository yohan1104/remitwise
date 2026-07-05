"use client";

import * as React from "react";
import type { DashboardData } from "@/lib/types";

interface DashboardContextValue {
  data: DashboardData;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

const DashboardContext = React.createContext<DashboardContextValue | null>(null);

export function DashboardProvider({
  initialData,
  children,
}: {
  initialData: DashboardData;
  children: React.ReactNode;
}) {
  const [data, setData] = React.useState(initialData);
  const [refreshing, setRefreshing] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <DashboardContext.Provider value={{ data, refreshing, refresh }}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = React.useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
