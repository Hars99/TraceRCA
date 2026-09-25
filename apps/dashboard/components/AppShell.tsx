import type { ReactNode } from "react";
import { Header } from "./Header";

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="app-shell"><Header /><main>{children}</main></div>;
}
