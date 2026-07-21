# Overview

## Purpose

Eye Follow makes PsyDuck acknowledge the pointer without moving its body or demanding attention. Only the pupils change position. The motion is continuous while the pointer is available, constrained by the drawn eye shape, and subordinate to every major behavior.

## User story

As a developer moving between windows and monitors, I see PsyDuck quietly look toward my cursor so the companion feels aware of the desktop while remaining still and unobtrusive.

## Goals

- Track the global cursor across the full virtual desktop, including negative monitor coordinates.
- Convert cursor direction into independent, bounded pupil offsets.
- Smooth target changes without visible lag, jitter, or overshoot.
- Preserve natural random blinking while tracking.
- Recenter the pupils when tracking data is unavailable or the cursor is no longer on an active display.
- Use negligible CPU when the cursor and pupils are stationary.

## Non goals

- Moving the head, beak, torso, window, or camera toward the cursor.
- Following clicks, window titles, application content, or pointer targets.
- Maintaining eye contact during authored facial poses that hide or replace the normal eyes.
- Using Eye Follow as a clickable affordance, gaze detector, or attention notification.
- Tracking the cursor while the application is suspended or the display is asleep.

# User Experience

When PsyDuck is Idle with its normal eyes visible, its pupils rest near the authored center points. Moving the cursor causes both pupils to glide toward it. The perceived direction matches the cursor from the character's face in screen space: a cursor above-left produces an above-left pupil offset even when it is on another monitor.

The movement is deliberately small. Eye whites, outline, face, and body remain unchanged. Each pupil stays entirely within its corresponding eye mask. Because the eyes are drawn at slightly different positions and may have different shapes, their final offsets can differ by one logical pixel while still indicating the same direction.

Small pointer movements near the direction boundary do not make the pupils flicker between pixels. Large moves, including crossing displays, settle quickly but smoothly. PsyDuck continues its ordinary blink cadence. A blink closes the eyes, temporarily hides the pupils, and reopens with the pupils already oriented toward the latest cursor position.

If the pointer becomes unavailable, no display contains its coordinates, the session locks, or cursor updates stop, the pupils ease to center and stop. There is no error bubble or visible notification.

Eye Follow is ambient. Drag, Typing, Thinking, reminders, Celebrate, and authored idle expressions may replace or suspend it. When the state returns to an eye-compatible Idle pose, tracking resumes from the current visual position without a one-frame snap.

# Behavior

1. After core assets load and the state machine enters `Idle`, the feature checks whether the active frame exposes `eyeLeft` and `eyeRight` attachment metadata.
2. The platform cursor adapter publishes global screen coordinates at no more than 30 Hz while the pointer is changing.
3. The renderer converts the center between both eye anchors from companion-local coordinates to virtual desktop coordinates.
4. It subtracts the eye center from the cursor position to produce a screen-space direction vector.
5. A small dead zone around the eye center maps to zero offset. This prevents motion when the pointer is visually aligned with the face.
6. The direction is normalized after dead-zone removal. Distance beyond the dead zone does not increase pupil travel; a pointer 200 px away and 2,000 px away can produce the same maximum offset.
7. The normalized direction is projected into each eye's allowed elliptical radius. The default horizontal radius is greater than the vertical radius, subject to final asset masks.
8. The target offset is quantized with hysteresis to stable logical-pixel destinations. The renderer interpolates the displayed position toward that target at render cadence.
9. If the cursor stops, interpolation finishes and the feature allows the ticker to sleep.
10. If cursor coordinates become invalid or stale for 500 ms, the target changes to center. Recenter uses the same smoothing and completes without a snap.

Blink behavior runs independently on a monotonic schedule. The next blink is randomly selected between 4 and 8 seconds after the previous blink completes. A blink request waits until the normal eye pose is visible and no major behavior owns the face. The sequence closes, holds briefly, and opens over authored frames. A blink does not reset the gaze target or count as a major behavior.

Eye Follow pauses immediately when entering any state whose animation declares `ownsEyes: true`. The last displayed pupil offset is retained internally but not rendered. On exit, the feature recomputes the target from the newest cursor sample; the first visible frame begins from center or the last compatible offset, then interpolates.

When the companion is being dragged, global cursor movement already drives the body. The normal pupils are hidden or fixed by the Drag art to prevent the gaze from vibrating against pointer sampling. During Landing, authored impact eyes take precedence. Eye Follow resumes only when the state machine confirms `Idle` and the active frame supports pupil attachments.

# Animation

Eye movement is procedural and layered over compatible authored character frames. It does not select a body animation clip.

## Gaze phases

