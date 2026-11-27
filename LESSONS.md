# LESSONS.md — Mistakes I must not repeat

Read this before every task. Newest lessons at the bottom of "All Lessons".
Never put passwords, API keys, or customer data in this file.

## Top Rules (repeated or high-risk — follow always)

- NEVER put the Supabase service_role key, or any secret, in front-end code or in a NEXT_PUBLIC_ variable.
- ALWAYS turn on RLS and write its policies in the same migration for every new table.
- ALWAYS run the Done Check (LESSONS-SPEC.md Section 5) before saying "done".
- NEVER rewrite 01-SPEC.md / SPEC.md. Edit in place, and only when asked.
- ALWAYS open the page under test by its exact address (openExact) in browser checks, and confirm the page before judging it (L-013, repeated).

## Starter Rules (Next.js + Supabase + Vercel)

- ALWAYS make database changes as migration files, never by editing in the Supabase dashboard only.
- ALWAYS add a new env variable in three places: .env.local, .env.example (name only, no value), and Vercel project settings.
- ALWAYS store dates and times as timestamptz (UTC) and show them in Asia/Manila time.
- ALWAYS add "use client" only to files that need browser features (clicks, state, window). Keep everything else on the server.
- ALWAYS check what a file does before changing it. NEVER change files outside the current task without asking.
- ALWAYS add new text to every app language file (no hard-coded English in screens).
- ALWAYS ask Earvin when the spec is unclear. NEVER guess a business rule.
- NEVER mark a task done because the code "looks right". Run it.

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

### L-009 · 2026-11-26 · Process · [spec]
- What happened: I edited 01-SPEC.md for build notes (v2.2, v2.3) without being asked.
- Root cause: The LESSONS-SPEC rule (spec edits only when asked or to fix a wrong fact) did not exist yet.
- Rule: NEVER edit 01-SPEC.md unless Earvin asks or a fact in it is wrong; put build notes in 02-BUILD-STATUS.md.
- Check: git diff shows no 01-SPEC.md change unless asked.

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
- Confirmed 2026-11-27: the boss's computer opens links in Internet Explorer (no page script, no modern styling). Guard added: proxy shows a plain "use Chrome or Edge" page (4 languages, Open-in-Edge button) to Internet Explorer. ALWAYS ask which browser/device when a user-only bug cannot be reproduced.

## Archive

(none yet)
