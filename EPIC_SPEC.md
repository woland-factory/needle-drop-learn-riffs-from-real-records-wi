# EPIC SPEC — Riff-book: local-first store, streaks, review decay, export

## Quality differentiator (read first)

**Trustworthy verification.** Needle Drop wins on one dimension: a note-by-note
verdict the player believes, on their own records, where every competitor either
never listens or listens only to its own catalog.

**What it demands of THIS EPIC:** the riff-book is the ledger of verified wins.
Its whole value is that every entry was witnessed by the machine, so the ledger
must never lie:

1. **Only a matched pass writes to the book.** A phrase is saved, and a streak
   grows, only when `PassResult.matched` was true for a completed
   call-and-response cycle. Partial passes, tolerance-loosened re-grades of an
   old take, and abandoned cycles never mutate stored streaks. A streak the
   player did not earn destroys the same trust a false green note would.
2. **The book never loses or silently alters a win.** Saves are transactional,
   survive reload, and the stored record carries exactly what was verified:
   the notes as graded, the clip they were graded against, the real best
   score. Deleting is explicit and complete; nothing else is destructive.
   Time passing changes what is *due*, never what is *stored*.
3. **Due is honest.** The spaced-repetition schedule is a small, deterministic,
   unit-tested pure function of the stored record and the clock. A phrase
   surfaces as due exactly when its interval has lapsed, so the nudge is as
   believable as the verdict.

Everything else in this EPIC is held to the standard QUALITY BAR.

---

## Scope

### In scope

Building on EPIC 3 (the working mic verdict in `PracticePanel`, whose save
offer currently lands in an in-memory `savedRef` inside `LoopRoom`):

- **IndexedDB riff store** (`src/book/store.ts`): a small promise-based wrapper
  over raw IndexedDB, no new runtime dependency. One object store holds the
  whole record, clip bytes included, so a delete is atomic and orphaned blobs
  are structurally impossible. Forward-only versioning via
  `onupgradeneeded` plus a `v` field on each record.
- **Real save on a confirmed phrase**: on `Save to riff-book` after a matched
  pass, persist id, title, source name, the clip (region audio encoded as a
  16-bit PCM WAV), the loop region (start, end, bars, tempo, speed at save
  time), the graded notes, the stem used (`"mix"` until EPIC 6), date first
  nailed, streak, last practiced, review-due date, and best score. The
  in-memory `savedRef` session store from EPIC 3 is removed.
- **Spaced-repetition schedule** (`src/book/schedule.ts`): pure, deterministic
  functions (interval ladder, dueness, pass recording) that take the clock as
  a parameter. An untouched phrase decays to due when its interval lapses; a
  matched re-pass grows the streak and pushes the next review out.
- **The riff-book screen** (`src/components/RiffBook.tsx`): a second app view
  beside the Loop Room, reachable from a top-bar nav. Lists phrases with
  streak, date first nailed, best score, and dueness; surfaces due phrases in
  a `Due for review` section on top; shows a due count in the nav.
- **Re-practice from the book**: opening a phrase decodes its stored clip and
  runs the existing `PracticePanel` cycle against the stored notes at the
  stored tempo. A matched cycle records the pass: streak +1, last practiced
  and next review date updated, best score kept as the maximum. At most one
  streak increment per opening of a phrase.
- **JSON export**: one button downloads a single JSON file containing, for
  every phrase, its notes and metadata plus its clip as base64 WAV data.
- **Delete a phrase**: an explicit two-step confirm removes the record, clip
  bytes included, leaving nothing behind.
- **Designed states** for the new surfaces: the empty riff-book points to the
  Loop Room in positive phrasing; list loading holds layout; save and load
  failures speak in the product voice with a next step.

### Out of scope (do not build — later EPICs own these, or a Non-Goal forbids them)

- **Riff-book import.** Export only. Do not build a file-open path, a paste
  path, or a merge path for exported JSON.
- **Accounts, login, server sync, cloud storage.** The store is IndexedDB on
  this machine, full stop. No new network surface of any kind.
- **The guided first-run walkthrough and bundled demo chart** — EPIC 5. Do not
  add walkthrough overlays or seed the book with a demo phrase.
- **Stem separation** — EPIC 6. `stemUsed` is always `"mix"` this EPIC; the
  field exists so EPIC 6 can write real values without a migration.
