# Overview

## Purpose

Typing translates keyboard activity into a quiet “keyboard kneading” animation: Ducky alternates its feet over small pixel keys while the user types. The feature reacts to activity cadence only. It never records which keys were pressed or the text being entered.

## User story

As a developer typing in any application, I see Ducky begin alternating its feet in rhythm with my activity and settle back to Idle shortly after I stop, including during short pauses and burst typing.

## Goals

- Detect keyboard activity without collecting key values, text, shortcuts, or application content.
- Start quickly enough to feel connected to typing while filtering isolated key presses.
- Alternate left and right foot contacts consistently.
- Remain active across natural gaps inside a typing burst.
- Increase the visual cadence within a bounded range for faster activity.
- Stop smoothly after typing becomes inactive and return to Idle.
- Avoid per-key renderer work, event floods, and idle CPU cost.

## Non goals

- Displaying a real keyboard, key labels, words, code, typing speed scores, or productivity metrics.
- Matching an animation frame to every physical key event.
- Intercepting or modifying input.
- Reacting to mouse clicks, paste contents, accessibility announcements, or virtual keyboard text.
- Implementing Overheat mode in this feature; any later high-cadence behavior is a separate documented state.

# User Experience

Typing a single isolated key does not necessarily trigger a full animation. When two or more activity pulses arrive within a short activation window, Ducky transitions from Idle into a compact kneading pose. Two tiny neutral keyboard-key sprites appear under its feet. The left and right feet press in alternation, giving the impression that the character is helping with the work.

At an ordinary typing pace, the cycle is calm and readable. Faster bursts shorten the hold between contacts up to a defined maximum animation rate, but the character never panics, flashes, produces steam, or becomes noisy. Short pauses—such as thinking between words or using a shortcut—keep the pose ready so the next burst continues without restarting.

After keyboard activity stops, Ducky completes the current half-step so both feet do not snap midair. The key props retract, the body returns through a short recovery pose, and the state becomes Idle. Total stop latency balances responsiveness with burst support: the default inactivity threshold is 650 ms, followed by at most one half-cycle and a 120–180 ms recovery.

Typing never creates a speech bubble, notification, sound, counter, or settings prompt. Direct Drag interrupts it. Thinking, reminders, and Celebrate follow the global priority rules. If Typing is preempted, key props disappear during the exit transition and do not remain on screen.

# Behavior

1. The platform keyboard activity adapter observes input edges and reduces them to anonymous timestamps. It does not send scan codes, key codes, modifiers, focused application, or text.
2. The adapter aggregates activity into 100 ms buckets and publishes `input.keyboard_activity` with a monotonic timestamp and bounded count.
3. The Typing controller maintains a rolling 1,000 ms activity window and the last activity time.
4. From `Idle`, one bucket arms the feature. A second pulse within 350 ms or a bucket count of at least two publishes `input.typing_started`.
5. The Behavior Engine requests `Typing` if no higher-priority state is active. If blocked, it retains only current activity facts; it does not queue a stale start animation.
6. On entry, the animation plays a 100–160 ms setup pose that lowers the body and reveals the two key props.
7. The loop alternates left contact, center transfer, right contact, and center transfer. `nextFoot` persists across loop boundaries so the same foot never presses twice accidentally.
8. Each activity bucket updates a smoothed cadence estimate. The animation engine maps the estimate to 8–14 authored frames per second or equivalent phase durations, clamped by the user's animation-speed setting.
9. While activity gaps are below 650 ms, remain in `Typing`. The loop continues at its recently smoothed cadence but decays toward the calm rate rather than stopping and starting.
10. At 650 ms without activity, set `stopRequested`. Complete the current contact and return to the neutral transfer frame.
11. Play recovery, remove key props on its marker, emit `animation.completed`, and transition to `Idle`.
12. If new activity arrives during recovery before the props are removed, cancel recovery at a safe marker and resume with the opposite foot. If activity arrives after removal, it must satisfy activation again.

Activity during a higher-priority state is not replayed as historical typing. If the state returns to Idle and the latest pulse is less than 350 ms old, the controller may start from current activity. Otherwise it remains Idle.

The cadence estimate is deliberately coarse. Counts above the defined saturation threshold map to the same maximum visual speed. This limits motion and reduces any risk that diagnostics could reveal detailed typing patterns.

