# Overview

## Purpose

Stretch Reminder provides a quiet movement prompt once per hour by having Ducky stretch, yawn, and show a brief speech bubble. It is a wellness cue, not a compliance tracker. The user can dismiss it immediately, and every outcome returns the companion to Idle.

## User story

As a developer in a long work session, I receive a subtle hourly cue to change posture or stretch without losing focus, hearing a sound, or handling an operating-system notification.

## Goals

- Schedule Stretch Reminder every 60 minutes by default.
- Wait for a quiet, eligible character state before presenting.
- Show a recognizable arms-up stretch, yawn, and short “Time to stretch.” bubble.
- Provide a clear Dismiss action.
- Avoid stacking with Water Reminder or replaying missed intervals after sleep.
- Maintain reliable deadlines across relaunch and settings changes.
- Clean up the card, timers, and animation on every exit path.

## Non goals

- Providing exercise instructions, medical guidance, posture detection, or movement tracking.
- Asking the user to confirm completion or recording whether they stretched.
- Offering Snooze in the V1 Stretch Reminder card.
- Playing sound, sending native notifications, or repeating the animation until acknowledged.
- Interrupting direct manipulation, active generation status, or celebration.

# User Experience

After one hour, Ducky waits until the user is not dragging it and no higher-priority character action is running. It plants its feet, raises both arms, performs a large but contained stretch, and yawns. Near the end of the stretch, a small speech bubble appears with “Time to stretch!” and a Dismiss action.

The animation happens once. Afterward Ducky holds a comfortable stretched-or-relaxed pose with only occasional blinking. The card remains attached to the character and does not take focus from the active application. The reminder does not flash, bounce repeatedly, play sound, or appear through the operating-system notification center.

Dismiss closes the bubble and transitions through a relaxed recovery into Idle. The next reminder is scheduled from the dismissal time using the current interval. If the user ignores the reminder for five minutes, it closes quietly, returns to Idle, and schedules from the timeout time.

If Water Reminder is due at the same time, only the earlier deadline is shown. The other reminder waits at least 30 seconds after resolution. If Stretch Reminder is interrupted by a direct drag, its bubble hides and the unresolved occurrence can return after Landing without replaying the full stretch.

# Behavior

1. Load enablement, interval, last resolution, next deadline, pending occurrence, and schedule revision from the main-process settings repository.
2. The default is enabled with a 60-minute interval. If no valid deadline exists, establish one from settings readiness plus the interval and persist it.
3. Use a persisted UTC deadline and a monotonic in-process wake timer. Reconcile after application resume, relaunch, significant clock change, or interval update.
4. When the deadline crosses due, create and persist one unique occurrence, then publish `reminder.stretch_due`.
5. The shared Reminder Scheduler compares due timestamps across reminder types. It requests Stretch presentation only when this occurrence is first in line and Behavior Engine guards allow it.
6. Typing activity may delay presentation until the 650 ms inactivity boundary plus a small quiet delay. Drag, Landing, Thinking, Celebrate, and Water Reminder block presentation.
7. On state entry, play anticipation, full-body stretch, and yawn. Reveal the bubble at the specified marker near the settled end pose.
8. Enable Dismiss only after the bubble is visible. Until then, a request from the alternate Settings surface is accepted and resolves the occurrence without forcing the remaining animation.
9. After entry completes, hold the reminder pose without replaying stretch or yawn.
10. On Dismiss, disable the action, submit the occurrence ID and revision, persist `lastResolvedAt`, calculate `nextDueAt = actionTime + interval`, play recovery, and return to Idle.
11. After five minutes of visible hold, resolve with `timed_out`, schedule from timeout time, close quietly, and return to Idle.
12. On Drag, preserve the occurrence, hide the bubble, pause visible-timeout accounting, and exit the pose quickly. After Landing, restore the bubble in the hold pose following a 500 ms quiet delay if the occurrence remains eligible.
13. When disabled, cancel pending or visible work, clear the deadline, remove UI, and return to Idle.

Changing the interval while scheduled recomputes from the last resolution time, with a minimum of five minutes before the new deadline. Changing the interval during a visible occurrence leaves the occurrence in place; the accepted value applies when it resolves.

Reset Settings closes any active Stretch Reminder, applies the default 60-minute interval and enabled state, and schedules a fresh occurrence 60 minutes from reset completion. Reset never creates an immediate wellness prompt.

# Animation

Stretch Reminder is longer and slower than Water Reminder but still completes its active entrance in under two seconds.

