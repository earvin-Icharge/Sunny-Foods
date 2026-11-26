#!/usr/bin/env bash
# Builds one signed APK. On any error, the last log lines are shown as a GitHub error note.
# Usage: mobile/apk/build-one.sh <staff|order|agent> <outFile.apk> <versionCode> <versionName>
set -uo pipefail
APP="$1"; OUT="$2"; VCODE="$3"; VNAME="$4"
ROOT="$(pwd)"; LOG="$ROOT/build-$APP.log"; P="$ROOT/build/$APP"
fail() {
  echo "Step failed: $1"
  msg=$(tail -n 60 "$LOG" | sed 's/%/%25/g' | sed ':a;N;$!ba;s/\n/%0A/g')
  echo "::error title=APK $APP failed at: $1::$msg"
  exit 1
}
run() { local name="$1"; shift; echo "== $name" | tee -a "$LOG"; "$@" >>"$LOG" 2>&1 || fail "$name"; }

run "prepare" node mobile/apk/make.mjs "$APP" "$P"
cd "$P"
run "npm install" npm install --no-audit --no-fund @capacitor/core@8 @capacitor/cli@8 @capacitor/android@8 @capacitor/app@8 @capacitor/browser@8
run "cap add android" npx cap add android
run "cap sync" npx cap sync android

# permissions, icons, version
M="$P/android/app/src/main/AndroidManifest.xml"
for perm in CAMERA ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION; do
  grep -q "android.permission.$perm" "$M" || sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.$perm\" />\n</manifest>#" "$M"
done
grep -q 'android.hardware.camera' "$M" || sed -i 's#</manifest>#    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>#' "$M"
# Google / Facebook login opens in the phone's browser, then comes back to the app
# through "<appId>://auth/callback" (the web page listens for it, see NativeBridge.tsx).
APPID=$(node -e "console.log(require('$P/capacitor.config.json').appId)")
grep -q "android:scheme=\"$APPID\"" "$M" || python3 - "$M" "$APPID" <<'PY' || fail "deep link"
import sys
m, scheme = sys.argv[1], sys.argv[2]
s = open(m).read()
f = ('        <intent-filter>\n'
     '            <action android:name="android.intent.action.VIEW" />\n'
     '            <category android:name="android.intent.category.DEFAULT" />\n'
     '            <category android:name="android.intent.category.BROWSABLE" />\n'
     f'            <data android:scheme="{scheme}" android:host="auth" />\n'
     '        </intent-filter>\n        </activity>')
s = s.replace('</activity>', f, 1)
open(m, 'w').write(s)
PY
RES="$P/android/app/src/main/res"
cp -r "$ROOT/mobile/apk/icons/$APP/"mipmap-* "$RES/" || fail "icons"
[ -f "$RES/values/ic_launcher_background.xml" ] && sed -i 's#<color name="ic_launcher_background">.*</color>#<color name="ic_launcher_background">\#B81C21</color>#' "$RES/values/ic_launcher_background.xml"
sed -i "s/versionCode [0-9]*/versionCode $VCODE/; s/versionName \"[^\"]*\"/versionName \"$VNAME\"/" "$P/android/app/build.gradle"

cd "$P/android"
run "gradle assembleRelease" ./gradlew --no-daemon --stacktrace assembleRelease

# Test-phase signing key, made fresh for each build (see mobile/apk/README.md)
BT=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
IN=$(ls "$P"/android/app/build/outputs/apk/release/*.apk | head -1)
cd "$ROOT"
run "keytool" keytool -genkeypair -keystore k.jks -storepass sunnytest -keypass sunnytest -alias sf -keyalg RSA -keysize 2048 \
  -validity 3650 -dname "CN=Sunny Foods Inc., O=Sunny Foods Inc., L=Carmona, C=PH"
run "zipalign" "$BT/zipalign" -f -p 4 "$IN" aligned.apk
run "apksigner" "$BT/apksigner" sign --ks k.jks --ks-pass pass:sunnytest --out "$OUT" aligned.apk
run "verify" "$BT/apksigner" verify "$OUT"
rm -f k.jks aligned.apk
echo "Built $OUT"
