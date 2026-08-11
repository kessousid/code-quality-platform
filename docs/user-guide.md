# User Guide: Code Quality & Security Assessment Platform

This is a practical, day-to-day guide for developers _using_ this
platform — not the architecture/decision docs. If you want the "why
things were built this way," see `docs/adr/`. This is the "how do I
actually use it" doc.

## What this actually is

Two independent modules, both scoped to a repo you register:

1. **Code Quality & Security** — runs static analysis tools (Semgrep,
   ESLint, jscpd, gitleaks, OSV-Scanner, madge) against a repo and
   correlates the findings into one report.
2. **Unit Testing** — two flows: a **coverage gate** that checks whether
   you tested your own changes (primary), and **test generation** that
   writes tests for you (secondary, optional).

**The most important thing to understand up front**: this platform never
talks to GitHub/GitLab. It only ever looks at a **local folder on the
machine running the worker** that you've already `git clone`d yourself.
"Register a repo" means "point this tool at a folder on disk" — nothing
gets cloned, fetched, or pushed by this platform. You still `git push`
yourself, as normal.

## First time here? You need your own worker running

This tool has no server-side copy of anyone's code. It only ever reads
files on whichever machine happens to be running a **worker** process for
that repo — the web app and API are hosted centrally, but they cannot see
your laptop's disk at all. If you skip this step, every button that
touches your files (Browse…, running a scan, generating tests, checking
coverage) will either show someone else's machine's files or fail with
"no worker responded."

**One-time setup, per developer:**

1. Clone this platform's own repo (not the project you want to
   scan/test) and install dependencies:
   ```
   git clone https://github.com/kessousid/code-quality-platform.git
   cd code-quality-platform
   corepack enable
   corepack pnpm install
   corepack pnpm run build
   ```
2. Get the shared Railway `DATABASE_URL`, `REDIS_URL`, and
   `REPO_TOKEN_ENCRYPTION_KEY` (and a `GEMINI_API_KEY` if you'll use
   AI-based test generation) from whoever manages this deployment —
   these are the same for everyone, not per-developer. Put them in a
   file named `.env.<you>-worker` at the repo root (gitignored — never
   commit real credentials):
   ```
   DATABASE_URL=...
   REDIS_URL=...
   REPO_TOKEN_ENCRYPTION_KEY=...
   GEMINI_API_KEY=...
   ```
   `REPO_TOKEN_ENCRYPTION_KEY` is required for every worker to even boot
   (docs/adr/0047), regardless of whether you ever register a GitHub
   repo yourself — it must be the exact same value everywhere (every
   worker and the API), not something you generate yourself.
   `GEMINI_API_KEY` is the only genuinely optional one: skip it if
   you'll always set your own personal key via the web UI's "Set a
   custom Gemini API key" option instead, or if you'll only use the
   deterministic script-based generator/coverage gate (neither calls
   Gemini at all).
3. Pick a **Worker ID** unique to you — your name plus machine is enough
   (`priya-laptop`, `raj-desktop`). Run your worker:
   ```
   set -a && source .env.<you>-worker && set +a
   WORKER_ID=<you>-laptop corepack pnpm --filter @cqp/worker run start
   ```
   (PowerShell: load the file's variables into `$env:` instead of
   `source`, then run the same `pnpm` command.)
4. In the web app, whenever you add a repo or click **Browse…**, type
   that same Worker ID into the **Worker ID** field first — it's
   remembered in your browser afterward. A repo registered with your
   Worker ID only ever touches files on your machine; one registered
   with someone else's (or left blank, which means the shared `default`
   worker) never will.

**Keeping it running without thinking about it**: the command above exits
the moment you close its terminal. To have it start automatically and
restart itself if it crashes, register it as a Windows scheduled task
instead of running the command by hand:

