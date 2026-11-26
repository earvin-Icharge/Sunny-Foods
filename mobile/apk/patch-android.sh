#!/usr/bin/env bash
# Adds permissions, app icons and version to the generated Android project.
# Usage: mobile/apk/patch-android.sh <projectDir> <iconPng> <versionCode> <versionName>
set -euo pipefail
P="$1"; ICON="$2"; VCODE="$3"; VNAME="$4"
M="$P/android/app/src/main/AndroidManifest.xml"
# camera (payment proof / delivery photo), location (map pin), internet
for perm in CAMERA ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION; do
  grep -q "android.permission.$perm" "$M" || sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.$perm\" />\n</manifest>#" "$M"
done
grep -q 'android.hardware.camera' "$M" || sed -i 's#</manifest>#    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>#' "$M"
# icons (all densities)
RES="$P/android/app/src/main/res"
declare -A SIZE=( [mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192 )
declare -A FG=( [mdpi]=108 [hdpi]=162 [xhdpi]=216 [xxhdpi]=324 [xxxhdpi]=432 )
for d in "${!SIZE[@]}"; do
  mkdir -p "$RES/mipmap-$d"
  convert "$ICON" -resize "${SIZE[$d]}x${SIZE[$d]}" "$RES/mipmap-$d/ic_launcher.png"
  convert "$ICON" -resize "${SIZE[$d]}x${SIZE[$d]}" "$RES/mipmap-$d/ic_launcher_round.png"
  convert "$ICON" -resize "$(( FG[$d] * 66 / 100 ))x$(( FG[$d] * 66 / 100 ))" -background none -gravity center -extent "${FG[$d]}x${FG[$d]}" "$RES/mipmap-$d/ic_launcher_foreground.png"
done
if [ -f "$RES/values/ic_launcher_background.xml" ]; then
  sed -i 's#<color name="ic_launcher_background">.*</color>#<color name="ic_launcher_background">\#B81C21</color>#' "$RES/values/ic_launcher_background.xml"
fi
# version
G="$P/android/app/build.gradle"
sed -i "s/versionCode [0-9]*/versionCode $VCODE/; s/versionName \"[^\"]*\"/versionName \"$VNAME\"/" "$G"
echo "Patched $P (version $VNAME / $VCODE)"
