# Overview

## Purpose

Settings provides one reliable desktop window for configuring companion scale, reminder intervals, animation speed, always-on-top behavior, auto-launch, and Developer mode. It also owns reset, import, and export workflows. Settings are validated and persisted by the Electron main process and applied to the companion without requiring a restart wherever the platform permits.

## User story

As a user, I can adjust how PsyDuck looks and behaves, control startup and reminder preferences, move configuration between installations, inspect developer diagnostics, and restore safe defaults without editing files.

## Goals

- Present all V1 configuration in a single-instance, accessible settings window.
- Apply valid changes immediately and persist them atomically.
- Keep the main process authoritative across the settings and companion renderers.
- Validate every value at UI, IPC, and persistence boundaries.
- Provide safe preview, reset, import, and export behavior.
- Report platform and persistence failures without affecting the companion's core Idle behavior.
- Preserve strict privacy and exclude transient activity data from exports.

## Non goals

- Custom themes, sound controls, voice, chat, prompt configuration, plugins, or arbitrary scripts.
- Editing raw JSON inside the application.
- Syncing settings through a network account.
- Exposing window coordinates, physics constants, asset paths, or unbounded animation values to ordinary users.
- Requiring an Apply button for routine changes.

# User Experience

The user opens Settings from the application menu or defined companion shortcut. If Settings is already open, the existing window comes forward with its current focus and unsaved draft intact. The window follows the operating-system appearance and contains five ordered sections: Companion, Reminders, Window and startup, Data, and Developer mode.

Scale offers crisp supported multipliers. Selecting one updates PsyDuck immediately while keeping its ground point and reachable region stable. Animation speed uses a labeled slider from 0.75× to 1.5×. Always on top and Start at login use switches with immediate platform feedback.

Water and Stretch reminders each have an enabled switch and an exact interval control. Water initially shows 45 minutes; Stretch shows 60 minutes. Values are limited to 15–240 minutes in five-minute steps. Help text explains that missed intervals are not replayed after sleep.

Settings save automatically. A compact status changes from Saving to Saved without moving the layout. If a save fails, the user's selection remains visible as a draft, the prior authoritative value remains applied, and Retry is available.

Export opens a native save dialog and writes a readable JSON settings file. Import opens a native file dialog, validates the file, and shows a change summary before anything is applied. Reset opens a destructive confirmation naming the categories that will return to defaults. Canceling any file dialog or confirmation changes nothing.

Developer mode reveals sanitized runtime diagnostics and optional preview triggers. The section never exposes typed content, source prompts, response text, active application names, cursor targets, or local file paths.

# Behavior

1. Opening Settings requests the authoritative settings snapshot and revision before enabling controls.
2. While loading, render the full layout with disabled controls and stable loading affordances; do not briefly show defaults that could be mistaken for saved values.
3. Hydrate the Zustand settings store from the validated snapshot. Form fields track `authoritativeValue`, `draftValue`, `status`, and field error.
4. Immediate controls submit a typed patch on activation. Slider input previews locally while dragged and submits on release, Enter, or 250 ms debounced focus loss.
5. Every submission includes the last known revision. The main process validates the patch, applies platform effects where needed, writes settings atomically, increments the revision, and broadcasts the new snapshot.
6. Both renderers replace their authoritative state from the broadcast. The initiating field displays Saved for two seconds.
7. If the revision is stale, the main process returns the latest snapshot. Preserve a conflicting local draft only if it remains valid, explain that settings changed elsewhere, and let the user retry intentionally.
8. If validation fails, keep focus and draft in the field, associate the exact error message, and do not call persistence or platform adapters.
9. If a platform side effect fails, restore the last applied value. Persist only a state that matches actual platform behavior, unless a documented platform adapter reports “applies next launch.”
10. Closing Settings disposes renderer subscriptions and local previews. Already accepted settings remain active. Unsubmitted invalid drafts are discarded.

### Scale

Supported values are 1×, 2×, 3×, and 4×, filtered by current display capability when necessary. A scale change expands or contracts companion safe bounds around a stable ground point, reclamps only if the grab region would become unreachable, and updates nearest-neighbor rendering. It never applies fractional CSS scale.

### Animation speed

Valid values are 0.75×–1.5× in 0.05× increments, default 1×. The value changes authored clip playback and not physics simulation, reminders, snooze, UI transitions, or integration timeouts. Existing non-critical clips adopt the new rate at the next frame boundary; direct exit timing remains bounded.

### Reminders

Water defaults to enabled/45 minutes; Stretch defaults to enabled/60 minutes. Disabling a reminder cancels its pending and visible occurrence. Enabling schedules a new baseline from acceptance time. Interval changes follow each feature's deadline-recalculation rules.

### Always on top and auto-launch

Always on top applies to the companion window only. Settings remains a normal utility window. Auto-launch is labeled “Start at login” and delegates to the platform adapter. Pending operations disable only their own switch.

### Reset

