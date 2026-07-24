# Overview

## Purpose

Water Reminder provides a quiet hydration prompt during long sessions. It schedules from a user-configurable interval, defaults to 45 minutes, presents a short Ducky animation and speech bubble, offers Dismiss and Snooze, and always resolves to Idle.

## User story

As a developer who loses track of time, I receive an occasional, gentle reminder to drink water that I can dismiss or snooze without leaving my current application or being interrupted by sound or focus changes.

## Goals

- Schedule hydration reminders every 45 minutes by default.
- Respect enablement, user interval, application sleep, quiet state priority, and prior actions.
- Present one short character animation and an attached reminder bubble.
- Provide clear Dismiss and Snooze actions without stealing focus.
- Define consistent deadlines across relaunch, suspend, and clock changes.
- Prevent duplicates, reminder stacking, and rapid catch-up behavior.
- Return the character and all temporary UI to Idle after resolution.

## Non goals

- Measuring water intake, health status, bottles, cups, or compliance.
- Requiring confirmation that the user drank water.
- Issuing native operating-system notifications, sound, badges, or repeated alarms.
- Using urgent medical language or adapting intervals from personal health data.
- Displaying more than one water reminder at a time.

# User Experience

Forty-five minutes after the last resolved water reminder—or after the scheduling baseline established at first launch—Ducky waits for an appropriate quiet moment. It performs a small attention animation, such as a short hop and wave, then opens a speech bubble reading “Drink Water!” with a droplet icon.

The bubble presents Dismiss and Snooze. It appears beside Ducky, stays within the current display, and does not take focus from the user's editor or terminal. No native notification, sound, dock bounce, taskbar flash, or full-screen overlay is used.

Dismiss closes the bubble, lets Ducky complete a brief recovery pose, and schedules the next water reminder from the dismissal time using the configured interval. Snooze performs the same visual cleanup but schedules this reminder for 10 minutes later. Snoozing does not change the configured 45-minute interval.

If the user does not interact, the card remains available without pulsing or repeating the entrance animation. The character settles into a low-motion reminder hold. After five minutes with no action, the presentation closes quietly and is treated as a dismiss for scheduling purposes; it does not reopen immediately.

If the reminder becomes due during Drag, Thinking, Celebrate, Landing, or another reminder, it waits. It is shown only after a quiet separation period when higher-priority behavior finishes. Typing can delay initial presentation briefly so the bubble does not appear in the middle of an active burst.

# Behavior

1. On settings readiness, load `waterReminder.enabled`, `waterReminder.intervalMinutes`, persisted `nextDueAt`, and any valid snooze deadline.
2. If enabled and no valid deadline exists, set the deadline to the current wall-clock time plus the configured interval. Persist it.
3. Use wall-clock UTC for persisted deadlines and a monotonic timer for the current process wait. Recalculate the timer after resume, significant clock change, or settings update.
4. When the deadline becomes due, publish `reminder.water_due` once with a unique occurrence ID. Mark it `pending`; do not immediately advance the regular schedule.
5. The Behavior Engine grants `WaterReminder` only when no higher-priority behavior is active and the reminder separation guard permits it. Default quiet separation is 30 seconds after another reminder and 500 ms after Drag/Landing.
6. On entry, play the attention phase. Reveal the bubble at the authored marker and expose Dismiss and Snooze actions.
7. After entry, transition to a low-motion hold. Do not replay the hop, wave, or bubble pop.
8. On Dismiss, atomically mark the occurrence resolved, compute `nextDueAt = actionTime + interval`, persist it, disable controls, play the exit, and return to Idle.
9. On Snooze, atomically mark the occurrence snoozed, compute `nextDueAt = actionTime + 10 minutes`, retain the regular interval setting, persist, play the exit, and return to Idle.
10. On five-minute presentation timeout, resolve with reason `timed_out`, schedule from timeout time plus the configured interval, close quietly, and return to Idle.
11. If the reminder is interrupted by Drag, hide the bubble and pause the presentation timeout. Restore the same occurrence after Landing if unresolved.
12. If Water Reminder is disabled while pending or visible, resolve it with reason `disabled`, remove its UI immediately, cancel deadlines, and return to Idle without scheduling another occurrence.

Action handling is idempotent. The first accepted Dismiss, Snooze, timeout, disable, or reset wins. Controls disable immediately after activation so double clicks cannot produce multiple deadlines.

Changing the interval while no reminder is due recalculates the next deadline from the last resolution timestamp, clamped to at least five minutes from now to avoid an immediate surprise. If a reminder is already pending or visible, the current occurrence remains; the new interval applies after it resolves.

# Animation

The reminder uses an authored attention sequence, bubble reveal, still hold, and recovery.

