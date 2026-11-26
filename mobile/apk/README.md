# Android apps (APK)

Three apps, built automatically by GitHub (`.github/workflows/android-apk.yml`) whenever files in `mobile/apk/` change:

| App | Opens | Package |
|---|---|---|
| Sunny Foods Staff | https://app.sunnyfoods.com.ph/staff | ph.com.sunnyfoods.staff |
| Sunny Foods Order | https://order.sunnyfoods.com.ph/portal | ph.com.sunnyfoods.order |
| Sunny Foods Agent | https://agent.sunnyfoods.com.ph/agent | ph.com.sunnyfoods.agent |

Download: https://github.com/earvin-Icharge/Sunny-Foods/releases/tag/android-latest

## How it works
- Each app opens the live Sunny Foods address, so screen changes arrive instantly (no reinstall).
- No internet → a friendly offline screen with "Try again".
- Camera (payment proof, delivery photo) and location (map pin) work inside the app.

## Install on a phone
1. Open the download link on the Android phone, tap the APK.
2. Allow "Install unknown apps" for the browser when asked.
3. Open the app and log in.

## Before go-live (to do)
- **Permanent signing key**: test builds use a new key each time, so a newer test APK may need the old app removed first. For go-live, create one release key and store it as GitHub secrets `ANDROID_KEYSTORE_BASE64` + `ANDROID_KEYSTORE_PASSWORD` (then the workflow signs every build with it).
- **Google Play**: the customer app can be uploaded to Google Play (needs the Google Play account, D6). Play requires the bundled build in `/mobile` (Spec 9a) or a Trusted Web Activity.
- **Phone push alerts** inside the apps need Firebase (Phase 18).