```powershell
# One-time, in an elevated PowerShell — replace <you>-laptop and the .env file path with your own
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd 'C:\path\to\code-quality-platform'; Get-Content '.env.<you>-worker' | ForEach-Object { if ($_ -match '^\s*([^#=][^=]*)=(.*)$') { [System.Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process') } }; $env:WORKER_ID='<you>-laptop'; corepack pnpm --filter @cqp/worker run start`""
# Two triggers, not one: AtLogOn covers a real sign-in, but most laptops
# just sleep/lock for days at a time and never re-fire it — the repeating
# trigger is what actually keeps this self-healing regardless of how you
# use the machine. MultipleInstances=IgnoreNew means a periodic tick that
# fires while the worker's already running is a no-op, not a duplicate.
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn
$repeatTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName "CQP-Worker-<You>" -Action $action -Trigger @($logonTrigger, $repeatTrigger) -Settings $settings
```

Note this runs the **built** worker, not the auto-reloading dev mode —
after pulling new platform code, re-run `corepack pnpm run build` and
restart the task (`Restart-ScheduledTask` or log off/on) for it to take
effect.

**"I have to start the worker manually every time" / it keeps going
inactive**: this means the task above either isn't registered yet, or was
registered with only the old `AtLogOn` trigger (no repeating trigger) —
`AtLogOn` fires on a genuine Windows sign-in, not on waking from sleep or
unlocking, so on a laptop that's rarely fully logged out, the task can go
days without ever re-firing after the worker process dies. Check what you
actually have registered:

```powershell
Get-ScheduledTask -TaskName "CQP-Worker-*" | Get-ScheduledTaskInfo
(Get-ScheduledTask -TaskName "CQP-Worker-*").Triggers | ForEach-Object { $_.CimClass.CimClassName }
```

If `LastRunTime` is old and/or only `MSFT_TaskLogonTrigger` is listed (no
`MSFT_TaskTimeTrigger`), re-run the `Register-ScheduledTask` block above
in an **elevated** PowerShell (modifying an existing task's triggers needs
admin rights even if your account is an admin — a plain terminal's token
has that stripped by UAC) to add the repeating trigger. To get unblocked
immediately without waiting for a trigger to fire, start it directly:

```powershell
Start-ScheduledTask -TaskName "CQP-Worker-<You>"
```

## Registering a repo — the one rule that matters

**One repo record = one real git root.** When you clone a project from
GitLab, it becomes its own folder with its own `.git` — that folder is
what you register, not:

- **A parent folder containing several projects.** If you cloned an
  entire GitLab group into `C:\CuratalIT` (so `C:\CuratalIT\assessment`,
  `C:\CuratalIT\admin`, etc. sit side by side), register **each project
  folder separately** (`C:\CuratalIT\assessment`, then
  `C:\CuratalIT\admin`, ...). Registering `C:\CuratalIT` itself doesn't
  work — it isn't a git repository, it's just a folder holding several
  unrelated ones, and every run against it fails immediately.
- **A subfolder of a project** (e.g. `assessment\src\controllers`),
  _unless_ you genuinely mean "only ever look at this subtree, forever."
  It works — git diffs get correctly scoped to just that subfolder — but
  you're then permanently narrowing what this tool can see for that repo
  record. Most of the time you want the project's real root, so its
  whole codebase (however many folders deep) is in scope.

Use the **Browse…** picker rather than typing a path by hand — it's
harder to accidentally point at the wrong level.

## Module 1: Code Quality & Security

Point it at a registered repo, optionally pick which categories to run
(security / code quality / secrets / dependencies / architecture), and
start a scan. You can cancel a running scan and watch live progress.
Results are correlated findings you can filter by severity and export
as a report.

## Module 2: Unit Testing

### Coverage gate (the one to use day-to-day)

This is the answer to _"I write code every day — how do I know I tested
it before I push?"_ It needs no API key and no setup:

1. It diffs your **working tree** (including edits you haven't committed
   yet) against a **base branch** (defaults to `main`).
2. It runs **your repo's own existing Jest suite** with real coverage
   collection.
3. It fails if any changed line has no test hitting it, or if any test
   is currently failing.

It does **not** write tests. It checks whether _you_ did.

**The gotcha that trips everyone up first**: if you haven't changed
anything relative to the base branch yet, the gate "passes" — trivially,
because there's nothing to check. That's not a false positive; it's
telling you truthfully that zero lines changed. It is **not** an audit
of your whole codebase's test coverage.

**To get a real, whole-codebase audit** (e.g. the first time you point
this at an existing project with no tests at all), set the **Base
branch** field to git's universal empty-tree hash instead of `main`:

```
4b825dc642cb6eb9a060e54bf8d69288fbee4904
```

This makes every line in every file count as "changed," so the gate
reports your entire current coverage picture — honestly, including
everything that's never been tested. Use `main` for your normal
day-to-day check once you're actively writing new code against a
baseline; use the empty-tree hash whenever you want the absolute
picture instead of the incremental one.

### Test generation (secondary, optional)

Behind the collapsed **"Generate unit tests with Gemini (secondary)"**
section. Pick a file or folder, and it writes and runs real Jest tests
for whatever's there. Two choices of generator, picked per run:

- **Gemini (AI-written)** — needs a `GEMINI_API_KEY`. Better for code
  with real logic/intent to infer, and for framework-style code (Express
  route handlers, anything that communicates through side effects rather
  than a return value — an LLM can reason about mocking `req`/`res`).
- **Script-based (deterministic, no AI)** — no API key needed. Actually
  _calls_ the real function once with a synthesized argument and asserts
  exactly what it returned (a "golden-master" test). Best for plain
  functions with a real return value — utilities, calculations, data
  transforms. It cannot tell whether the captured behavior is _correct_,
  only that it's real, and it does poorly on functions whose real
  behavior is a side effect (Express controllers, anything using
  `res.json(...)` rather than `return`) — you'll see lots of failures
  like `"received value must be a promise"` on that kind of code, which
  is expected, not a bug. Switch to Gemini for those files instead.

Either way, generation is capped at **15 files per run** — deliberately,
so pointing it at a huge folder doesn't produce an unbounded LLM bill or
an unreviewable pile of files in one shot. For a large folder, target
subfolders in batches.

Picking the **repo root itself** via Browse is fine — the field will show
the real folder path, and the run-history list will show it as **"whole
repo"** rather than a confusing bare `.`.

## Before pointing this at a real, existing project

If the project has never actually been _run_ before (fresh clone, or one
that's normally only ever deployed, never executed locally):

1. **Install its dependencies** — `npm install` (or equivalent) inside
   that project's own folder. This platform doesn't do that for you (it
   only auto-installs _Jest itself_ if missing — everything else the
   project needs is on you, same as running it any other way).
2. **Give it a real `.env`** if it expects one (check for a
   `.env.example`). Placeholder, non-real values are fine for testing
   purposes — the point is just that nothing crashes trying to construct
   a third-party client (Stripe, AWS, etc.) with a completely missing
   key. A real Stripe/AWS credential is never needed just to run tests.

If a test run fails with something like `Cannot find module 'express'`,
that's #1. If it fails with something like a third-party SDK complaining
about a missing key/credential at startup, that's #2.

## Troubleshooting

**"jest not found — set CQP_JEST_PATH or install it on PATH"**
The auto-install of Jest into the target repo failed (usually a network/
registry issue) — check the error's own detail for the real npm failure,
or point `CQP_JEST_PATH` at any Jest already installed somewhere on the
machine to skip auto-install entirely (note: if set, it's used for
_every_ repo this platform processes, not just one).

**"Base ref does not resolve"**
The branch name (default `main`) doesn't exist in that repo's local
checkout. Either your default branch is actually called something else
(`master`, etc. — set it explicitly when registering the repo), or
you're pointing at a folder that isn't a real git repository at all.

**A run "completes" but shows almost all tests failing**
Check the actual failure message on one of them before assuming
something's broken — this is very often the script generator hitting
code whose real behavior is a side effect (see the Express/`res.json`
note above), which is an expected limitation, not a crash.

**Nothing seems to happen when I click a button**
Hard-refresh the page first (a stale browser bundle after any deploy).
If that doesn't help, it's worth checking whether the API/worker are
actually still running — ask whoever manages this deployment.
