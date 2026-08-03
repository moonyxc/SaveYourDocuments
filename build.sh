#!/usr/bin/env bash
set -euo pipefail

echo "╔══════════════════════════════════╗"
echo "║   SaveYourData Build Script    ║"
echo "╠══════════════════════════════════╣"
echo "║ [1] Requirements installieren   ║"
echo "║     → pnpm install              ║"
echo "║     → Prüft Node.js 20+         ║"
echo "║ [2] App starten (dev mode)      ║"
echo "║     → pnpm dev                  ║"
echo "║ [3] App bauen                   ║"
echo "║     → pnpm build                ║"
echo "║     → electron-builder          ║"
echo "║ [4] Beides (1 + 3)              ║"
echo "║ [5] Beenden                     ║"
echo "╚══════════════════════════════════╝"
echo ""

read -rp "Auswahl (1-5): " choice

install_deps() {
  echo ""
  echo "Prüfe Node.js Version..."
  if ! command -v node &>/dev/null; then
    echo "FEHLER: Node.js ist nicht installiert."
    exit 1
  fi
  node_version=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$node_version" -lt 20 ]; then
    echo "FEHLER: Node.js 20+ ist erforderlich. Aktuelle Version: $(node -v)"
    exit 1
  fi
  echo "Node.js Version OK."
  echo ""
  echo "Installiere Abhängigkeiten..."
  pnpm install
  echo "Abhängigkeiten erfolgreich installiert."
}

start_dev() {
  echo ""
  echo "Starte App im Dev-Modus..."
  pnpm dev
}

build_app() {
  echo ""
  echo "Baue Anwendung..."
  pnpm build:all
  echo "Build erfolgreich."
  echo ""
  echo "Erstelle Installer mit electron-builder..."
  pnpm dist
  echo "Installer erfolgreich erstellt."
}

case "$choice" in
  1)
    install_deps
    ;;
  2)
    start_dev
    ;;
  3)
    build_app
    ;;
  4)
    install_deps
    build_app
    ;;
  5)
    echo "Beenden."
    exit 0
    ;;
  *)
    echo "Ungültige Auswahl."
    exit 1
    ;;
esac

echo ""