| Phase | Duration | Visual |
| --- | ---: | --- |
| Acquire | 80–140 ms | Pupils move from current offset toward the first valid target |
| Track | Continuous | Critically damped interpolation follows target changes |
| Hold | Until target changes | Pupils remain on a stable integer offset; ticker can sleep |
| Recenter | 140–220 ms | Pupils return to authored center after tracking loss or feature suspension |

Use time-based exponential smoothing or a critically damped spring with no visible overshoot. The reference settle time is approximately 120 ms for ordinary direction changes. Clamp frame delta after application stalls. The interpolation operates in floating point, but the presented pupil offsets resolve to logical-pixel positions with hysteresis so the art remains sharp.

The maximum radius comes from asset metadata. A typical 64 px sprite starts with an ellipse of 2 logical pixels horizontally and 1 logical pixel vertically. Do not hard-code those values in feature logic. Each eye also supplies an opaque mask or allowed-offset table; final output is clamped to the nearest valid offset so no pupil pixel touches or crosses the eye outline incorrectly.

## Blink phases

| Phase | Frames | Timing idea |
| --- | --- | --- |
| Open | Current compatible face | Natural hold |
| Close | 1–2 authored frames | 50–80 ms |
| Closed | 1 authored frame | 40–70 ms |
| Open | Reverse or authored opening frame | 60–90 ms |

The full blink lasts 150–240 ms. Roughly one in ten eligible blinks may be a double blink: reopen for 80–140 ms, then repeat once. Never schedule more than two closures. Blink speed follows animation-speed settings within its allowed range, while the 4–8 second interval does not.

Pupils are invisible on closed-eye frames. Their underlying target continues updating, preventing a correction jump after reopening. Reduced motion leaves Eye Follow enabled because pupil translation is small and informationally ambient; it increases settle damping if necessary and disables the optional double blink.

# State Flow

Eye Follow is an orthogonal substate of `Idle`, not a top-level companion state.

```text
Disabled
  -> Centered       when Idle frame exposes eye anchors
Centered
  -> Tracking       on valid cursor sample outside dead zone
Tracking
  -> Holding        when displayed offset reaches target
Holding
  -> Tracking       when target offset changes
Tracking/Holding
  -> Recentering    when cursor becomes stale, invalid, or off all displays
Recentering
  -> Centered       when offset reaches zero
Any active substate
  -> Suspended      when another state or clip owns the eyes
Suspended
  -> Centered       when compatible Idle resumes without a valid cursor sample
Suspended
  -> Tracking       when compatible Idle resumes with a valid sample
```

Blink adds `EyesOpen -> EyesClosing -> EyesClosed -> EyesOpening -> EyesOpen` within compatible Idle. It does not modify the gaze substate. Entering `Dragging`, `Landing`, `Typing`, `Thinking`, `WaterReminder`, `StretchReminder`, `Celebrate`, `Suspended`, or `ErrorFallback` cancels a pending blink and hides the pupil layer when the new clip owns the eyes.

If a compatible ambient Idle clip such as breathing retains eye anchors, Eye Follow continues. If a head turn uses different anchors, the animation frame metadata updates pupil bases before the same target offset is applied.

# Technical Design

The main-process cursor adapter is responsible for cross-monitor cursor coordinates. It normalizes platform output to Electron virtual screen device-independent pixels and emits `pointer.position_changed` with `{ screenX, screenY, sampledAtMs }`. The payload contains no click target or active-application metadata. The adapter emits `pointer.position_unavailable` on lock, permission failure, or an invalid sample.

The companion renderer owns `EyeFollowController`. Its dependencies are the typed event bus, display-topology provider, scene attachment resolver, render-demand scheduler, and monotonic clock. It stores the latest cursor sample, target offsets, displayed offsets, and blink deadline outside Zustand because these values change at frame cadence.

Required events:

| Event | Producer | Effect |
| --- | --- | --- |
| `pointer.position_changed` | Cursor adapter | Update latest sample and recompute target |
| `pointer.position_unavailable` | Cursor adapter | Begin recentering |
| `display.topology_changed` | Main process | Revalidate sample and coordinate conversion |
| `state.changed` | State machine | Suspend or resume eye ownership |
| `animation.frame_changed` | Animation Engine | Resolve per-frame eye anchors and mask |
| `app.suspended` | Main process | Center, cancel blink deadline, stop sampling |
| `app.resumed` | Main process | Restart sampling and choose a new blink deadline |

Coordinate conversion must account for companion window bounds, Pixi stage scale, device pixel ratio, character container transform, and per-frame eye anchors. Tests use monitors positioned left and above the primary display to cover negative coordinates. Cursor containment uses the union of Electron display bounds; work-area bounds are not used because a pointer can legitimately enter menu bars or taskbars.