Reset confirmation states that companion scale, animation speed, reminder enablement and intervals, always on top, auto-launch, Developer mode, and related scheduling data will return to defaults. On confirmation, main process constructs a complete default snapshot, applies platform effects, persists one atomic revision, clears pending reminders, and broadcasts. Companion position may be reset only if the confirmation explicitly includes position; the V1 baseline preserves position because it is not an exposed setting.

# Animation

Settings is primarily a utility interface; motion explains changes and never imitates character animation.

| Interaction | Duration | Behavior |
| --- | ---: | --- |
| Settings window initial content | 120–180 ms maximum | Content becomes available as one stable layout; no stagger |
| Hover | 100 ms | Semantic surface-color change |
| Press | Immediate–80 ms | Bounded pressed state |
| Menu/confirmation enter | 120–160 ms | Small ease-out translation and opacity |
| Saved status | 120 ms in, 2 s hold | Fixed reserved area; no layout shift |
| Error reveal | Immediate or 120 ms | Height is reserved where practical; focus remains stable |
| Companion scale preview | 120–180 ms bounds adjustment | Pixel scale changes at a discrete frame; ground point remains fixed |

Switch thumbs, slider thumbs, and dropdown indicators may use platform-standard motion. Pixel icons change between authored states and do not rotate or blur. No settings surface uses continuous ambient animation.

Developer preview buttons trigger the actual feature event path, not an embedded GIF. A preview never changes reminder deadlines or persists transient state. Only one preview runs at a time, and closing Settings cancels a settings-owned preview request if it has not started. Direct Drag can interrupt any preview.

Reduced motion removes menu translation, confirmation scaling, and animated companion bounds adjustment. State and focus changes remain immediate and visible.

# State Flow

The Settings feature has window, form, and persistence states independent of the companion state machine.

```text
Closed
  -> Opening            on open command
Opening
  -> Ready              after validated snapshot hydration
Opening
  -> LoadError          on unrecoverable snapshot failure
Ready
  -> Editing            on local draft change
Editing
  -> Saving             on valid submission
Editing
  -> ValidationError    on invalid value
Saving
  -> Saved              on authoritative accepted snapshot
Saving
  -> Conflict           on revision mismatch
Saving
  -> SaveError          on persistence or platform failure
Saved
  -> Ready              after status hold
Conflict/SaveError
  -> Saving             on retry
Any open state
  -> Closed             on window close
```

Import flow:

```text
Ready -> FileDialog -> ValidatingImport -> ImportPreview
ImportPreview -> ApplyingImport -> Saved
FileDialog/ImportPreview -> Ready on cancel
ValidatingImport/ApplyingImport -> ImportError on failure
```

Export flow is `Ready -> FileDialog -> Exporting -> Exported -> Ready`, with cancel returning directly to Ready. Reset is `Ready -> ConfirmReset -> Resetting -> Saved`; Cancel returns to Ready.

Settings changes can cause companion transitions: disabling an active reminder exits that reminder to Idle, Developer preview requests a guarded behavior, and scaling adjusts the window. The Settings renderer never writes the companion state directly.

# Technical Design

The settings schema is a discriminated, versioned runtime contract shared as TypeScript types and runtime validation rules:

```ts
type SettingsDocument = {
  readonly schemaVersion: number;
  readonly revision: number;
  readonly companion: {
    readonly scale: 1 | 2 | 3 | 4;
    readonly animationSpeed: number;
    readonly alwaysOnTop: boolean;
  };
  readonly reminders: {
    readonly water: { readonly enabled: boolean; readonly intervalMinutes: number };
    readonly stretch: { readonly enabled: boolean; readonly intervalMinutes: number };
  };
  readonly system: { readonly autoLaunch: boolean };
  readonly developer: { readonly enabled: boolean };
};
```

Schedule timestamps, last position, and platform-specific applied metadata are internal persistence fields and need not appear in the public import/export shape. Unknown keys are rejected on import or removed only through an explicit migration; they are never passed through blindly.

Main-process `SettingsService` coordinates `SettingsRepository`, `AutoLaunchAdapter`, `WindowRegistry`, and `ReminderScheduler`. Update order is:

1. Validate patch and revision.
2. Compute complete candidate snapshot.
3. Stage reversible platform side effects.
4. Persist the candidate atomically.
5. Commit side effects or compensate on failure.
6. Increment/broadcast the authoritative revision.

For side effects that cannot participate in a transaction, the service records enough applied state to reconcile at next launch. The user-facing result is success only when persisted intent and known platform state agree.

Preload exposes fixed methods: `getSettings`, `updateSettings`, `resetSettings`, `chooseImportFile`, `previewImport`, `applyImport`, `chooseExportPath`, `exportSettings`, `subscribeSettings`, and sanitized developer commands. Renderer cannot pass arbitrary file paths to read or write. Native dialogs choose paths, and main process uses scoped handles or internally retained selections.

Import validation checks JSON syntax, maximum file size, schema version, exact known fields, types, ranges, and enum values. It migrates supported older schema versions in memory, then shows a diff grouped by section. Import does not apply companion position, pending occurrences, logs, diagnostics, or platform-specific paths. Imported auto-launch and always-on-top settings are clearly included in the preview because they cause platform behavior.

