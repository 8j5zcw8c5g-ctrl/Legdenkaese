#!/bin/bash
# Richtet das von Capacitor erzeugte iOS-Projekt ein (läuft bei Codemagic auf einem Mac).
set -e
APP=ios/App/App
PLIST="$APP/Info.plist"
PBX=ios/App/App.xcodeproj/project.pbxproj
VERSION="${APP_VERSION:-1.8.0}"
BUILD="${BUILD_NUMBER:-1}"

# --- Texte für die Erlaubnis-Abfragen (Deutsch) ---
plutil -replace NSMicrophoneUsageDescription -string "Damit du in Anrufen mit den Figuren reden und Sprachnachrichten aufnehmen kannst." "$PLIST"
plutil -replace NSSpeechRecognitionUsageDescription -string "Damit deine Sprache im Anruf in Text umgewandelt wird und die Figuren dich verstehen." "$PLIST"
plutil -replace NSCameraUsageDescription -string "Damit du im Chat ein Foto aufnehmen und verschicken kannst." "$PLIST"
plutil -replace NSPhotoLibraryUsageDescription -string "Damit du im Chat ein Foto aus deiner Mediathek verschicken kannst." "$PLIST"

# --- App-Name, Sprache, Verschlüsselung (nur HTTPS → keine Exportpapiere), Hochformat, helles Design ---
plutil -replace CFBundleDisplayName -string "Leg den Käse" "$PLIST"
plutil -replace CFBundleDevelopmentRegion -string "de" "$PLIST"
plutil -replace ITSAppUsesNonExemptEncryption -bool NO "$PLIST"
plutil -replace UIUserInterfaceStyle -string "Light" "$PLIST"
plutil -replace UISupportedInterfaceOrientations -json '["UIInterfaceOrientationPortrait"]' "$PLIST"
plutil -remove "UISupportedInterfaceOrientations~ipad" "$PLIST" 2>/dev/null || true

# --- Version und Build-Nummer (Codemagic zählt BUILD_NUMBER automatisch hoch) ---
plutil -replace CFBundleShortVersionString -string "$VERSION" "$PLIST"
plutil -replace CFBundleVersion -string "$BUILD" "$PLIST"
sed -i '' "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $VERSION;/g" "$PBX"
sed -i '' "s/CURRENT_PROJECT_VERSION = [^;]*;/CURRENT_PROJECT_VERSION = $BUILD;/g" "$PBX"

# --- Nur iPhone (spart iPad-Screenshots im App Store) ---
sed -i '' 's/TARGETED_DEVICE_FAMILY = "1,2";/TARGETED_DEVICE_FAMILY = 1;/g' "$PBX"

# --- App-Icon (1024×1024, Xcode erzeugt alle Größen) ---
ICON="$APP/Assets.xcassets/AppIcon.appiconset"
mkdir -p "$ICON"
rm -f "$ICON"/*.png
cp icon-1024.png "$ICON/AppIcon-1024.png"
cat > "$ICON/Contents.json" <<'JSON'
{
  "images" : [
    { "filename" : "AppIcon-1024.png", "idiom" : "universal", "platform" : "ios", "size" : "1024x1024" }
  ],
  "info" : { "author" : "xcode", "version" : 1 }
}
JSON

# --- Startbildschirm ---
SPL="$APP/Assets.xcassets/Splash.imageset"
mkdir -p "$SPL"
rm -f "$SPL"/*.png
cp splash-2732.png "$SPL/splash-2732x2732.png"
cp splash-2732.png "$SPL/splash-2732x2732-1.png"
cp splash-2732.png "$SPL/splash-2732x2732-2.png"
cat > "$SPL/Contents.json" <<'JSON'
{
  "images" : [
    { "idiom" : "universal", "filename" : "splash-2732x2732-2.png", "scale" : "1x" },
    { "idiom" : "universal", "filename" : "splash-2732x2732-1.png", "scale" : "2x" },
    { "idiom" : "universal", "filename" : "splash-2732x2732.png", "scale" : "3x" }
  ],
  "info" : { "version" : 1, "author" : "xcode" }
}
JSON

echo "✅ iOS-Projekt eingerichtet: Leg den Käse $VERSION (Build $BUILD)"
