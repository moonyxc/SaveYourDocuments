import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Json } from "./api";

export const FONT_SIZES = [14, 16, 18, 20] as const;
export type FontSize = (typeof FONT_SIZES)[number];

/** Setzt die Grundschrift (--fs). Alle Maße der Oberfläche skalieren mit. */
export function applyFontSize(px: number): void {
  const size = (FONT_SIZES as readonly number[]).includes(px) ? px : 16;
  document.documentElement.style.setProperty("--fs", `${size}px`);
}

/** Wendet die gespeicherten Anzeige-Einstellungen an, sobald sie geladen sind. */
export function useApplyDisplaySettings(): void {
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.get<Json>("/api/settings") });
  const size: number | undefined = settings.data?.font_size;
  useEffect(() => {
    if (size !== undefined) applyFontSize(size);
  }, [size]);
}
