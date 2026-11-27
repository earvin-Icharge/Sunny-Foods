# LESSONS.md — Mistakes I must not repeat

Read this before every task. Newest lessons at the bottom of "All Lessons".
Never put passwords, API keys, or customer data in this file.

## Top Rules (repeated or high-risk — follow always)

- NEVER put the Supabase service_role key, or any secret, in front-end code or in a NEXT_PUBLIC_ variable.
- ALWAYS turn on RLS and write its policies in the same migration for every new table.
- ALWAYS run the Done Check (LESSONS-SPEC.md Section 5) before saying "done".
- NEVER rewrite 01-SPEC.md / SPEC.md. Edit in place, and only when asked. Build notes go in 02-BUILD-STATUS.md (merged L-009).
- ALWAYS open the page under test by its exact address (openExact) in browser checks, and confirm the page before judging it (L-013, repeated).
- ALWAYS screenshot every changed page at 360 px before saying done (phone layouts broke 4 times in Office Hub: OH-002, OH-010, OH-011, OH-013).

## Starter Rules (Next.js + Supabase + Vercel)

- ALWAYS make database changes as migration files, never by editing in the Supabase dashboard only.
- ALWAYS add a new env variable in three places: .env.local, .env.example (name only, no value), and Vercel project settings.
- ALWAYS store dates and times as timestamptz (UTC) and show them in Asia/Manila time.
- ALWAYS add "use client" only to files that need browser features (clicks, state, window). Keep everything else on the server.
- ALWAYS check what a file does before changing it. NEVER change files outside the current task without asking.
- ALWAYS add new text to every app language file (no hard-coded English in screens).
- ALWAYS ask Earvin when the spec is unclear. NEVER guess a business rule.

## Rules from Earvin's other apps (imported 2026-11-27, trimmed)