- **Renaming or editing a saved phrase.** The title derives from the source
  file name. Editing stored notes, regions, or titles is not in this EPIC.
- **Deduplication.** Saving the same region twice creates two entries; that is
  acceptable and not worth machinery this EPIC.
- **List pagination or capping.** The plan assigns riff-book list capping to
  EPIC 7 (polish). Render the full list this EPIC; keep the rendering simple
  so EPIC 7 can cap it.
- **A full settings screen, "clear all data", tuning controls.** Only the
  surfaces named in scope.

---

## Non-goals (binding — from the planner)

- No riff-book import.
- No accounts or server sync.
- No cloud storage.

---

## Technical design

The app stays **fully client-side**: no HTTP endpoints, no server entities.
The data-model change is a new IndexedDB database, created by a forward-only
`onupgradeneeded` migration. **No new runtime dependency**; one new dev
dependency (`fake-indexeddb`) so the store is unit-testable under jsdom.

### Data model (IndexedDB — forward-only migration)

Database `needle-drop`, version `1`. Migration `0 → 1` creates object store
`riffs` with `keyPath: "id"`. Future EPICs only ever add stores/indexes/fields
in higher versions; they never rewrite or drop existing data. Each record
carries `v: 1` so later code can migrate records lazily if it must.

```ts
// src/book/store.ts
export type StemUsed = "bass" | "guitar" | "other" | "mix";

export interface StoredNote {
  midi: number;
  startSec: number; // relative to clip start, exactly as graded
  durSec: number;
  confidence: number;
  edited: boolean;
} // the UI-only Note.id is dropped on persist (note.ts anticipates this);
  // fresh ids come from makeNoteId() on load.

export interface RiffRecord {
  v: 1;
  id: string; // crypto.randomUUID()
  title: string; // source file name without extension
  sourceName: string;
  clipWav: ArrayBuffer; // 16-bit PCM mono WAV of the loop region, natural speed
  loopRegion: {
    startSec: number; // absolute position in the source file, for reference
    endSec: number;
    bars: number;
    tempoBpm: number;
    speed: number; // playback speed at save time
  };
  notes: StoredNote[];
  stemUsed: StemUsed; // always "mix" this EPIC
  dateFirstNailed: number; // epoch ms
  bestScore: number; // 0..100
  streak: number; // >= 1
  lastPracticed: number; // epoch ms
  reviewDueDate: number; // epoch ms
}
```

The clip is stored as an `ArrayBuffer` of WAV bytes inside the record (not a
separate blob store): structured-clone-safe in every browser, one record per
phrase, and delete-one-record removes everything. Wrap in
`new Blob([bytes], { type: "audio/wav" })` at playback/export time. A two-bar
mono clip is a few hundred KB; well within IndexedDB comfort.

### Files / modules to touch

New — pure logic (no DOM, no IndexedDB; fully unit-tested):

- `src/book/schedule.ts` — the spaced-repetition brain. All functions take
  `nowMs` explicitly; nothing here reads the clock.
  ```ts
  export const REVIEW_LADDER_DAYS = [1, 3, 7, 14, 30, 60]; // by streak, capped
  export function intervalDays(streak: number): number; // ladder[min(streak, len) - 1]
  export function nextReviewDue(streak: number, nowMs: number): number;
  export function isDue(record: Pick<RiffRecord, "reviewDueDate">, nowMs: number): boolean;
  // First save: streak 1, dateFirstNailed = lastPracticed = nowMs,
  // reviewDueDate = nextReviewDue(1, nowMs), bestScore = score.
  export function initialSchedule(score: number, nowMs: number): Pick<RiffRecord,
    "streak" | "dateFirstNailed" | "lastPracticed" | "reviewDueDate" | "bestScore">;
  // Matched re-pass: streak + 1, lastPracticed = nowMs,
  // reviewDueDate = nextReviewDue(streak + 1, nowMs), bestScore = max(old, score).
  export function applyPass(record: RiffRecord, score: number, nowMs: number): RiffRecord;
  // "Due now" when overdue, else "Due in n days" (n >= 1, ceil), "Due today" inside a day.
  export function dueLabel(record: RiffRecord, nowMs: number): string;
  ```
  Binding semantics: **decay never mutates storage** — an untouched phrase
  becomes due purely because `isDue` compares its stored `reviewDueDate` to
  the clock. A matched pass grows the streak whether or not the phrase was
  due (practicing early still counts). Only matched passes change anything;
  a failed or partial re-practice leaves the record untouched.

