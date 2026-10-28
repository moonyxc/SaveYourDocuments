import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { token } from "./api";

export type SydEvent = { type: string; document_id?: number; [k: string]: unknown };
type Listener = (e: SydEvent) => void;

const listeners = new Set<Listener>();

/** Abonniert Ereignisse des Hintergrunddienstes (z. B. "incoming.request"). */
export function useEvent(fn: Listener): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const l: Listener = (e) => ref.current(e);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
}

/** Haelt eine WebSocket-Verbindung offen und aktualisiert danach alle aktiven Abfragen. */
export function useLiveEvents(enabled: boolean, onConnection?: (up: boolean) => void): void {
  const qc = useQueryClient();
  const cb = useRef(onConnection);
  cb.current = onConnection;
  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let timer: number | undefined;
    let flush: number | undefined;
    let closed = false;
    let delay = 500;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/api/events?token=${encodeURIComponent(token())}`);
      ws.onopen = () => {
        delay = 500;
        cb.current?.(true);
      };
      ws.onmessage = (m) => {
        let e: SydEvent;
        try {
          e = JSON.parse(m.data);
        } catch {
          return;
        }
        listeners.forEach((l) => l(e));
        if (e.type === "hello") return;
        window.clearTimeout(flush);
        flush = window.setTimeout(() => void qc.invalidateQueries(), 250);
      };
      ws.onclose = () => {
        cb.current?.(false);
        if (closed) return;
        timer = window.setTimeout(connect, delay);
        delay = Math.min(delay * 2, 10000);
      };
    };
    connect();
    return () => {
      closed = true;
      window.clearTimeout(timer);
      window.clearTimeout(flush);
      ws?.close();
    };
  }, [enabled, qc]);
}
