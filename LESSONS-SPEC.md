# LESSONS-SPEC.md — Learn From Mistakes

> **For Claude Code.** This file tells you how to record every coding mistake as a lesson, so you do not repeat it.
> The project owner (Earvin) has no programming background. Explain things in plain English, keep it short, and give steps one at a time.

---

## 0. One-time setup (do this first)

Do these 4 steps the first time you read this file. Then tell Earvin "Lessons setup done."

1. **Create `LESSONS.md`** in the project root. Copy in the template from Section 7.
2. **Make lessons load every session:** add these lines to the top of `CLAUDE.md` (create `CLAUDE.md` if it is missing):
   ```
   @LESSONS-SPEC.md
   @LESSONS.md
   Follow LESSONS-SPEC.md. Read LESSONS.md before every task. Record every new mistake in LESSONS.md.
   ```
3. **Create the `/lesson` command:** make the file `.claude/commands/lesson.md` with this text:
   ```
   A mistake just happened. Follow LESSONS-SPEC.md Section 3:
   find the root cause, fix it, check the fix works, then add a lesson to LESSONS.md.
   Then tell me in plain English: what went wrong, what you fixed, and the new rule.
   $ARGUMENTS
   ```
4. **Do not change the build plan.** Do not edit `01-SPEC.md` / `SPEC.md` except to fix a wrong fact, and edit in place — never rewrite it.

---

## 1. The learning loop (every task)

| Step | When | What you do |
|---|---|---|
| 1. Check | Before you write code | Read `LESSONS.md`. List the 1–3 rules that apply to this task. |
| 2. Build | While coding | Follow those rules. |
| 3. Catch | Any time something fails | Stop. Do Section 3 before moving on. |
| 4. Prove | Before you say "done" | Pass the Done Check (Section 5). |
| 5. Report | End of session | Do Section 6. |

---

## 2. What counts as a mistake (record ALL of these)

- Build, type, or lint error you caused
- Test that fails
- Error in the browser, server log, Supabase, or Vercel deploy
- A fix that needed **more than one try**
- You said "done" but it did not work
- You did something different from the spec, or guessed instead of asking
- You changed or broke something Earvin did not ask you to touch
- Earvin says "wrong", "that's not it", "undo", or reports a bug
- A command failed because of a wrong path, missing package, or missing setting (env variable, API key)
- A database change (migration, table, security rule) that failed or had to be redone

**Do not record:** a typo you fixed on the first try with no effect.

---

## 3. When a mistake happens

1. **Stop.** Do not stack more changes on top of a broken state.
2. **Find the root cause** — ask "why?" until you reach the real reason, not just the error message.
   - Bad: "The page crashed."
   - Good: "I used a browser-only feature inside a server component."
3. **Check `LESSONS.md`.** Is there already a lesson for this?
   - **No** → add a new lesson (Section 4).
   - **Yes** → this is a **repeat**. Do Section 3a.
4. **Fix it.**
5. **Prove the fix works** (run it again, show the result).
6. **Write the lesson now** — not later, not at the end of the session.

### 3a. Repeated mistakes

A repeat means the rule was too weak. You must do all of these:
- Add `REPEATED xN` to the lesson.
- Rewrite the rule so it is clearer and stricter.
- **Add an automatic guard** so the mistake gets caught without anyone remembering it. Examples: a test, a lint rule, a type, a check script, a step in the Done Check.
- Move the lesson to **Top Rules** in `LESSONS.md`.
- Tell Earvin in your report.

---

## 4. Lesson format

Keep each lesson to 5 lines or fewer. Use this format exactly:

```
### L-012 · 2026-11-26 · Phase 3 · [database]
- What happened: New "orders" table returned no rows for logged-in staff.
- Root cause: Turned on row security (RLS) but wrote no read rule (policy).
- Rule: ALWAYS write select/insert/update policies in the same migration that enables RLS.
- Check: Log in as a test staff user and load the page before saying done.
```

**Tags** (pick one): `[setup]` `[database]` `[security]` `[login]` `[ui]` `[server]` `[deploy]` `[env]` `[spec]` `[testing]` `[language]` `[other]`

**Rule wording:** start with **ALWAYS** or **NEVER**. One clear action. No vague words like "be careful".

---

## 5. Done Check (before you say "done")

Do not say "done", "fixed", or "working" until all of these pass:

- [ ] `npm run build` passes with no errors
- [ ] `npm run lint` passes
- [ ] `npx tsc --noEmit` passes (no type errors)
- [ ] Tests pass (if the project has tests)
- [ ] You opened the changed page or feature and it works
- [ ] It works for each role that should use it, and is blocked for roles that should not
- [ ] No secret keys in front-end code or in files saved to GitHub
- [ ] Every rule in `LESSONS.md` that applies to this task was followed
- [ ] Any guard added in Section 3a also passes

If something cannot be checked, say so clearly. Do not pretend it passed.

---

## 6. End-of-session report to Earvin

Short, plain English, no code. Use this table:

| Mistake | Fixed? | New rule |
|---|---|---|
| Orders page empty for staff | Yes | Write access rules when making a new table |

Then do housekeeping in `LESSONS.md`:
- Merge lessons that say the same thing.
- Move any lesson seen 2+ times to **Top Rules**.
- Keep **50 or fewer** active lessons. Move old ones that no longer apply to **Archive** (do not delete).
- If no mistakes happened, say: "No new lessons this session."

---

## 7. `LESSONS.md` template

Create `LESSONS.md` with this content:

```markdown
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
```

---

## 8. How Earvin uses this

| You want to… | Type in Claude Code |
|---|---|
| Set it up the first time | `Read LESSONS-SPEC.md and do Section 0.` |
| Report a mistake you noticed | `/lesson` plus what went wrong, for example `/lesson the login page shows a blank screen` |
| See what Claude Code has learned | `Show me the Top Rules and the last 5 lessons in plain English.` |
| Clean up the lessons list | `Do the LESSONS.md housekeeping in LESSONS-SPEC.md Section 6.` |