| Phase | Frames idea | Duration |
| --- | --- | ---: |
| Plant | Feet widen, body settles | 2–3 frames / 120–180 ms |
| Arms rise | Hands lift above head, torso lengthens | 3–4 frames / 220–320 ms |
| Full stretch | Maximum authored extension and slight sway | 3–5 frames / 350–550 ms |
| Yawn | Beak opens, eyes narrow/close, small `…` or yawn mark if art requires | 4–6 frames / 420–650 ms |
| Bubble reveal | Tail-first bubble pop near relaxed end pose | 2–3 frames / 120–160 ms |
| Hold | Relaxed arms or hands-on-head pose | Static with occasional blink |
| Recovery | Arms lower, posture overshoots softly, Idle | 4–6 frames / 260–420 ms |

The full stretch increases the vertical silhouette through authored frames rather than large procedural scale. A maximum one-pixel upward body translation may support the pose. Feet remain on a stable ground line. The yawn is visual only: no audio, text transcription, or looping mouth motion.

The bubble appears only after the main stretch and yawn communicate the reminder. If the state is interrupted before reveal, no one-frame bubble is shown. If dismissed during hold, bubble closure and arm-lowering recovery run together where the assets permit.

Hold blinks occur every 5–9 seconds. No yawn repeats. The ticker sleeps between blinks. Animation-speed settings affect authored phase timing within bounds but not the hourly interval, queue separation, or five-minute timeout.

Reduced motion uses a short arms-up pose, a single closed-eye yawn frame, and direct bubble reveal. It removes sway and recovery overshoot while preserving the semantic sequence.

# State Flow

```text
Disabled
  -> Scheduled           when enabled
Scheduled
  -> Pending             when nextDueAt is reached
Pending
  -> Stretch.Entry       when scheduler and Behavior Engine grant presentation
Stretch.Entry
  -> Stretch.Hold        after stretch, yawn, and bubble reveal
Stretch.Hold
  -> Stretch.Resolve     on Dismiss
Stretch.Hold
  -> Stretch.Timeout     after five visible minutes
Stretch.Entry/Hold
  -> Interrupted         on Drag
Interrupted
  -> Stretch.Hold        after Landing if unresolved
Any pending/active phase
  -> Disabled            when the feature is disabled
Stretch.Resolve
  -> Scheduled + Idle    after accepted persistence and recovery
Stretch.Timeout
  -> Scheduled + Idle    after accepted persistence and quiet close
```

Scheduling substates do not occupy the top-level companion state. The top-level state is `StretchReminder` only from Entry through resolution/timeout/interrupt cleanup.

Water and Stretch share a queue but retain distinct occurrence IDs and deadlines. The scheduler never merges them into one card. If a Water Reminder becomes due while Stretch is visible, Water becomes pending and waits. If a higher-priority completion reaction is requested before Stretch starts, Stretch remains pending.

Failure or cancellation of the animation does not cancel the occurrence. The feature falls back to an accessible bubble presentation from Idle. Failure to render both animation and bubble resolves quietly only after recording a diagnostic error; it must not trap the character outside Idle.

# Technical Design

Stretch uses the shared main-process `ReminderScheduler` and its single nearest-deadline wake timer. Feature policy provides default interval, allowed interval range, timeout, copy identifier, animation ID, priority, and action set.

```ts
type StretchReminderSchedule = {
  readonly enabled: boolean;
  readonly intervalMinutes: number;
  readonly lastResolvedAt: string | null;
  readonly nextDueAt: string | null;
  readonly pendingOccurrenceId: string | null;
  readonly scheduleRevision: number;
};
```

Required contracts:

| Contract | Direction | Purpose |
| --- | --- | --- |
| `reminder.stretch_due` | Main to renderer | Announce persisted occurrence |
| `reminder.stretch_presented` | Renderer to main | Mark the visible occurrence and timeout baseline |
| `reminder.stretch_dismiss` | Renderer to main | Resolve occurrence using regular interval |
| `reminder.stretch_timed_out` | Renderer/main scheduler | Resolve after presentation limit |
| `reminder.stretch_resolved` | Main to renderers | Broadcast authoritative schedule |
| `settings.changed` | Main to renderers | Apply enabled state and interval |

The renderer never provides an arbitrary `nextDueAt`; it submits a named action, occurrence ID, and last known revision. The main process validates that the occurrence is current, uses its own action timestamp, persists atomically, increments the revision, and broadcasts the accepted snapshot. Duplicate or stale dismissal is a no-op with the latest state returned.

On resume, overdue deadlines produce at most one pending occurrence per reminder type. The scheduler applies a 60-second grace period before any presentation and orders multiple pending reminders by original due time. Missed hourly intervals do not accumulate.

`StretchReminderBehavior` owns the animation instance, bubble display object, accessible Dismiss control, hold blink schedule, five-minute visible timer token, and interruption token. Cleanup is idempotent and invoked by state exit, disable, reset, renderer teardown, and asset failure.