| Phase | Frames idea | Duration |
| --- | --- | ---: |
| Anticipation | Small crouch and glance | 2–3 frames / 100–160 ms |
| Attention | Short hop and one wave | 5–7 frames / 320–480 ms |
| Bubble reveal | Tail-first pixel pop at wave apex/landing | 2–3 frames / 120–160 ms |
| Hold | Friendly standing pose, occasional blink | Static with low-frequency blink |
| Dismiss/Snooze exit | Bubble closes, hand lowers | 3–5 frames / 180–280 ms |
| Return | Neutral standing frame | Immediate transition to Idle |

The hop is small and has one landing. It does not reuse Agent Done's full celebration, spin, or sparkles. The wave occurs once. The bubble opens on an animation marker so its tail is anchored to the correct frame.

While waiting for user action, the reminder does not loop the attention animation. A blink may occur every 5–9 seconds using reminder-pose frames. The bubble and controls remain static. The ticker sleeps between blinks and input changes.

Dismiss and Snooze share the same exit animation; action semantics are communicated by the control and scheduling result rather than separate character theatrics. Timeout uses a shorter quiet bubble-close and neutral recovery.

Animation-speed settings affect authored phases but do not alter reminder interval, snooze duration, display timeout, or quiet separation. Reduced motion removes the hop: Ducky raises one hand, the droplet bubble appears, and exit returns through a two-frame pose.

# State Flow

```text
Disabled
  -> Scheduled          when enabled with a valid next deadline
Scheduled
  -> Pending            when nextDueAt is reached
Pending
  -> Presenting.Entry   when Behavior Engine grants WaterReminder
Presenting.Entry
  -> Presenting.Hold    after bubble reveal and entry completion
Presenting.Hold
  -> ResolvingDismiss   on Dismiss
Presenting.Hold
  -> ResolvingSnooze    on Snooze
Presenting.Hold
  -> ResolvingTimeout   after five minutes visible
Any presenting phase
  -> Interrupted        on Drag
Interrupted
  -> Presenting.Hold    after Landing if still unresolved
Any pending/presenting phase
  -> Disabled           when setting is disabled
ResolvingDismiss
  -> Scheduled + Idle   after persistence and exit
ResolvingSnooze
  -> Scheduled + Idle   after persistence and exit
ResolvingTimeout
  -> Scheduled + Idle   after persistence and exit
```

Reminder scheduling state is separate from the top-level character state. `Scheduled`, `Pending`, and `Interrupted` can exist while the character performs other behaviors. The top-level state becomes `WaterReminder` only during presentation.

If Stretch Reminder is also pending, the earlier due timestamp wins. When it resolves, the other reminder waits at least 30 seconds and rechecks state eligibility. A pending reminder never displaces a visible reminder.

If a settings reset occurs, current UI closes, default enablement and 45-minute interval are applied, and a new baseline is scheduled from reset completion. It does not immediately display a water reminder.

# Technical Design

`ReminderScheduler` is a shared service with feature-specific policies. It runs in the main process because deadlines must survive renderer recreation and settings-window closure. Persisted data for water includes:

```ts
type WaterReminderSchedule = {
  readonly enabled: boolean;
  readonly intervalMinutes: number;
  readonly lastResolvedAt: string | null;
  readonly nextDueAt: string | null;
  readonly pendingOccurrenceId: string | null;
  readonly scheduleRevision: number;
};
```

An occurrence ID is generated when a deadline crosses due. Persistence occurs before the due event is broadcast, preventing duplicate events if the companion renderer reloads. Renderer acknowledgement includes the occurrence ID and current schedule revision. Stale or duplicate actions receive the authoritative schedule without mutation.

Required events and commands:

| Contract | Direction | Purpose |
| --- | --- | --- |
| `reminder.water_due` | Main to renderer | Announce one pending occurrence |
| `reminder.water_presented` | Renderer to main | Start presentation timeout accounting |
| `reminder.water_dismiss` | Renderer to main | Resolve and schedule regular interval |
| `reminder.water_snooze` | Renderer to main | Resolve and schedule 10-minute snooze |
| `reminder.water_resolved` | Main to renderers | Broadcast accepted schedule snapshot |
| `settings.changed` | Main to renderers | Apply enablement or interval update |

The main process validates interval range 15–240 minutes and snooze policy. The renderer cannot submit arbitrary deadlines. Snooze is a named action whose 10-minute duration comes from shared configuration.

At process startup or resume, calculate whether `nextDueAt` is in the past. Do not replay elapsed occurrences. Create or preserve one pending occurrence, wait a 60-second startup/resume grace period, then apply behavior eligibility. If the user was away long enough for both reminders to be overdue, ordering uses stored deadlines.

Wall-clock changes greater than one minute trigger deadline reconciliation. A backward clock change preserves the remaining monotonic duration for the current session within a reasonable bound. A forward change may make one occurrence due but never more than one. All persisted timestamps are ISO 8601 UTC.

