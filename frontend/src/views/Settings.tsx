import { useRef, type KeyboardEvent } from "react";
import { ErrorBox, PageHead, Spinner } from "../components/ui";
import { useNav } from "../lib/nav";
import { useSettings } from "../components/settings/shared";
import { DisplayTab } from "../components/settings/DisplayTab";
import { ReceiveTab } from "../components/settings/ReceiveTab";
import { SecurityTab } from "../components/settings/SecurityTab";
import { BackupTab } from "../components/settings/BackupTab";
import { DetectionTab } from "../components/settings/DetectionTab";
import { LogTab } from "../components/settings/LogTab";
import { DevTab } from "../components/settings/DevTab";
import { AboutTab } from "../components/settings/AboutTab";

const TABS = [
  { id: "anzeige", label: "Anzeige" },
  { id: "empfang", label: "Empfang vom Handy" },
  { id: "sicherheit", label: "Sicherheit" },
  { id: "sicherung", label: "Sicherung und Speicher" },
  { id: "erkennung", label: "Erkennung" },
  { id: "protokoll", label: "Protokoll" },
  { id: "entwickler", label: "Entwicklermodus" },
  { id: "ueber", label: "Über das Programm" },
] as const;

export default function Settings() {
  const { params, go } = useNav();
  const settings = useSettings();
  const nav = useRef<HTMLElement>(null);
  const tab = TABS.find((t) => t.id === params.tab)?.id ?? "anzeige";

  const onKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TABS[(i + step + TABS.length) % TABS.length];
    go("settings", { tab: next.id });
    requestAnimationFrame(() => nav.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus());
  };

  return (
    <>
      <PageHead title="Einstellungen" lead="Änderungen werden sofort gespeichert." />
      <div className="st">
        <nav className="st-nav" aria-label="Bereiche der Einstellungen" ref={nav} onKeyDown={onKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              data-tab={t.id}
              aria-current={t.id === tab ? "page" : undefined}
              onClick={() => go("settings", { tab: t.id })}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="st-body">
          {settings.isPending ? (
            <Spinner />
          ) : settings.isError ? (
            <ErrorBox error={settings.error} retry={() => void settings.refetch()} />
          ) : tab === "anzeige" ? (
            <DisplayTab settings={settings.data} />
          ) : tab === "empfang" ? (
            <ReceiveTab settings={settings.data} />
          ) : tab === "sicherheit" ? (
            <SecurityTab />
          ) : tab === "sicherung" ? (
            <BackupTab />
          ) : tab === "erkennung" ? (
            <DetectionTab settings={settings.data} />
          ) : tab === "protokoll" ? (
            <LogTab />
          ) : tab === "entwickler" ? (
            <DevTab />
          ) : (
            <AboutTab />
          )}
        </div>
      </div>
    </>
  );
}
