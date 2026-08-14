#!/bin/bash

echo "SaveYourDocuments - Build Script"
echo "================================"
echo ""

echo "Installing dependencies..."
npm ci
if [ $? -ne 0 ]; then
    echo "FEHLER: npm ci fehlgeschlagen!"
    exit 1
fi

echo ""
echo "Building application..."
npm run build
if [ $? -ne 0 ]; then
    echo "FEHLER: Build fehlgeschlagen!"
    exit 1
fi

echo ""
echo "Building Electron app..."
npm run electron:build
if [ $? -ne 0 ]; then
    echo "FEHLER: Electron-Build fehlgeschlagen!"
    exit 1
fi

echo ""
echo "================================"
echo "Build erfolgreich abgeschlossen!"
echo "================================"