`WaterReminderBehavior` owns presentation assets, bubble, semantic controls, animation markers, and interruption cleanup. Control actions call preload commands and wait for authoritative acceptance; visual controls disable immediately, and persistence failure restores them with an inline bubble-safe error state or closes and reports in Settings according to UI policy.

The bubble uses a Pixi frame with live accessible controls through the companion semantic layer. Pointer events stop before Drag hit testing. If focus cannot safely move into the companion without interrupting the user's application, the same active reminder actions are available in Settings.

The scheduler uses one wake timer for the nearest reminder deadline, not one interval timer per feature. Tests use fake wall and monotonic clocks. Coverage includes launch, resume, clock change, interval edit, double action, renderer reload, competing reminder deadlines, and persistence failure. Performance validation confirms no polling loop.

# Edge Cases

- **Application launches with an overdue deadline:** Preserve one pending occurrence, wait the startup grace period, then present when eligible.
- **Computer sleeps through multiple intervals:** Show at most one reminder after resume; never replay missed reminders.
- **Clock moves forward:** One occurrence may become due. Do not produce duplicates.
- **Clock moves backward:** Preserve reasonable remaining duration for the running session and update persisted UTC deadline.
- **Both reminders due:** Earlier stored deadline presents first; the other waits at least 30 seconds.
- **User double-clicks Dismiss:** First idempotent action wins; controls are already disabled for the second.
- **Dismiss and Snooze race:** Main-process occurrence revision accepts exactly one.
- **Persistence fails:** Do not silently lose the occurrence. Keep or restore actions and report a recoverable settings error.
- **Renderer reloads while visible:** Main process retains pending occurrence; renderer reconstructs one hold presentation without replaying the attention hop.
- **Drag starts while bubble is open:** Hide presentation, pause its visible timeout, then restore after Landing.
- **Thinking starts while visible:** Thinking does not normally interrupt an already presented reminder under baseline rules; if product priority does, preserve occurrence and restore it afterward.
- **Typing is active when due:** Wait for inactivity and a short quiet boundary; do not expire while still pending.
- **User disables Water Reminder:** Cancel pending/visible occurrence and deadline immediately; no exit flourish is required.
- **Interval changes while visible:** Resolve current occurrence using the new interval only after action, as specified.
- **No room for bubble:** Use shared edge-aware placement; never split actions across displays.
- **Bubble asset missing:** Use a minimal accessible reminder card with droplet icon and controls; character remains in a core pose.
- **Reminder animation missing:** Show the bubble from Idle without blocking the action.
- **Five-minute timeout while pointer hovers controls:** Pause timeout during active hover/focus, then resume remaining time.
- **Reduced motion:** Use hand raise and static card; scheduling semantics remain identical.

# Acceptance Criteria

- [ ] Water Reminder is enabled by default and initially scheduled for 45 minutes.
- [ ] Settings accept intervals from 15 to 240 minutes in five-minute increments.
- [ ] A due occurrence is persisted and emitted exactly once, including across renderer reload.
- [ ] The reminder waits for an eligible quiet state and does not interrupt Drag, Landing, Thinking, Celebrate, or another reminder.
- [ ] Presentation includes a short water-specific animation, droplet bubble, “Drink Water!”, Dismiss, and Snooze.
- [ ] No sound, native notification, focus theft, dock/taskbar flash, badge, or repeated entrance animation occurs.
- [ ] Dismiss schedules the next occurrence from action time using the configured interval.
- [ ] Snooze schedules the next occurrence exactly 10 minutes later without changing the interval setting.
- [ ] Five minutes of no interaction closes quietly and schedules from timeout time.
- [ ] Sleep, resume, relaunch, and clock changes produce at most one overdue occurrence.
- [ ] Competing reminders are serialized with at least 30 seconds separation.
- [ ] Drag interruption preserves the unresolved occurrence and restores it after Landing.
- [ ] Disable and reset cancel current presentation and apply the correct scheduling baseline.
- [ ] Every resolution path removes UI, disposes timers and listeners, normalizes animation, and returns to Idle.
- [ ] The scheduler uses a deadline timer rather than polling and remains inside idle CPU budgets.
- [ ] Fake-clock, IPC revision, accessibility, visual, interruption, and packaged-relaunch tests pass.

# Future Improvements

- Add a small set of fixed snooze choices in the reminder card if user testing shows that 10 minutes is insufficient; choices must remain bounded and keyboard accessible.
- Add a reminder-history summary containing only resolution timestamps and actions if users need scheduling diagnostics, with an explicit retention limit.
- Add alternate water animation variants selected with long cooldowns so repeated daily reminders remain fresh without becoming more prominent.
- Add optional operating-system Do Not Disturb awareness when reliable platform APIs are available, while preserving the no-native-notification policy.