# Animation

The baseline clip uses authored body and foot poses plus separate key sprites attached to the ground plane.

| Phase | Frames idea | Duration |
| --- | --- | ---: |
| Setup | Idle, crouch, keys appear, ready | 3–4 frames / 100–160 ms |
| Left press | Weight left, left key down | 2–3 frames / 90–150 ms |
| Transfer | Centered body, both keys up | 1–2 frames / 50–90 ms |
| Right press | Weight right, right key down | 2–3 frames / 90–150 ms |
| Transfer | Centered body, both keys up | 1–2 frames / 50–90 ms |
| Recovery | Keys retract, body rises, Idle | 3–4 frames / 120–180 ms |

The cycle must clearly alternate even at 1× scale. A key moves down by one logical pixel exactly when its corresponding foot contact marker fires. The other key remains up. The body's center shifts at most one or two logical pixels. Facial expression stays focused and pleasant.

Nominal playback is 12 FPS. Cadence modulation changes phase hold duration rather than skipping contact poses. The minimum full left-right cycle is approximately 420 ms; the maximum is approximately 760 ms before applying the user's global animation speed. The final configured rate must remain within a readable 8–14 FPS range.

Setup can enter only from a stable Idle-compatible frame. When interrupted, an `typing_exit_fast` clip uses the nearest transfer pose, removes props within 80 ms, and normalizes the ground pivot. It does not force the higher-priority state to wait beyond that cleanup marker.

Reduced motion uses the same state and timing but replaces body shifts with alternating one-pixel key presses and minimal foot changes. It does not run a continuous body bounce.

# State Flow

```text
Inactive
  -> Armed             on first activity pulse
Armed
  -> Inactive          if 350 ms activation window expires
Armed
  -> StartRequested    on qualifying additional activity
StartRequested
  -> Typing.Setup      when Behavior Engine grants Typing
Typing.Setup
  -> Typing.Left       after setup completion
Typing.Left
  -> Typing.Transfer   on left contact completion
Typing.Transfer
  -> Typing.Right      if active and nextFoot is right
Typing.Right
  -> Typing.Transfer   on right contact completion
Typing.Transfer
  -> Typing.Left       if active and nextFoot is left
Any Typing loop phase
  -> Typing.Recovery   after inactivity threshold at a safe boundary
Typing.Recovery
  -> Typing loop       on renewed activity before prop-removal marker
Typing.Recovery
  -> Idle              on completion
Any Typing phase
  -> higher state      when interrupted by Drag or another permitted priority
```

`Armed` and cadence tracking are feature-controller substates; the top-level companion remains `Idle` until `Typing.Setup`. On interruption, the top-level transition executes the Typing exit effect first: stop cadence loop, remove props, cancel inactivity timer, and preserve only the latest anonymous activity timestamp.

Returning from a reminder, Thinking, Celebrate, Drag, or Landing reevaluates current activity. No preempted kneading animation is resumed from an old foot pose.

# Technical Design

Global keyboard activity is a privileged platform concern and remains in the Electron main process behind `KeyboardActivityAdapter`. The adapter's public contract is intentionally lossy:

```ts
type KeyboardActivityEvent = {
  readonly type: 'input.keyboard_activity';
  readonly atMs: number;
  readonly activityCount: number; // clamped 1–8 per 100 ms bucket
};
```

Raw event fields are discarded before entering the application event bus. Logs and developer diagnostics show only active/inactive status, smoothed cadence band (`calm`, `steady`, `fast`), and sample age. They never show bucket-by-bucket histories longer than needed for the rolling calculation.

The adapter publishes an explicit `input.keyboard_unavailable` when monitoring cannot run. The companion remains functional and the Typing feature stays disabled for the session. No repeated permission notification is shown; a settings diagnostic may explain the unavailable integration.

`TypingController` owns activation, activity window, smoothed cadence, foot alternation, and inactivity deadline. Monotonic timers run through the Behavior Engine scheduler. It publishes `input.typing_started`, `input.typing_cadence_changed`, and `input.typing_stopped`; animation code does not inspect activity events directly.

Cadence can use an exponential moving average over bounded bucket counts with a 400–600 ms response window. Map the average to three or a few continuous playback bands. Enforce hysteresis between bands so irregular typing does not speed up and slow down every bucket.

