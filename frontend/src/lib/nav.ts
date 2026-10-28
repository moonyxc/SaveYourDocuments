import { createContext, useContext } from "react";

export type View = "start" | "import" | "review" | "docs" | "fristen" | "stats" | "export" | "settings";

export type NavParams = {
  /** Suchtext fuer "docs" */
  q?: string;
  /** Dokument-ID: "docs" oeffnet die Detailansicht, "review" springt zu diesem Dokument */
  doc?: number;
  /** Filter fuer "docs", z. B. nur Archiv */
  archived?: "nein" | "nur" | "ja";
  /** Bereich in "settings" */
  tab?: string;
};

export type Nav = {
  view: View;
  params: NavParams;
  go: (view: View, params?: NavParams) => void;
};

export const NavContext = createContext<Nav>({ view: "start", params: {}, go: () => {} });
export const useNav = (): Nav => useContext(NavContext);