- `src/audio/wav.ts` — add the writer, mirror of the existing `readWavPcm`:
  `writeWavPcm(take: Take): ArrayBuffer` producing a 16-bit PCM mono WAV
  (clamp samples to [-1, 1], round-trips through `readWavPcm`). Add
  `mixToMono(channels: Float32Array[], startFrame: number, endFrame: number):
  Float32Array` (average channels over a frame span) so clip extraction is
  pure; the only Web Audio touch is a thin helper that pulls
  `getChannelData` off the `AudioBuffer` and delegates:
  `extractRegionWav(buffer: AudioBuffer, region: AbsoluteRegion): ArrayBuffer`.

New — the store (thin, promise-based, injectable):

- `src/book/store.ts` — the `RiffStore` interface plus the real
  `IdbRiffStore` and the record types above.
  ```ts
  export interface NewRiff {
    title: string;
    sourceName: string;
    clipWav: ArrayBuffer;
    loopRegion: RiffRecord["loopRegion"];
    notes: StoredNote[];
    stemUsed: StemUsed;
  }
  export interface RiffStore {
    add(riff: NewRiff, score: number, nowMs: number): Promise<RiffRecord>;
    list(): Promise<RiffRecord[]>;
    get(id: string): Promise<RiffRecord | undefined>;
    recordPass(id: string, score: number, nowMs: number): Promise<RiffRecord>;
    remove(id: string): Promise<void>;
    dispose(): void; // close the db handle
  }
  ```
  `add` composes the record via `initialSchedule`; `recordPass` does a
  read-modify-write through `applyPass` inside a single `readwrite`
  transaction. Every method rejects with a plain `Error` on IndexedDB
  failure; callers own the designed error states. On first successful open,
  call `navigator.storage?.persist?.()` once, ignoring the result — a
  best-effort nudge against eviction for a local-first book, never a
  blocker. Components receive a `RiffStore` by prop (defaulting to a shared
  `IdbRiffStore`), the same injectability pattern as `Transcriber` and
  `MicRecorder`, so component tests never touch real IndexedDB.

New — UI:

- `src/components/RiffBook.tsx` — the book screen. Loads `store.list()` on
  mount (and reloads after any mutation), sorts due phrases first (most
  overdue first), the rest by `lastPracticed` descending. Renders:
  - a `Due for review` section on top when any phrase is due, with the due
    items and the section line from the Copy block;
  - the full list: per item the title, `Streak {n}`, `First nailed {date}`,
    `Best {score}%`, the due label, a primary `Practice` action, and a
    `Delete` action behind a two-step inline confirm;
  - a header row with the book heading and the `Export book` action;
  - the designed empty state (`BookEmptyState`) when the store is empty;
  - a layout-stable loading skeleton while `list()` resolves;
  - a designed error state if the store cannot be opened, with a retry.
  Takes `store: RiffStore`, `now?: () => number` (defaults to `Date.now`,
  injectable for dueness tests), `onGoToLoopRoom: () => void`, and
  `onPractice: (record: RiffRecord) => void`.
- `src/components/states/BookEmptyState.tsx` — the designed empty book
  (copy below), with the primary action navigating to the Loop Room.
- `src/components/RiffPractice.tsx` — re-practice surface. Decodes the
  record's `clipWav` to an `AudioBuffer` (via the existing decode path or
  `ctx.decodeAudioData` on the WAV bytes), rebuilds `Note[]` from
  `StoredNote[]` with fresh `makeNoteId()` ids, then renders the existing
  `PracticePanel` with `region = { startSec: 0, endSec: clipDuration }`,
  `bpm = loopRegion.tempoBpm`, the shared recorder/audition/metronome, and
  the review-mode props below. On a matched cycle it calls
  `store.recordPass` (once per opening — see the invariant below) and shows
  the streak confirmation. A back action returns to the book list, which
  reloads.

Changed:

