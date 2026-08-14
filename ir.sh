#!/bin/bash

echo "SaveYourDocuments - Install Requirements"
echo "========================================="
echo ""

echo "Prüfe Node.js..."
if ! command -v node &> /dev/null; then
    echo "FEHLER: Node.js ist nicht installiert!"
    echo "Bitte installiere Node.js von https://nodejs.org/"
    exit 1
fi
echo "Node.js gefunden: $(node --version)"

echo ""
echo "Prüfe npm..."
if ! command -v npm &> /dev/null; then
    echo "FEHLER: npm ist nicht verfügbar!"
    exit 1
fi
echo "npm gefunden: $(npm --version)"

echo ""
echo "Installiere Dependencies..."
npm ci

if [ $? -ne 0 ]; then
    echo ""
    echo "FEHLER: Installation fehlgeschlagen!"
    exit 1
fi

echo ""
echo "========================================="
echo "Alle Requirements erfolgreich installiert!"
echo "========================================="
