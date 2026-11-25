# Sunny Foods Order — store app (iOS + Android)

Phase 18 of `01-SPEC.md` (Section 9a). **Status: scaffold only — not built, not tested on a phone.**
Only the **Customer portal** goes on the App Store / Google Play. Staff and Agent apps stay as installable web apps.

## How it works
- The app contains its own screens (bundled), not just the website. Capacitor says loading the live site (`server.url`) is for development only, and Apple may reject it.
- The screens are the same client components as the web portal (`src/components/portal/*`).
- They get data from `https://order.sunnyfoods.com.ph/api/portal/*` with the login token (`src/lib/portal-client.ts` adds `Authorization: Bearer …` inside the app).
- Prices, vouchers and totals are still calculated by the database. The app cannot change them.

## Accounts needed (owner: Earvin)
| Account | Cost | Notes |
|---|---|---|
| Apple Developer Program (organization) | yearly fee | Needs a **D-U-N-S number** for Sunny Foods Inc. (free from Dun & Bradstreet; can take 1–2 weeks) |
| Google Play Console (organization) | one-time fee | Identity check for Sunny Foods Inc. |
| Firebase project (free) | free | Sends push messages to Android and iOS |
| Cloud build service | free tier / paid | Builds the iPhone app without a Mac, e.g. Ionic Appflow or Codemagic |
| Live-update service | choose one | Updates screens without a store review, e.g. Capgo or Appflow Live Updates. Native changes still need a store update. |

## Build steps (once the accounts exist)
1. `cd mobile && npm install`
2. Put the same Supabase values in `mobile/.env`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_ROOT_DOMAIN`.
3. `npm run sync`. This makes the static screens in `out/` and copies them into the native projects.
4. The first time only, run `npx cap add android` and `npx cap add ios`.
5. Add the Firebase files: `google-services.json` for Android, and the APNs key in Firebase for iOS.
6. Connect the repository to the cloud build service. Upload the signing keys:
   - Android keystore
   - iOS distribution certificate and provisioning profile
7. Keep the signing keys in the company password manager, with the passwords. **Losing the Android key means you cannot update the app.**

## Native features (needed for Apple guideline 4.2)
`mobile/src/native.ts` has:
- **Push notifications**: order status and payment reminders. The phone token is saved through `POST /api/portal/push-token`.
  - Still to do: the server must send to phone tokens through Firebase (`src/lib/push.ts` sends web push only for now).
- **Camera**: payment-proof photo, sent to `POST /api/portal/proofs`.
- **Face ID / fingerprint quick login**: keeps the refresh token in the phone's secure storage.
- **Offline**: the last catalog and My Orders are saved on the phone, plus a friendly offline screen.
- **Delete my account inside the app**: My Account → Delete my account. It uses `POST /api/portal/privacy` with kind `deletion`.

## Screens to finish in Phase 18
- `mobile/app/page.tsx` shows the pattern (catalog). Add these the same way:
  - `cart/`: `CheckoutView`
  - `orders/`: `OrdersList`
  - `orders/[id]`: `OrderDetailView`. Static export needs the order id passed as a query string, not a folder.
  - `account/`: `AccountView`
  - `login/`, using the Supabase client plus biometric login
  - `offline/`
- Links in the shared components start with `/portal/...`. In the app they need an app-relative base path. Add a small `href()` helper when building.
- Languages: `mobile/i18n.ts` bundles English. Add the other 3 language folders the same way.

## Store listing (English)
- **Name:** Sunny Foods Order
- **Subtitle:** Order Sunny Foods meats and sauces
- **Description:** Sunny Foods Order lets approved restaurants, cafés, retailers and distributors order Sunny Foods steaks, core products and sauces directly. In the app you can:
  - see your own prices and stock availability
  - choose the delivery date and payment option
  - use vouchers
  - track every order from Received to Delivered
  - upload payment proof with your camera
  - download delivery receipts
  - use English, 简体中文, 繁體中文 or Tagalog
- **Category:** Business (also Food & Drink)
- **Privacy policy URL:** https://order.sunnyfoods.com.ph/privacy
- **Terms URL:** https://order.sunnyfoods.com.ph/terms
- **In-app purchases:** none. The app sells physical goods, so Apple/Google payment is not needed.

## For app reviewers
- Create a **demo customer** that is approved, has prices and has 2 sample orders, for example `review@sunnyfoods.com.ph`.
- Put its login in the review notes in App Store Connect and Play Console.
- Do not use real customer data.

## Screenshots needed (English)
Take each on a 6.7" iPhone, a 5.5" iPhone and an Android phone:
1. Catalog
2. Product details
3. Cart & checkout with a voucher
4. Order tracker
5. Upload payment proof
6. My Account

## Not tested yet
- Nothing in `/mobile` has been installed or built.
- Plugin versions must be checked when building, and push, camera, biometrics and offline must be tested on real phones.