- `src/App.tsx` — becomes the two-view shell. Owns `view: "loop" | "book"`,
  the top bar (brand + nav), and the shared `RiffStore`. The nav shows a due
  count badge when any phrase is due (refreshed on view change and after
  mutations). **Keep `LoopRoom` mounted and hide it with the `hidden`
  attribute when the book is shown** — unmounting would silently drop the
  loaded song, chart, and any in-flight practice, which is a real trap.
  `RiffBook` may mount per visit. Construct the store once, dispose on
  unmount, and pass it down (injectable for tests).
- `src/components/LoopRoom.tsx` — remove the `savedRef` session store and
  the topbar (the shell owns the top bar now; keep the privacy line inside
  the Loop Room view). `savePhrase` becomes an async handler that builds a
  `NewRiff` (clip via `extractRegionWav(buffer, chartRegion)`, notes mapped
  to `StoredNote`, title from `sourceName` minus extension, the current
  bars/bpm/speed, `stemUsed: "mix"`) and awaits `store.add(riff, score,
  Date.now())`. Accepts `store: RiffStore` by prop.
- `src/components/PracticePanel.tsx` — three additive changes, no cycle or
  grading changes:
  1. `onSave` becomes `(notes: Note[], score: number) => Promise<void>`; the
     panel awaits it, shows `Saved to your riff-book.` on success, and on
     rejection shows the storage-blocked message (copy below) with the save
     button re-enabled to retry. Pass the matched `result.score`.
  2. New optional `onMatched?: (score: number) => void`: fired in the
     `grading → verdict` transition when the cycle's own grade has
     `matched: true`. **Never fired from the tolerance-change re-grade
     effect** — only a completed cycle earns a pass.
  3. New optional `matchedMode?: "save" | "review"` (default `"save"`) with
     `matchedLine?: string`: in review mode the verdict hides the save
     button and renders `matchedLine` (the streak confirmation the parent
     computed) in its place; `Play it again` stays.
- `src/styles/global.css` — top-bar nav (44px targets, visible focus, due
  badge), book list and due section, list skeleton, empty state, inline
  delete confirm, export status line, streak confirmation. Mobile-first at
  390px, reusing existing variables and control classes.
- `package.json` — add `fake-indexeddb` to devDependencies. No runtime
  dependency changes.
- `README.md` — add the riff-book to the stranger-facing story: every
  phrase you nail is saved on your machine with a streak, resurfaces when
  it is due for review, and exports to a single JSON file. Sweep the copy.

### Export (part of `RiffBook`)

`Export book` serializes `store.list()` to one JSON file and triggers a
download via `URL.createObjectURL` + a temporary anchor
(`needle-drop-riff-book.json`). Shape:

```ts
{
  app: "needle-drop",
  exportVersion: 1,
  exportedAt: number, // epoch ms
  riffs: [{
    id, title, sourceName, loopRegion, notes, stemUsed,
    dateFirstNailed, bestScore, streak, lastPracticed, reviewDueDate,
    clipWavBase64: string // the record's WAV bytes, base64
  }]
}
```

Base64-encode the `ArrayBuffer` in chunks (no dependency needed). After the
download starts, show `Riff-book exported.` in a `role="status"` line. With an
empty book the export button is not rendered (the empty state owns the
screen). Import of this file is a Non-Goal.

### Binding invariants (testable)

- **Save writes exactly once per click, only after a matched pass**, and the
  saved `bestScore` is the score of the matched grade.