From the pack "Earvin-App-Lessons-2026-11-28" (≈190 lessons from 15 apps). Kept only what fits Next.js + Supabase + Vercel + the Capacitor Android app. Left out: Expo/EAS/OTA, React Native, Windows laptop setup, Game Night and quiz content. Archive numbers (#) are in brackets.

### Before building
- ALWAYS search for an existing app, page or feature before making a new one. [#154]
- ALWAYS ask these in one message before the first code of a new app: phone app or website; exact phone (photo of Settings → About phone); one or several devices; logo and exact app name; push notifications; paid APIs (cost per run). [pre-flight, #151, #156, #157]
- ALWAYS map every numbered spec section to a build phase, and name any section no phase covers. [#152]
- ALWAYS search the app for a word before using it as a new screen or button name. [#189]

### Proving it works
- ALWAYS run it, show Earvin real screenshots and click the whole flow, last button included, before saying done or building an APK; code that "looks right" is not done. If it cannot be seen, say "unverified" and why. [#125, merged with the old starter rule]
- ALWAYS prove which part failed (browser, server, database, network) before changing anything. [#147]
- ALWAYS stop explaining when the same bug comes back twice; read the code, data and logs instead. [#136]
- ALWAYS query the real table before claiming something ran, saved or exists. [#71, #72]
- ALWAYS watch a new test fail on the old code before trusting it, and assert exact numbers away from limits. [#129–#134, #187]
- ALWAYS fix the test clock where the code actually reads the date, and check the test setting really arrives. [#182]

### Silent failures
- NEVER write a silent try/catch; show or log every error. Every await that blocks a screen gets a timeout and a fallback. [#120]
- ALWAYS finish the file upload and check the file exists before saving the row that points to it. [#117, #163]
- ALWAYS read back any file you create (export, backup, APK): size above 0 and it opens. [#83, #118]
- ALWAYS show a setup message naming the missing setting, never a blank screen, when an env variable is missing. [#121]
- NEVER use the browser's confirm() or alert() for real choices (they fail in the Android app); use an in-app dialog. [#119]

### Data
- ALWAYS make saves safe against double taps: disable the button while saving and use a unique key. [#67, #85]
- ALWAYS refresh the page data after a save, so changes show without logging out. [#86]
- ALWAYS give a new column a DEFAULT, fill old rows, and fix the insert path; test a row made after the migration. [#77, #78]
- ALWAYS update every check rule and every reader of a field in the same commit when its list of values changes; search for each field name. [#65, #89, #92]
- ALWAYS page past 1,000 rows when reading from Supabase (it stops at 1,000 by default). [#69]
- ALWAYS give bulk imports a result per row, so one bad row does not undo the rest. [#70]
- ALWAYS save the unit (₱, kg, pcs) with the value and use one formatter per unit. [#66, #90]
- ALWAYS check "overwrite or merge?" before re-running a script on live data. [#75]
- NEVER let a script or test act as a real user; use the marked test accounts. [#36, #73]
- ALWAYS use one shared Manila-date helper for "today" and "this week"; NEVER take the date from an ISO string. State whether the boundary day is in or out and test it. [#56, #57, #59]
- ALWAYS keep "0" and "nothing" apart: show "—" for no value and test both cases. [#79, #170]
- ALWAYS compare item counts before and after a change that filters or splits a list. [#39]

### Screens
- ALWAYS check on a phone-size screenshot that every page scrolls and bottom buttons are not hidden under the Android navigation bar; NEVER hardcode bottom heights. [#37]
- ALWAYS autosave long text fields as drafts, so typing survives leaving the page. [#40]
- NEVER call router.back() alone; give a fallback page for when there is no history. [#41]

### Android app
- ALWAYS raise the version on every APK and show the version and build date in the app. [#11, #19]
- ALWAYS sign with the same key (backed up off this computer); a new key forces an uninstall and data loss. [#12]
- ALWAYS read permissions and version from the built APK, not from the config. [#13]
- ALWAYS say for each change: "website only, the app updates by itself" or "needs a new APK". [#18]
- ALWAYS read the full build log from the first warning before retrying a failed build. [#5]
- NEVER hand-edit files a tool generates (android/ folder); change the config and re-run the sync. [#21]

### Working with Earvin
- ALWAYS give the exact link, exact menu path, and what success looks like. [#150]
- ALWAYS ask for a screenshot or photo (browser, phone model) when a bug happens only on his device. [#43, #151]
- ALWAYS say where a new password or key is saved in the same message, and tell him to store it in his password manager. [#155]
- ALWAYS keep the build status file current, so "continue" resumes cleanly. [#148, #159]

## All Lessons

### L-001 · 2026-11-25 · Phase 2 · [database]
- What happened: Order price function failed on its first run ("WITH ORDINALITY cannot be used with a column definition list").
- Root cause: Wrote Postgres syntax from memory without running the function once.
- Rule: ALWAYS run every new SQL function once in supabase/tests/smoke.sql before committing it.
- Check: ./supabase/tests/load.sh then the smoke script show no ERROR lines.

### L-002 · 2026-11-25 · Phase 5 · [database]
- What happened: Every order WITHOUT a voucher was refused (found by a builder, not by me).
- Root cause: `q -> 'voucher' is not null` is true for a JSON null; the smoke test only tried orders WITH a voucher.
- Rule: ALWAYS use jsonb_typeof(x) = 'object' to test JSON values, and ALWAYS test the "nothing entered" case too.
- Check: smoke.sql has a no-voucher order (regression line at the bottom).

### L-003 · 2026-11-25 · Phase 1 · [ui]
- What happened: First build failed: "Cannot apply unknown utility class btn".
- Root cause: Tailwind v4 needs @utility for custom classes used inside @apply (v3 habit).
- Rule: ALWAYS define shared CSS classes with @utility in globals.css (Tailwind v4).
- Check: npm run build passes.

### L-004 · 2026-11-26 · Phase 17 · [deploy]
- What happened: First Vercel build failed: Hobby plan allows only daily cron jobs.
- Root cause: Added a */5 cron without checking the Vercel plan limits.
- Rule: ALWAYS keep vercel.json crons to once a day or less while on Vercel Hobby.
- Check: Deployment state READY after push.

### L-005 · 2026-11-26 · Phase 17 · [env]
- What happened: App could not reach the database ("tenant/user not found").
- Root cause: Guessed the pooler address (aws-1) instead of checking it.
- Rule: NEVER guess connection addresses; for this project the pooler is aws-0-ap-southeast-1.pooler.supabase.com:6543.
- Check: Vercel build log shows "DB check: OK" (scripts/check-db.mjs).

### L-006 · 2026-11-26 · Phase 17 · [other]
- What happened: The health-check route was never created, but I reported it as added.
- Root cause: A long `a && b && c; d` command stopped at a failed step (local DB down) and later steps ran anyway.
- Rule: NEVER chain unrelated steps with &&/; in one command; ALWAYS confirm a new file exists (git status) before saying it is done.
- Check: git status shows the file; the route answers on the test address.

### L-007 · 2026-11-26 · Phase 17 · [database]
- What happened: Creating the test logins failed once (agent row pointed to a profile not yet created).
- Root cause: Inserted rows in the wrong order for the foreign keys.
- Rule: ALWAYS insert parent rows first (profiles before agents.profile_id), or set the link with an update afterwards.
- Check: The query returns all 9 test profiles.

### L-008 · 2026-11-26 · D7 APK · [deploy]
- What happened: The APK build failed twice on GitHub and the error could not be read from this session.
- Root cause: Used an extra setup action (setup-android) that GitHub's runner did not need; no failure report was built in.
- Rule: ALWAYS give CI jobs a step that reports the failing step as an error note; ALWAYS use the runner's preinstalled Android SDK.
- Check: Check runs for the commit show success, and the Releases page lists 3 APKs.

### L-010 · 2026-11-26 · Sign-up approval · [database]
- What happened: "Approve" on Sign-up requests failed ("linked to other records") on the test address.
- Root cause: The profile was saved inside the boss's open transaction, then the privacy consent was saved through a second connection (asSystem) that could not see the unsaved profile yet.
- Rule: NEVER save rows through asSystem that point to rows made earlier in the same runAction; do the whole job in one transaction (a security-definer SQL function when extra rights are needed).
- Check: smoke.sql runs the function; the browser test approves a request and the person then logs in.

### L-011 · 2026-11-26 · Sample data · [database]
- What happened: The sample-data script stopped on its first local run ("Cannot complete").
- Root cause: I assumed a delivered + fully paid order stays "Delivered"; the app completes it by itself.
- Rule: ALWAYS read the status rules (set_order_status / mark_delivered) before scripting order steps, and run the script on the local test database first.
- Check: The script runs with "Sample data loaded." locally before it touches the live database.

### L-012 · 2026-11-26 · Account screens test · [testing]
- What happened: My browser test could not find the "Save" button and stopped.
- Root cause: The test owner's language had been switched to Chinese; the test looked for English words.
- Rule: ALWAYS find buttons and fields in browser tests by form position, name or class, never by English text (users switch languages).
- Check: The test passes whatever language the test login uses.

### L-013 · 2026-11-26 · Logo + photos check · [testing] · REPEATED x2
- What happened: A browser check said "PASS customer catalog", but it was looking at the login page.
- Root cause: The customer login page changed (password moved to ?password=1); my test helper still used the old page and the check did not confirm the address.
- Rule: ALWAYS open the page under test by its exact address with openExact() (never "click the first matching link"), and confirm something only that page has before judging it.
- Check: Catalog check requires the /portal address and at least 8 loaded product photos.
- Repeat 2026-11-27 (staff access test): clicked the first customer link, landed on the wrong page (the check caught it). Guard added: openExact() in the browser test helper stops the test if the address differs.

### L-014 · 2026-11-27 · Boss login · [login]
- What happened: The boss's login succeeded at Supabase, but his phone went straight back to the login page (reported by Earvin with a video).
- Root cause: Password login ran in the phone's browser and depended on the page script and browser-saved cookies; his phone did not keep the login, and the page gave no message. I only ever tested on a desktop test browser.
- Rule: ALWAYS run password login on the server (Server Action), and ALWAYS show a clear message when a phone does not keep the login (proxy ?li=1 check).
- Check: Browser test logs in with the page script OFF, and "/staff?li=1" without a login shows the "did not keep the login" message.
- Confirmed 2026-11-27: the boss's computer opens links in Internet Explorer (no page script, no modern styling). Guard added: proxy shows a plain "use Chrome or Edge" page (4 languages, Open-in-Edge button) to Internet Explorer. Asking for a screenshot of his browser/phone: see the "Working with Earvin" rules.

## Lessons from Office Hub (imported 2026-11-27)

Same stack (Next.js + Supabase + Vercel + Capacitor), so these mistakes can happen here too. IDs keep the Office Hub number (OH-xxx). Office Hub L-012 was merged into OH-010 and is not copied.

### OH-001 · 2026-11-25 · Go-live · [server]
- What happened: Reminders and app emails were never sent after go-live.
- Root cause: The sign-in gate redirected the database's /api/cron calls to the login page.
- Rule: ALWAYS add every route called without a user (cron, webhooks, health check, /.well-known, downloads) to the public paths in src/proxy.ts.
- Check: Call the route without cookies; it must answer itself (JSON/403), not show the login page.

### OH-002 · 2026-11-25 · Phone UI · [ui]
- What happened: On phones most pages could not be reached; the top bar grew huge on short pages; the ☰ sheet sat under the bottom bar.
- Root cause: No full menu on phones; wrapping flex rows stretch to min-h-screen; an overlay inside the sticky header was trapped in its layer.
- Rule: ALWAYS give phones a ☰ menu to every page, use content-start on wrapping layouts, and portal full-screen overlays to document.body.
- Check: At 320 and 360 px, screenshot short pages and tap every ☰ item.

### OH-003 · 2026-11-26 · Phone UI · [ui]
- What happened: React error #418 (hydration) on a profile page.
- Root cause: Read navigator (browser-only) while rendering, so the server and the phone rendered different text.
- Rule: NEVER read window/navigator during render; read them in useEffect and keep the result in state.
- Check: Open the page and confirm no page errors in the browser console.

### OH-004 · 2026-11-26 · Android app · [deploy]
- What happened: Office Hub app 1.0 opened Firefox; app 2.0 could drop sign-in cookies.
- Root cause: 1.0 handed the page to a browser (Trusted Web Activity); 2.0 used Capacitor server.url, whose local relay loses Set-Cookie on redirects.
- Rule: NEVER use a browser hand-off, Capacitor server.url or allowNavigation for the live site; load it directly in the WebView (Office Hub mobile/README.md shows how). Sunny's APKs still use server.url (mobile/apk/make.mjs): check with Earvin before go-live.
- Check: Log in inside the built APK, close and reopen it: still logged in.

### OH-005 · 2026-11-26 · Android app · [deploy]
- What happened: Phones kept reinstalling the old app.
- Root cause: Every release had the same file name; phones keep app.apk, app(1).apk… and the oldest was opened.
- Rule: ALWAYS put the version in the APK file name (e.g. SunnyFoods-Staff-0.1.N.apk) and show the version on the download page.
- Check: Download link, file name and versionName all match.

### OH-006 · 2026-11-26 · Android app · [login]
- What happened: Fingerprint set-up in the app always said "Cancelled".
- Root cause: Browser passkeys are unreliable inside an Android WebView, and every error was shown as "Cancelled".
- Rule: ALWAYS use the phone's own fingerprint prompt in the app (not browser passkeys), and NEVER show one message for every kind of failure.
- Check: Set up, wrong fingerprint refused, right one unlocks, on a real phone.

### OH-007 · 2026-11-26 · Testing · [testing]
- What happened: A browser test failed although the app was right.
- Root cause: [role="alert"] also matches Next.js's empty route announcer, and fixed pauses raced the server.
- Rule: ALWAYS target the app's own element (p[role="alert"]) and wait for the result, never a fixed pause.
- Check: Run the test twice; both runs must pass.

### OH-008 · 2026-11-25 · Database · [database]
- What happened: Several SQL functions failed when first applied.
- Root cause: Set-returning functions inside CASE; `text[] || 'x'` read as an array; a security_invoker view could not read hidden columns.
- Rule: ALWAYS use `union all … where` instead of CASE around set-returning functions, array_append for one item, and a definer security_barrier view with an explicit access filter for masked data.
- Check: Apply the migration, then call each function as a test user (smoke.sql).

### OH-009 · 2026-11-25 · Security · [security]
- What happened: The server trusted a photo path sent by the phone.
- Root cause: The server did not check the file really existed in storage.
- Rule: NEVER trust a file path from the browser; check it in storage.objects (owner and folder) on the server.
- Check: Try a fake path as a test user; it must be refused.

### OH-010 · 2026-11-26 · Settings screens · [ui]
- What happened: Times showed "08:00 AN" (cut off), a dropdown ran past its card, long names were cut in phone dropdowns; a text-fit scan alone missed some.
- Root cause: Time boxes too narrow for 16 px phone text; field rows with no wrap; long option text in a native dropdown on a 360 px screen.
- Rule: ALWAYS give time boxes at least 9.5rem, let field rows wrap, and NEVER put long text in a phone dropdown (use wrapping choice buttons).
- Check: Look at 360 px screenshots of every changed page, including open Edit sections.

### OH-011 · 2026-11-26 · Settings screens · [ui]
- What happened: An empty gap appeared under every settings card title.
- Root cause: Hidden inputs were wrapped in <span>s inside a flex column with gap, so each empty span added a gap.
- Rule: ALWAYS put hidden inputs directly in the form (or a Fragment), NEVER inside an element in a gap layout.
- Check: Screenshot the form and look for blank space under the title.

### OH-013 · 2026-11-26 · Calendar · [ui]
- What happened: On phones a new calendar grid was invisible (zero height).
- Root cause: flex-[3_1_0] (basis 0) meant for the side-by-side computer layout also applied in the stacked phone column.
- Rule: ALWAYS put flex sizes for side-by-side layouts behind the same breakpoint as the row (e.g. min-[1100px]:flex-[3_1_0]).
- Check: Screenshot the page at 360 px and confirm every section has height.

### OH-014 · 2026-11-26 · Sign-in links · [login]
- What happened: One-time sign-in links said "expired or already used" in Chrome.
- Root cause: The link signed in on a plain visit (GET); Chrome and chat apps load links in advance, which used up the link first.
- Rule: NEVER use up a one-time token on a GET; show a page with a Continue button and sign in on the POST.
- Check: Open the link twice with a plain request, then tap Continue: it must still sign in.

## Archive

### L-009 · 2026-11-26 · Process · [spec]
- What happened: I edited 01-SPEC.md for build notes (v2.2, v2.3) without being asked.
- Root cause: The LESSONS-SPEC rule (spec edits only when asked or to fix a wrong fact) did not exist yet.
- Rule: NEVER edit 01-SPEC.md unless Earvin asks or a fact in it is wrong; put build notes in 02-BUILD-STATUS.md.
- Check: git diff shows no 01-SPEC.md change unless asked.
- Archived 2026-11-27: merged into Top Rule 4 (same rule).