The animation clip exposes `stretch_max`, `yawn_open`, `bubble_show`, `safe_interrupt`, and `recovery_complete` markers. Bubble placement uses shared attachment metadata and work-area collision. The live text and Dismiss control are not baked into the sprite.

The five-minute timeout counts only visible hold time. When interrupted by Drag or the application is suspended, remaining time is stored in memory for the occurrence. Relaunch reconstructs a pending occurrence but does not need to restore exact visible elapsed time; it applies a fresh presentation timeout after the resume grace period.

Tests share the reminder fake-clock harness and add feature-specific animation-marker assertions. Unit tests cover default interval, interval edit, timeout, idempotent dismissal, competition with Water, reset, disable, and resume. Integration tests cover direct drag interruption and fallback bubble. Visual tests verify full stretch bounds at each supported scale and display edge.

# Edge Cases

- **First launch:** Schedule 60 minutes from settings readiness; do not present immediately.
- **Overdue on launch or resume:** Preserve one occurrence, apply the 60-second grace period, and wait for state eligibility.
- **Multiple missed hours:** Never replay or count missed prompts.
- **Water and Stretch share the same due timestamp:** Use stable scheduler ordering, then the 30-second separation. The chosen tie-breaker must be deterministic.
- **User dismisses during bubble entry through Settings:** Accept the action, cancel remaining entry, and recover to Idle without flashing controls.
- **Double dismissal:** Main-process occurrence revision accepts one mutation.
- **No Snooze action:** Do not render an empty secondary button or map Dismiss to snooze semantics.
- **Drag during full stretch:** Jump to the nearest safe compact pose, hide any partial bubble, and begin Drag within the direct-manipulation latency budget.
- **Drag during hold:** Preserve and later restore the unresolved occurrence without replaying the stretch/yawn.
- **Typing continues for a long period:** Keep the occurrence pending. Present at the next quiet boundary; do not interrupt every burst.
- **Thinking begins before presentation:** Thinking wins. Stretch stays pending.
- **Agent Done occurs while pending:** Celebrate runs first; Stretch waits through the quiet separation.
- **Feature disabled while visible:** Remove card and pose immediately, cancel schedule, and return to Idle.
- **Interval shortened below elapsed time:** Clamp the recomputed deadline to at least five minutes from the settings action.
- **Clock adjustment:** Reconcile like Water Reminder and create at most one occurrence.
- **Monitor removed:** Reposition the companion/bubble safe bounds and keep Dismiss reachable.
- **Stretch sprite exceeds window bounds:** Expand the transparent window around a stable ground point before the frame renders.
- **Asset missing:** Fall back to the shared reminder bubble and core Idle pose.
- **Persistence failure:** Retain the unresolved occurrence and offer a retry through the accessible action or Settings; do not report success.
- **Application quit while visible:** Persist occurrence as pending; reconstruct after next launch grace period.

# Acceptance Criteria

- [ ] Stretch Reminder is enabled by default and initially scheduled every 60 minutes.
- [ ] The settings interval range is 15–240 minutes in five-minute increments.
- [ ] Presentation contains an authored arms-up stretch, visual yawn, “Time to stretch!” bubble, and Dismiss action.
- [ ] No Snooze action is shown in the V1 Stretch Reminder.
- [ ] The animation plays once and becomes a low-motion hold; stretch and yawn do not loop.
- [ ] The reminder never plays sound, uses a native notification, steals focus, flashes the app, or records user compliance.
- [ ] Due occurrences are persisted and deduplicated across renderer recreation, relaunch, and suspend.
- [ ] Overdue schedules create at most one occurrence after the startup/resume grace period.
- [ ] Drag, Landing, Thinking, Celebrate, and active Water Reminder block initial presentation.
- [ ] Water and Stretch reminders are serialized by due time with at least 30 seconds separation.
- [ ] Dismiss and timeout schedule the next reminder from resolution time using the configured interval.
- [ ] Direct Drag can interrupt any Stretch phase within the interaction latency budget.
- [ ] Interrupted presentation restores the unresolved hold without replaying the main animation.
- [ ] Disable and reset remove active UI and establish the documented deadline behavior.
- [ ] Every exit path removes the bubble and controls, disposes timers/listeners, normalizes the pose, and returns to Idle.
- [ ] Reduced motion communicates stretch and yawn without sway or overshoot.
- [ ] Fake-clock, scheduling, revision, interruption, accessibility, asset-fallback, and visual-boundary tests pass.

# Future Improvements

- Add two or three authored stretch variations chosen with long no-repeat windows, without increasing reminder frequency or card prominence.
- Add an optional fixed Snooze action if usability testing demonstrates a clear need; it must use the shared revision-safe scheduler contract.
- Add platform Do Not Disturb awareness when a reliable non-invasive signal is available.
- Add a settings preview action that demonstrates the stretch animation without altering real reminder deadlines.