- **`recordPass` runs at most once per opening of a phrase.** The first
  matched cycle in a `RiffPractice` session records the pass; later matched
  cycles in the same session show `Still matched.` and change nothing except
  `bestScore` — implemented by passing `onMatched` only until the first
  recorded pass, and updating `bestScore` through the same single
  `recordPass` call (i.e. later cycles do NOT call the store at all; the
  next session's pass captures any better score). Keep it simple: one store
  write per session.
- **Tolerance-change re-grades never write to the store** in either mode.
- **Time never mutates the store.** Dueness is computed; no background
  timers, no decay writes.
- **Delete removes the record atomically**; because clip bytes live inside
  the record, no orphaned blob can exist afterwards.

### Perceived speed and feedback (QUALITY BAR §1)

- Nav switches are synchronous state flips; the book renders its skeleton
  instantly and the list typically within one IndexedDB round trip
  (milliseconds). No white screens.
- Save encodes a few seconds of mono PCM — fast; the save button shows a
  pressed/busy state until the promise settles, well under a second.
- Export runs in memory over a handful of records; show the status line when
  the download fires. All queries are `getAll` on a single small store; the
  hot path never scans anything unbounded (capping the rendered list is
  EPIC 7's).

### Security / hygiene (static client app)

- **No new network surface.** Store, export, and re-practice issue no
  requests (the exported file is a local blob URL, revoked after click).
- **No PII in logs.** Never attach titles, source file names, notes, clips,
  or export payloads to Sentry events. Store errors are reported as kinds,
  not contents.
- **Boundary validation.** `IdbRiffStore` validates records on read
  (unknown `v`, missing fields → skip the record and surface the designed
  error rather than crashing the list). Clip decode failures in re-practice
  show a designed error with a way back, never a dead end.

### Copy (already swept — no em/en dashes, positive, plain)

- Nav: `Loop Room`, `Riff-book`; due badge aria-label `{n} due for review`.
- Book heading: `Your riff-book`. Export action: `Export book`. Export
  status: `Riff-book exported.`
- Due section heading: `Due for review`; line: `Keep these sharp. Play one
  back to grow its streak.`
- List item meta: `Streak {n}`, `First nailed {date}`, `Best {score}%`; due
  labels `Due now`, `Due today`, `Due in {n} days`.
- Item actions: `Practice` (primary), `Delete`; confirm: `Delete this
  phrase?` with `Delete` and `Keep it`.
- Empty book: heading `Conquer your first phrase`; body `Loop two bars, play
  them into your mic, and save the pass. Every phrase you nail lands here.`;
  action `Go to the Loop Room`.
- Book load error: heading `Your book is out of reach`; body `Your browser
  blocked storage for this site. Allow storage, then try again.`; action
  `Try again`.
- Save failure (in the verdict): `Your browser blocked saving. Allow storage
  for this site, then try again.` with the save button ready to retry.
- Review pass confirmation (`matchedLine`): `You still have it. Streak {n}.
  Next review in {days} days.` (use `Next review tomorrow.` when the
  interval is 1 day). Later matched cycles in the same session: `Still
  matched.`
- Re-practice clip error: heading `That clip will not play`; body `Reload
  the page and open it again.`; action `Back to your book`.

Sweep every string added or edited in this EPIC before finishing (QUALITY
BAR §8): the characters `—`/`–`, the banned vocabulary, and negative
empty-state phrasing (`You don't have`, `No … yet`, `Nothing … here`,
`Unable to`, `Something went wrong`).

---

## Ordered task list (each with acceptance criteria)

### T1 — WAV writer and clip extraction
Add `writeWavPcm`, `mixToMono`, and the thin `extractRegionWav` to
`src/audio/wav.ts`.
- **AC:** `writeWavPcm` output round-trips through the existing `readWavPcm`
  with sample values within 16-bit quantization error; samples beyond
  [-1, 1] are clamped, not wrapped. Unit-tested.
- **AC:** `mixToMono` averages multi-channel input over the requested frame
  span and handles a span clamped to the buffer edges. Unit-tested.

### T2 — Spaced-repetition schedule (pure)
Add `src/book/schedule.ts` with the ladder, `isDue`, `initialSchedule`,
`applyPass`, and `dueLabel`, all clock-injected.
- **AC:** `initialSchedule` yields streak 1 and a review due 1 day out;
  `applyPass` increments the streak, moves `reviewDueDate` by the ladder
  interval for the new streak (capped at the last rung), updates
  `lastPracticed`, and keeps `bestScore` as the maximum. Unit-tested.
- **AC:** `isDue` is false before `reviewDueDate` and true at and after it,
  with no record mutation anywhere in the module: a phrase left untouched
  past its interval reads as due purely from the stored date and an
  injected clock. Unit-tested. (Maps to planner AC 3, decay half.)

### T3 — IndexedDB riff store
Add `src/book/store.ts`: types, `RiffStore`, `IdbRiffStore`, the `0 → 1`
migration, and the `fake-indexeddb` dev dependency for its tests.
- **AC:** `add` persists a full `RiffRecord` (clip bytes included) built via
  `initialSchedule`; `list` returns it after a fresh store instance opens
  the same database (persistence across "reload" proven at the unit level).
  Unit-tested against `fake-indexeddb`. (Maps to planner AC 1.)
- **AC:** `recordPass` applies `applyPass` atomically and `remove` deletes
  the record so `list` is empty and `get` returns undefined — with the clip
  inside the record, nothing orphaned can remain. Store failures reject
  with `Error`, never hang. Unit-tested. (Maps to planner AC 3, 6.)

### T4 — Real save from the verdict
Wire `LoopRoom` to the store: async `onSave(notes, score)`, clip extraction,
`savedRef` removed; `PracticePanel` awaits the save and designs the failure.
- **AC:** After a matched pass, `Save to riff-book` persists the phrase with
  the matched score as `bestScore`, `stemUsed: "mix"`, and the current
  region/tempo/speed metadata; the panel confirms `Saved to your
  riff-book.` Component-tested with an injected store. (Maps to planner
  AC 1.)
- **AC:** A rejecting store shows the storage-blocked message and the save
  can be retried; a second click after success does not double-save.
  Component-tested.

### T5 — App shell, nav, and the riff-book screen
Rework `App.tsx` into the two-view shell; add `RiffBook` and
`BookEmptyState`.
- **AC:** The nav reaches the riff-book and back; `LoopRoom` stays mounted
  (hidden) so a loaded song and chart survive the round trip.
  Component-tested.
- **AC:** With stored phrases, the book lists each with streak, first-nailed
  date, and best score; phrases whose `reviewDueDate` has passed (injected
  clock) appear in the `Due for review` section on top and in the nav's due
  count. Component-tested. (Maps to planner AC 2.)
- **AC:** An empty store renders the designed empty state pointing to the
  Loop Room, in positive phrasing, and its action navigates there.
  Component-tested. (Maps to planner AC 5.)

### T6 — Re-practice and streak growth
Add `RiffPractice`; add `onMatched` / `matchedMode` / `matchedLine` to
`PracticePanel`.
- **AC:** `Practice` on a book entry decodes the stored clip and runs the
  full existing cycle against the stored notes at the stored tempo; a
  matched cycle calls `recordPass` exactly once per opening, and the
  confirmation shows the new streak and next review. Component-tested with
  injected store, recorder, and grade. (Maps to planner AC 3, growth half.)
- **AC:** A failed cycle, an abandoned cycle, and a tolerance-change
  re-grade write nothing to the store; a second matched cycle in the same
  session shows `Still matched.` without a second store write.
  Component-tested. (Guards the differentiator: only earned passes count.)

### T7 — JSON export
Add the export action to `RiffBook`.
- **AC:** With phrases stored, `Export book` downloads a single JSON file
  matching the export shape: notes and metadata for every phrase plus each
  clip as base64 WAV whose bytes decode back through `readWavPcm`.
  Component-tested (serializer as a pure function) plus e2e download.
  (Maps to planner AC 4.)

### T8 — Delete with confirm
- **AC:** `Delete` asks `Delete this phrase?` inline; confirming removes the
  entry from the list and the store (record and clip bytes gone, per T3);
  `Keep it` leaves everything untouched. Component-tested. (Maps to planner
  AC 6.)

### T9 — E2E, mobile, accessibility, copy sweep
- **AC:** The Playwright flow proves the loop end to end: conquer the sample
  phrase with the fake mic capture, save it, **reload the page**, open the
  riff-book, and the phrase is there with `Streak 1`; practice it from the
  book with the same capture and the streak reads 2; export downloads valid
  JSON; delete then reload shows the empty book. (Maps to planner AC 1, 3,
  4, 5, 6 at the wiring level.)
- **AC:** The book and re-practice surfaces work at 390px with no horizontal
  scroll, ~44px targets, visible focus, labeled controls, full keyboard
  reach (nav, practice, delete confirm, export), and list/status updates in
  polite live regions.
- **AC:** No user-visible string added or edited in this EPIC contains `—`,
  `–`, banned vocabulary, or negative empty-state phrasing.

---

## Test plan (which tests prove each criterion)

### Unit (Vitest, pure)

- `wav.ts`: `writeWavPcm` ↔ `readWavPcm` round trip, clamping, `mixToMono`
  averaging and edge clamps. → T1.
- `schedule.ts`: ladder values by streak including the cap; `initialSchedule`
  and `applyPass` field-by-field with a fixed injected clock; `isDue`
  boundary at exactly `reviewDueDate`; `dueLabel` for overdue, same-day, and
  future; module mutates nothing. → T2; planner AC 3 (decay).

### Unit (Vitest + `fake-indexeddb`)

- `store.ts`: migration creates the store; `add` → `list`/`get` round trip
  including clip bytes; a second `IdbRiffStore` on the same fake database
  sees the record (persistence); `recordPass` applies the schedule
  atomically; `remove` leaves `list` empty and `get` undefined; malformed
  record on read is skipped, not thrown. → T3; planner AC 1, 6.

### Component (Vitest + RTL, jsdom — injected `RiffStore` fake, injected clock)

- Save path: matched verdict → save → fake store received a well-formed
  `NewRiff` with the matched score; success line shown; rejection shows the
  storage-blocked copy and retry works; no double-save. → T4; planner AC 1.
- Shell: nav round trip keeps `LoopRoom` mounted (loaded-song state
  preserved); due badge reflects the fake store. → T5.
- Book: list content (streak, first-nailed date, best score); due section
  ordering with an overdue record under an injected `now`; empty state copy
  and navigation; loading skeleton; store-error state with retry. → T5;
  planner AC 2, 5.
- Re-practice: matched cycle → exactly one `recordPass`, confirmation with
  new streak and next review; failed cycle / tolerance re-grade / abandoned
  cycle → zero store writes; second matched cycle → `Still matched.`, no
  write; clip-decode failure → designed error with a way back. → T6;
  planner AC 3.
- Export: the pure serializer emits the export shape from fake records, and
  each `clipWavBase64` decodes back through `readWavPcm`. → T7; planner
  AC 4.
- Delete: two-step confirm; confirm calls `remove` and refreshes; `Keep it`
  is a no-op. → T8; planner AC 6.

### End-to-end (Playwright — existing fake mic device and capture WAV)

- **Conquer, save, survive reload:** load the sample, `Find the notes`,
  `Check my take`, pass with the fake capture, `Save to riff-book`, see the
  confirmation; `page.reload()`; open `Riff-book`; the phrase is listed with
  `Streak 1` and its first-nailed date. → planner AC 1, 2.
- **Streak grows on a re-pass:** from the book, `Practice` the saved phrase,
  pass with the same capture; the confirmation and the list show streak 2.
  → planner AC 3 (growth; decay is proven in unit/component with the
  injected clock, which is the honest way to test time).
- **Export:** `Export book` fires a download; parse the file; assert one
  riff with notes, metadata, and non-empty `clipWavBase64`. → planner AC 4.
- **Delete:** delete the phrase, confirm, see the empty state; reload; the
  empty state persists (nothing lingered). → planner AC 5, 6.
- **No new network surface:** during save, book browsing, and export, no
  request leaves the app's host (same network assertion as earlier EPICs).
- **390px:** book list, due section, and re-practice have no horizontal
  overflow; nav and primary controls visible and focusable.

### Copy sweep (QUALITY BAR §8) — part of DONE

Mechanically search every user-visible string added or edited in this EPIC
(`App` nav, `RiffBook`, `BookEmptyState`, `RiffPractice`, the new
`PracticePanel` lines, README additions) for `—`/`–`, the banned vocabulary,
and negative empty-state phrasing. Every hit is a defect fixed in the same
run.

---

## Definition of done

All six planner acceptance criteria are provable via the tests above: a
confirmed phrase persists in IndexedDB and survives reload (store unit +
e2e reload); the book lists phrases with streak and first-nailed date and
surfaces overdue phrases via the deterministic schedule (component with
injected clock + e2e); a matched re-practice updates streak and next review
exactly once per session while an untouched phrase decays to due purely by
the clock (schedule unit + re-practice component + e2e streak 2); export
downloads one JSON file with notes, metadata, and base64 clip data for every
phrase (serializer test + e2e download); the empty book is a designed,
positively-phrased pointer to the Loop Room (component + e2e after delete);
and deleting removes the record with its embedded clip bytes so nothing is
orphaned (store unit + e2e). The QUALITY BAR is met for the new surfaces
(instant nav, skeletons, designed empty/error states, 390px, keyboard and
live regions, one primary action per screen, human copy), no Non-Goal was
built (no import, no accounts or sync, no cloud storage), the ledger
invariants hold (only matched cycles write; time never mutates the store),
and the copy sweep is clean.