`EyePoseMetadata` contains base anchors, allowed radii, pupil texture keys, and optional offset lookup tables. Metadata is validated during asset loading. A missing anchor disables pupil movement for that frame; it does not guess coordinates.

The render-demand scheduler wakes the Pixi ticker only while displayed offsets differ from target, a blink is active, or another animation needs frames. Cursor samples mapping to the existing target do not request a frame. Target calculations reuse point objects or scalar fields to avoid allocations.

Blink scheduling belongs to the Behavior Engine's ambient lane. It uses an injected random source, minimum/maximum deadlines, and an eligibility guard. Blink animations are lightweight overlays with completion callbacks; they cannot transition the top-level state away from Idle.

Developer mode exposes sample age, screen-space cursor position, target offset, displayed offset, compatible-eye status, and next blink deadline. Production logging is limited to rate-limited adapter failure and invalid metadata codes.

Unit tests cover vector projection, ellipse clamping, hysteresis, negative coordinates, stale samples, and masks. Integration tests verify that blink and cursor updates coexist, state ownership suspends tracking, and the ticker sleeps after settling. Visual tests capture all allowed pupil offsets over every compatible face frame.

# Edge Cases

- **Cursor on another monitor:** Direction is calculated in the unified virtual coordinate space; monitor boundaries do not cause recentering.
- **Negative display coordinates:** Signed coordinates are preserved through IPC and geometry calculations.
- **Display unplugged:** Revalidate the latest cursor sample. Recenter if it no longer lies within any display; resume on the next valid sample.
- **Cursor hidden by an application:** If the platform still reports a valid position, tracking may continue. If the adapter explicitly reports unavailable, recenter.
- **Cursor exactly over the face:** Apply the dead zone and center both pupils rather than choosing an unstable direction.
- **Pointer moves extremely fast:** Keep only the latest sample. Do not replay intermediate positions or overshoot the target.
- **Low render rate or resume after sleep:** Clamp delta, discard stale interpolation, and recalculate from the current sample.
- **Fractional operating-system display scale:** Perform conversion in floating point, then snap the presented pupil offset according to logical asset pixels.
- **Blink due during Drag or Thinking:** Defer it and schedule a fresh interval after returning to compatible Idle; do not fire immediately.
- **State changes mid-blink:** New state owns the face immediately. Dispose the blink overlay and do not emit a state completion.
- **Asset frame lacks one eye anchor:** Hide or center both dynamic pupils for that frame to avoid asymmetric corruption.
- **Pupil texture fails to load:** Use the core open-eye frame with authored centered pupils and disable the feature for the session.
- **Cursor adapter permission failure:** Remain centered, rate-limit logging, and keep all other behavior functional.
- **Companion partially off-screen:** Use actual screen position of eye anchors; no special correction is required.
- **Settings window focused:** Continue following the global cursor unless the companion is suspended.
- **Reduced motion enabled:** Retain bounded gaze and single blinks; eliminate optional double blinks.

# Acceptance Criteria

- [ ] Only pupil sprites move during Eye Follow; the body, head, beak, window, and camera remain fixed.
- [ ] Gaze direction is correct across horizontally and vertically arranged monitors, including negative virtual coordinates.
- [ ] Each pupil remains inside its authored eye mask at every allowed offset.
- [ ] Ordinary direction changes settle smoothly in approximately 120 ms with no overshoot or visible jitter.
- [ ] Stable cursor input produces a stable integer-aligned pupil position and allows the ticker to sleep.
- [ ] Missing or stale cursor data recenters pupils within 220 ms without snapping.
- [ ] Blink intervals are randomized between 4 and 8 seconds of eligible Idle time.
- [ ] Blink frames hide pupils and reopen toward the latest cursor target without a correction flash.
- [ ] Major states and eye-owning clips suspend Eye Follow immediately and resume it only on compatible frames.
- [ ] Pointer events contain coordinates and timestamps only; no clicked content or application metadata is collected.
- [ ] Display topology changes do not crash, strand the gaze, or produce invalid coordinates.
- [ ] Missing metadata or textures falls back to authored centered eyes.
- [ ] Unit, integration, and visual tests cover every allowed pupil offset and interruption path.
- [ ] Idle CPU remains inside the application budget and no frames are requested after the gaze settles.

# Future Improvements

- Add asset-authored eye masks for new head-turn and seated idle poses so Eye Follow remains active across more ambient clips.
- Introduce subtle distance bands that bias pupils toward center when the cursor is very near the face, after validating that the behavior reads at native size.
- Support a short, low-priority look-away idle variation with a cooldown, while preserving cursor tracking as the immediate response to renewed movement.
- Add platform adapters for cursor-unavailable signals on additional operating systems without changing renderer contracts.
