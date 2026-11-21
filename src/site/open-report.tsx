import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { reportHref } from "./address-api";

/** Opens a report. The route tree supplies the router version; tests and a bare render fall back to a plain page load. */
export type OpenReport = (pid: string, unit: string | null) => void;

const OpenReportContext = createContext<OpenReport>((pid, unit) => {
  window.location.assign(reportHref(pid, unit));
});

export const OpenReportProvider = OpenReportContext.Provider;
export const useOpenReport = () => useContext(OpenReportContext);

/** Mount inside the router (the root route does). Search results and samples then navigate without a page load. */
export function RouterOpenReport({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const open = useCallback<OpenReport>(
    (pid, unit) => {
      void navigate({ to: "/report/$gnafPid", params: { gnafPid: pid }, search: unit ? { unit } : {} });
    },
    [navigate],
  );
  return <OpenReportContext.Provider value={open}>{children}</OpenReportContext.Provider>;
}
