// Schmaler Client fuer die lokale API. Der Token kommt aus dem URL-Fragment (#token=...)
// oder aus der Sitzung und wird nie in localStorage abgelegt.

const KEY = "syd.token";

export function initAuth(): void {
  const m = /token=([^&]+)/.exec(location.hash);
  if (m) {
    sessionStorage.setItem(KEY, decodeURIComponent(m[1]));
    history.replaceState(null, "", location.pathname + location.search);
  }
}

export const token = (): string => sessionStorage.getItem(KEY) ?? "";

export class ApiError extends Error {
  code: string;
  status: number;
  extra: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.message === "string" ? body.message : "Unbekannter Fehler");
    this.status = status;
    this.code = typeof body.code === "string" ? body.code : "fehler";
    this.extra = body;
  }
}

type Params = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

function query(params?: Params): string {
  if (!params) return "";
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") continue;
    q.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** URL fuer <img>, <iframe>, Downloads: der Token wandert als Query-Parameter mit. */
export function mediaUrl(path: string, params?: Params): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === null || v === undefined || v === "") continue;
    q.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  q.set("token", token());
  return `${path}?${q.toString()}`;
}

async function request<T>(method: string, path: string, body?: unknown, params?: Params): Promise<T> {
  const headers: Record<string, string> = { "X-SYD-Token": token() };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(path + query(params), { method, headers, body: payload });
  } catch {
    throw new ApiError(0, {
      code: "keine_verbindung",
      message: "Das Programm im Hintergrund antwortet nicht. Bitte starte Save Your Documents neu.",
    });
  }
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await res.json() : await res.text();
  if (!res.ok) {
    throw new ApiError(res.status, typeof data === "object" && data ? (data as Record<string, unknown>) : { message: String(data) });
  }
  return data as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

export const api = {
  get: <T = Json>(path: string, params?: Params) => request<T>("GET", path, undefined, params),
  post: <T = Json>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T = Json>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  patch: <T = Json>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  del: <T = Json>(path: string) => request<T>("DELETE", path),
  upload: <T = Json>(path: string, form: FormData) => request<T>("POST", path, form),
};

/** Fehlertext fuer Anwender; technische Details werden nie angezeigt. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return "Etwas ist schiefgelaufen. Bitte versuche es noch einmal.";
}