The animation entry owns key-prop display objects acquired from a small pool. Markers `keys_show`, `left_contact`, `right_contact`, `safe_exit`, and `keys_hide` coordinate props and exit behavior. `keys_hide` must run in exit cleanup even when the animation completion callback is lost.

Zustand stores only top-level `Typing` status and optional developer cadence band. Per-bucket samples, timers, frame, and next foot stay in the controller. The renderer ticker is already active for the animation; input buckets must not schedule additional redundant frames.

Tests use synthetic anonymous timestamps. Unit tests cover activation filtering, burst gaps, stop deadline, cadence hysteresis, alternating feet, saturation, and preemption. Integration tests assert that a stream of activity produces one state entry and one exit, not one transition per key. Privacy contract tests reject payloads containing key or text fields. Performance tests validate bounded event rate and listener cleanup.

# Edge Cases

- **One isolated key:** Arm and expire without entering Typing.
- **Two rapid keys:** Enter Typing once and begin with the configured first foot.
- **Burst pause under 650 ms:** Stay in the loop; decay cadence but do not run recovery.
- **Activity exactly at the stop deadline:** Event ordering uses timestamps; a pulse at or before the deadline keeps Typing active.
- **Activity during early recovery:** Resume from a safe transfer pose with the opposite foot.
- **Activity after keys are hidden:** Finish Idle transition and require normal activation.
- **Key auto-repeat:** Treat pulses as activity but clamp bucket count so held input cannot force unbounded cadence.
- **Modifier-only shortcuts:** Adapter may count anonymous activity; no modifier identity crosses the boundary.
- **Input method editor:** Observe activity only if the platform adapter can do so without text access. Never inspect composition content.
- **Remote desktop or virtual keyboard:** If surfaced as platform activity, use the same anonymous path. Do not add content-specific handling.
- **Monitoring permission absent:** Disable Typing silently and expose one diagnostic status.
- **Application suspend:** Clear rolling activity and timers. Do not enter Typing on resume until new activity occurs.
- **Typing starts during Thinking:** Maintain only current activity facts. Thinking retains priority.
- **Thinking starts during Typing:** Run fast exit cleanup and enter Thinking; keys cannot remain visible.
- **Drag starts during a foot contact:** Remove props and transfer immediately; direct manipulation has priority.
- **Reminder becomes due:** The scheduler applies its defined priority and quiet-delay rules without corrupting foot alternation.
- **Animation asset missing:** Use no Typing behavior rather than showing partial keys; return or remain Idle.
- **Frame stall:** Cadence uses event timestamps, and animation delta is clamped; do not fast-forward multiple foot contacts invisibly.

# Acceptance Criteria

- [ ] Keyboard data entering the event bus contains only a timestamp and clamped activity count.
- [ ] No key code, modifier, text, focused application, or document content is stored, logged, or exposed in diagnostics.
- [ ] One isolated activity pulse does not start the full kneading animation.
- [ ] Qualifying burst activity begins visual response within 50 ms of the accepted start request.
- [ ] Left and right contacts alternate for every completed cycle, including after short burst pauses.
- [ ] Key sprites move exactly with their associated contact markers and never remain after exit.
- [ ] Gaps shorter than 650 ms preserve Typing; longer inactivity requests a safe recovery.
- [ ] Stop completes the current half-step and returns to Idle without a mid-pose snap.
- [ ] Renewed activity during early recovery can resume without replaying full setup.
- [ ] Cadence stays within the approved visual range and saturates for extremely fast activity.
- [ ] Higher-priority states interrupt Typing through bounded cleanup and do not replay stale activity.
- [ ] Suspension clears activity history and requires new input after resume.
- [ ] Reduced motion retains alternating feedback without continuous body bounce.
- [ ] Event aggregation, controller state, props, and subscriptions remain bounded after repeated typing sessions.
- [ ] Unit, privacy contract, integration, visual, and performance tests pass.

# Future Improvements

- Add a separately specified Overheat behavior with its own opt-in thresholds, assets, priority, and recovery, without increasing the information collected from keyboard activity.
- Add alternative kneading clips for seated or sleepy idle pose families once those base states exist.
- Calibrate activation and inactivity timing from usability testing while preserving the anonymous bucket contract.
- Add an accessibility setting to disable global activity reactions independently from reminder features.