Export writes UTF-8 formatted JSON with a stable key order, `schemaVersion`, and configuration only. It excludes revision, machine identifiers, current state, event history, deadlines, activity timestamps, cursor information, integration identifiers, and absolute paths. Export uses a temporary file and atomic replace after native overwrite confirmation.

Reset defaults come from the same `defaults.ts` used on first launch and schema migration. UI must not duplicate literal defaults. Reset is one transaction; it cannot leave Water at default while Stretch remains on an old interval due to partial failure.

React owns accessible form composition and local drafts. Zustand holds the snapshot, update statuses, and narrow selectors. No Pixi objects enter the settings store. Settings subscriptions are disposed when the window closes.

Tests cover schema boundaries, every control, revision conflicts, platform failure compensation, atomic write recovery, migration, import diff, malicious/oversized files, export privacy, reset transaction, window singleton, focus restoration, dark mode, 200% text, keyboard navigation, and companion live application. Packaged tests verify auto-launch and always-on-top on each supported OS.

# Edge Cases

- **Settings opened twice:** Focus the existing window; do not create a second renderer or independent form state.
- **Snapshot load fails:** Attempt repository recovery/defaults. Show a load error only if a usable snapshot cannot be established; keep companion fallback Idle.
- **Two renderers update simultaneously:** Revision check serializes updates and returns the latest snapshot to the loser.
- **Window closes during save:** Main-process operation completes or rolls back independently; next open shows authoritative state.
- **Invalid slider value from IPC:** Main process rejects it even if UI validation was bypassed.
- **Scale unavailable on current display:** Show valid values and preserve the nearest crisp effective scale; do not bilinearly resize.
- **Scale would put character off-screen:** Keep ground point when possible and minimally clamp the reachable grab region.
- **Auto-launch permission denied:** Restore prior switch state and show an inline error.
- **Always-on-top application fails:** Keep window usable, restore authoritative value, and report failure.
- **Reminder disabled while card visible:** Remove card and schedule immediately through the feature's defined disable transition.
- **Interval shortened past elapsed time:** Apply the feature's five-minute minimum before a new deadline.
- **Import file is malformed or too large:** Reject before preview and make no changes.
- **Import schema is newer:** Explain incompatibility; do not partially import known fields.
- **Import contains unknown fields:** Reject with a field summary rather than silently accepting unintended data.
- **Import platform setting cannot apply:** Fail the transaction or show an explicit partial-compatibility preview before application; baseline behavior is transaction failure.
- **Export target exists:** Use native overwrite confirmation and atomic replace.
- **File dialog canceled:** Return silently with focus on the initiating button.
- **Reset persistence fails:** Keep the previous authoritative snapshot and allow retry; do not claim defaults are active.
- **System theme changes:** Retheme without losing drafts or focus.
- **Developer mode is disabled while overlay is visible:** Remove overlay, ring-buffer view, and preview controls immediately.
- **App quits during write:** Atomic file semantics leave either the previous or new complete document; recovery validates on next launch.

# Acceptance Criteria

- [ ] Settings opens as one accessible single-instance window and restores focus when reopened.
- [ ] The section order is Companion, Reminders, Window and startup, Data, Developer mode.
- [ ] Scale provides crisp supported integer values and keeps the companion reachable when applied.
- [ ] Animation speed accepts 0.75×–1.5× in 0.05× steps and affects only authored character clips.
- [ ] Water defaults to enabled/45 minutes and Stretch to enabled/60 minutes, with 15–240 minute valid intervals.
- [ ] Always on top applies to the companion window and persists.
- [ ] Start at login uses a platform adapter and accurately reports applied or failed state.
- [ ] Developer mode shows only sanitized bounded diagnostics and does not affect runtime scheduling.
- [ ] Every accepted change is validated, atomically persisted, revisioned, and broadcast to both renderers.
- [ ] Stale revisions, validation failures, persistence failures, and platform failures preserve a coherent authoritative state.
- [ ] Import uses a native file dialog, validates complete schema, previews changes, and applies as one transaction.
- [ ] Export uses a native save dialog and excludes revision, paths, deadlines, activity, event, lifecycle, and diagnostic data.
- [ ] Reset requires confirmation, uses shared defaults, preserves position in V1, clears pending reminders, and applies atomically.
- [ ] Settings supports keyboard operation, visible focus, screen readers, 200% text scaling, dark mode, and reduced motion.
- [ ] Closing Settings disposes renderer subscriptions and never stops the companion.
- [ ] Unit, component, IPC, persistence-recovery, packaged platform, accessibility, and import/export security tests pass.

# Future Improvements

- Add a dedicated reduced-motion setting that can override the system preference once product behavior is defined across every animation.
- Add settings search only when the number of controls makes the fixed five-section layout difficult to scan.
- Add per-integration lifecycle enablement when multiple generation adapters ship.
- Add a sanitized “Copy diagnostics” export with explicit contents and retention rules, separate from user settings export.
