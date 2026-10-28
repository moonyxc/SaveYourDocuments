import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const ICONS: Record<string, ReactNode> = {
  start: <path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  import: <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3" />,
  review: <path d="m5 12 5 5 9-10" />,
  docs: <path d="M7 3h8l4 4v14H7zM15 3v4h4" />,
  fristen: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  stats: <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />,
  export: <path d="M12 15V3m0 0L8 7m4-4 4 4M4 17v3h16v-3" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
};

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {ICONS[name] ?? null}
    </svg>
  );
}

export type Tone = "green" | "red" | "yellow" | "blue" | "purple" | "gray";

export function Badge({ tone = "gray", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge b-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Spinner({ label = "Lädt …" }: { label?: string }) {
  return (
    <span className="row muted" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </span>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

/** Fehlerkasten mit Hinweis, was zu tun ist. */
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const text = error instanceof Error ? error.message : "Etwas ist schiefgelaufen.";
  return (
    <div className="notice bad" role="alert">
      <p style={{ margin: 0 }}>{text}</p>
      {retry ? (
        <button className="btn secondary small" style={{ marginTop: ".5rem" }} onClick={retry}>
          Noch einmal versuchen
        </button>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  right,
  className = "",
  htmlFor,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
  className?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className={`field ${className}`}>
      <label htmlFor={htmlFor}>
        <span>{label}</span>
        {right}
      </label>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

// --- Dialoge -------------------------------------------------------------------------

export function Modal({
  title,
  onClose,
  children,
  wide,
  actions,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  wide?: boolean;
  actions?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, select, textarea, button");
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) onClose();
      if (e.key === "Tab" && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href]")].filter(
          (x) => !x.hasAttribute("disabled"),
        );
        if (!f.length) return;
        const a = f[0];
        const z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          z.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === z) {
          a.focus();
          e.preventDefault();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
        {actions ? <div className="actions">{actions}</div> : null}
      </div>
    </div>
  );
}

type ToastKind = "ok" | "bad";
type ToastItem = { id: number; text: string; kind: ToastKind };
type ConfirmOpts = { title: string; text?: ReactNode; confirmLabel?: string; danger?: boolean };

type Ui = {
  toast: (text: string, kind?: ToastKind) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
};
const UiContext = createContext<Ui>({ toast: () => {}, confirm: async () => false });
export const useUi = (): Ui => useContext(UiContext);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [ask, setAsk] = useState<{ o: ConfirmOpts; done: (v: boolean) => void } | null>(null);
  const seq = useRef(0);

  const toast = useCallback((text: string, kind: ToastKind = "ok") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, text, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "bad" ? 7000 : 3500);
  }, []);
  const confirm = useCallback(
    (o: ConfirmOpts) => new Promise<boolean>((done) => setAsk({ o, done })),
    [],
  );
  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);
  const close = (v: boolean) => {
    ask?.done(v);
    setAsk(null);
  };
  return (
    <UiContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === "bad" ? "bad" : ""}`}>
            {t.text}
          </div>
        ))}
      </div>
      {ask ? (
        <Modal
          title={ask.o.title}
          onClose={() => close(false)}
          actions={
            <>
              <button className="btn ghost" onClick={() => close(false)}>
                Abbrechen
              </button>
              <button className={`btn ${ask.o.danger ? "danger" : "primary"}`} onClick={() => close(true)}>
                {ask.o.confirmLabel ?? "OK"}
              </button>
            </>
          }
        >
          {ask.o.text ? <p style={{ margin: 0 }}>{ask.o.text}</p> : null}
        </Modal>
      ) : null}
    </UiContext.Provider>
  );
}

/** Kopfzeile einer Ansicht. */
export function PageHead({ title, lead, actions }: { title: string; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="row spread wrap" style={{ alignItems: "flex-start" }}>
      <div>
        <h1>{title}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
      </div>
      {actions ? <div className="row wrap">{actions}</div> : null}
    </div>
  );
}
