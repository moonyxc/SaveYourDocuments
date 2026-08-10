#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

menu() {
  echo "============================================"
  echo "  Save Your Documents - Build Menu"
  echo "============================================"
  echo "  1) Install requirements (npm install)"
  echo "  2) Clean (dist, release, out)"
  echo "  3) Build app (TypeScript)"
  echo "  4) Package app (electron-builder)"
  echo "  5) All: install + clean + build + package"
  echo "  6) Start app (dev)"
  echo "  0) Exit"
  echo "============================================"
  read -rp "Auswahl: " choice
  case "$choice" in
    1) do_install ;;
    2) do_clean ;;
    3) do_build ;;
    4) do_package ;;
    5) do_install; do_clean; do_build; do_package ;;
    6) npm start ;;
    0) exit 0 ;;
    *) echo "Ungueltige Auswahl." ;;
  esac
  menu
}

do_install() {
  echo "[build] Installiere Abhaengigkeiten..."
  npm install
}

do_clean() {
  echo "[build] Raeume auf..."
  npm run clean
}

do_build() {
  echo "[build] Baue App..."
  npm run build
}

do_package() {
  echo "[build] Paketiere App..."
  npm run dist
}

menu
