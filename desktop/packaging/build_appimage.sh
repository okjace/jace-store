#!/usr/bin/env bash
# Build dist/JaceStore-<ver>-x86_64.AppImage
#   1. PyInstaller bundles Python + PySide6 + the app into a folder
#   2. lay out an AppDir (desktop file, icon, metadata)
#   3. appimagetool turns that into one AppImage file
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
PY="${PYTHON:-.venv/bin/python}"
APP_ID="$("$PY" -c 'import jacestore; print(jacestore.APP_ID)')"
VERSION="$("$PY" -c 'import jacestore; print(jacestore.APP_VERSION)')"
BUILD="$ROOT/build/appimage"
APPDIR="$BUILD/AppDir"
TOOL="$ROOT/build/tools/appimagetool"

"$PY" -m pip install -q pyinstaller
if [ ! -x "$TOOL" ]; then
  mkdir -p "$(dirname "$TOOL")"
  curl -sSL -o "$TOOL" https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage
  chmod +x "$TOOL"
fi

echo "==> PyInstaller"
rm -rf "$BUILD"
EXCL=()
for m in PySide6.QtWebEngineCore PySide6.QtWebEngineWidgets PySide6.QtQml PySide6.QtQuick PySide6.Qt3DCore \
         PySide6.QtMultimedia PySide6.QtPdf PySide6.QtCharts PySide6.QtDataVisualization tkinter; do
  EXCL+=(--exclude-module "$m")
done
"$PY" -m PyInstaller --noconfirm --clean --log-level WARN \
  --name jace-store --windowed \
  --distpath "$BUILD/dist" --workpath "$BUILD/work" --specpath "$BUILD" \
  --paths "$ROOT" --add-data "$ROOT/jacestore/assets:jacestore/assets" \
  "${EXCL[@]}" "$ROOT/packaging/entry.py"

# Qt >= 6.5 needs libxcb-cursor on X11 but many distros don't install it: ship it next to Qt's libs
QTLIB="$(find "$BUILD/dist/jace-store" -type d -path '*PySide6/Qt/lib' | head -1)"
XCBC="$(ldconfig -p | awk '/libxcb-cursor.so.0 /{p=$NF} END{print p}')"
if [ -n "$XCBC" ] && [ -n "$QTLIB" ]; then cp -L "$XCBC" "$QTLIB/libxcb-cursor.so.0"; else echo "warning: libxcb-cursor0 not bundled"; fi

# Libraries that must come from the user's system (they have to match its graphics drivers / config)
for lib in libstdc++.so.6 libgcc_s.so.1 libgbm.so.1 libfontconfig.so.1 libfreetype.so.6 libexpat.so.1 \
           libglib-2.0.so.0 libgio-2.0.so.0 libgobject-2.0.so.0 libgmodule-2.0.so.0 libdbus-1.so.3; do
  find "$BUILD/dist/jace-store" -name "$lib" -delete
done

echo "==> AppDir"
mkdir -p "$APPDIR/usr/bin" "$APPDIR/usr/share/applications" "$APPDIR/usr/share/metainfo" "$APPDIR/usr/share/icons/hicolor/256x256/apps"
cp -a "$BUILD/dist/jace-store" "$APPDIR/usr/bin/"
cp packaging/AppRun "$APPDIR/AppRun"
cp jacestore/assets/icon.png "$APPDIR/$APP_ID.png"
cp jacestore/assets/icon.png "$APPDIR/usr/share/icons/hicolor/256x256/apps/$APP_ID.png"
ln -sf "$APP_ID.png" "$APPDIR/.DirIcon"
cat > "$APPDIR/$APP_ID.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Jace Store
GenericName=App Store
Comment=Install apps and games from Jace Store, Flathub and your distro
Exec=jace-store %U
Icon=$APP_ID
Terminal=false
Categories=System;PackageManager;
Keywords=store;apps;install;software;flatpak;packages;
MimeType=x-scheme-handler/jacestore;
X-AppImage-Integrate=false
DESKTOP
cp "$APPDIR/$APP_ID.desktop" "$APPDIR/usr/share/applications/"
cat > "$APPDIR/usr/share/metainfo/$APP_ID.metainfo.xml" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<component type="desktop-application">
  <id>$APP_ID</id>
  <name>Jace Store</name>
  <summary>Install apps and games from Jace Store, Flathub and your distro</summary>
  <metadata_license>CC0-1.0</metadata_license>
  <launchable type="desktop-id">$APP_ID.desktop</launchable>
  <releases><release version="$VERSION"/></releases>
</component>
XML

echo "==> appimagetool"
mkdir -p dist
OUT="$ROOT/dist/JaceStore-$VERSION-x86_64.AppImage"
ARCH=x86_64 APPIMAGE_EXTRACT_AND_RUN=1 "$TOOL" --no-appstream "$APPDIR" "$OUT"
echo
echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
