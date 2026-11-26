# LESSONS.md — Mistakes I must not repeat

Read this before every task. Newest lessons at the bottom of "All Lessons".
Never put passwords, API keys, or customer data in this file.

## Top Rules (repeated or high-risk — follow always)

- NEVER put the Supabase service_role key, or any secret, in front-end code or in a NEXT_PUBLIC_ variable.
- ALWAYS turn on RLS and write its policies in the same migration for every new table.
- ALWAYS run the Done Check (LESSONS-SPEC.md Section 5) before saying "done".
- NEVER rewrite 01-SPEC.md / SPEC.md. Edit in place, and only when asked.

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

(none yet)

## Archive

(none yet)
