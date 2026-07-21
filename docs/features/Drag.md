# Overview

## Purpose

Drag lets the user reposition PsyDuck through direct manipulation. The character visibly stretches while held, follows the pointer without detaching from the grab point, and converts release motion into a bounded bounce and landing. The interaction is responsive first and expressive second.

## User story

As a user arranging my desktop, I can pick PsyDuck up and move it to a comfortable position. The character reacts with weight and elasticity, then settles exactly where I leave it without blocking my work.

## Goals

- Begin a drag reliably from the visible character and never from transparent window padding or reminder controls.
- Preserve the pointer-to-character grab offset so the body does not jump on pickup.
- Express lift and movement with bounded squash and stretch.
- Derive safe release momentum from recent pointer samples.
- Simulate gravity, edge collision, bounce, damping, and a clean landing.
- Support movement between monitors with different origins and scale factors.
- Persist the final safe position after the body settles.

## Non goals

- Throwing PsyDuck indefinitely, damaging the character, or creating chaotic desktop motion.
- Dragging with keyboard content, gestures from unrelated applications, or right mouse by default.
- Snapping to icons, windows, docks, grids, or arbitrary desktop targets.
- Allowing the character to become permanently unreachable.
- Treating a simple click as a drag before the movement threshold is crossed.

# User Experience

The user presses the primary pointer button on an opaque part of PsyDuck. The character compresses slightly at the held area, then stretches as it lifts. Once the pointer moves beyond the drag threshold, PsyDuck follows it with a small, smooth elastic delay. The original grabbed point stays under the pointer, so grabbing the head feels different from grabbing the body edge without causing a position jump.

Fast horizontal movement leans and stretches the body slightly along the motion direction. Vertical movement emphasizes lift or downward pull. Deformation remains readable as the same character and never makes the pixel art blurry. Other reactions pause while the user is holding PsyDuck. Passive bubbles disappear; unresolved reminder actions are temporarily hidden.

On release, the most recent hand movement contributes momentum. A slow release drops PsyDuck nearly in place. A faster release carries it a short, capped distance before gravity brings it toward the active display's floor. Contact produces a squash, one or two diminishing bounces, and a stable standing pose. The landing never continues long enough to become distracting.

If the user releases near a display edge, PsyDuck collides with the safe work area and remains reachable. Moving between monitors is continuous in virtual desktop space. The companion chooses the display containing the character center; it does not teleport when the pointer crosses a seam.

# Behavior

1. Pointer down is accepted only for the primary button on the current character hit mask and only when no actionable bubble control owns the point.
2. The controller captures the pointer and records the screen-space pointer coordinate, character ground origin, local grab offset, time, active display, and current logical state.
3. The state machine does not enter `Dragging` immediately. It enters a short `DragPending` interaction phase while movement remains below 4 CSS px and elapsed time remains below 160 ms.
4. If the pointer releases inside the threshold, cancel Drag with no physics. The click may be passed to the application's defined click action; Drag itself produces no bounce.
5. When movement exceeds the threshold, publish `drag.started`, transition to `Dragging`, cancel the current interruptible behavior, hide passive bubbles, and suspend Eye Follow.
6. During pickup, retain the exact grab offset. Expand the companion window safe bounds if the stretched pose requires more space, keeping the character's screen-space anchor fixed.
7. Process pointer moves in virtual desktop coordinates. Keep a ring buffer of the latest 6–10 samples covering no more than 120 ms.
8. Set the kinematic drag target to `pointerPosition - transformedGrabOffset`. Interpolate the rendered body toward that target with a maximum trailing distance; direct pointer ownership always wins over decorative elasticity.
9. Calculate deformation from smoothed velocity. Clamp horizontal lean, stretch, and squash to asset-approved limits.
10. On pointer up, pointer cancel, capture loss, or window interruption, publish `drag.released` exactly once.
11. Estimate release velocity from recent valid samples using time-weighted linear regression or a similarly noise-resistant method. Ignore samples older than 100 ms and clamp result per axis and by magnitude.
12. Enter `Landing`, convert the body from kinematic to dynamic, and apply gravity and collision.
13. On ground contact, trigger authored impact frames and bounce using the vertical impact velocity. Apply horizontal friction on every grounded step.
14. When velocity remains below rest thresholds for two simulation steps, snap the ground point to a valid pixel-aligned resting position, play recovery frames, transition to `Idle`, and schedule persistence.

The user may grab PsyDuck again during Landing. A new valid pointer press immediately cancels dynamic physics and enters a new Drag without playing the remaining recovery. This is the only user-driven interruption with higher priority than Drag/Landing.

The hit region follows opaque character pixels with a small internal tolerance. It excludes particles, ground shadow, speech bubble background outside controls, developer overlay, and transparent atlas padding. The effective minimum reachable grab target may extend a few pixels inward around the torso but must not create a large invisible click blocker.

# Animation

Drag combines authored pose frames with procedural container transforms. It has five visual phases:

| Phase | Target duration | Visual intent |
| --- | ---: | --- |
| Grab anticipation | 60–90 ms | Slight squash toward the grab point; eyes react if included in art |
| Lift | 90–140 ms | Body elongates vertically and feet leave the ground |
| Held movement | Until release | Velocity-driven lean and bounded stretch; small elastic trail |
| Fall and impact | Physics-driven | Air pose, then 1–2 frame contact squash |
| Bounce recovery | 220–500 ms | Diminishing rebound, overshoot to normal proportions, Idle |

The grab response must begin within one rendered frame after the drag threshold. If the threshold is crossed after the anticipation deadline, enter Lift from the closest authored pose rather than replaying a delayed squash.

Procedural scale uses conservation of perceived mass: a vertical stretch increases `scaleY` while reducing `scaleX`; impact squash does the inverse. Default maximums are configuration values validated against art, with an initial target of 1.15 vertical stretch and 0.88 impact height. The pivot remains at the grab point while held and at the ground contact point during landing. Values return to exactly `1` at rest.

Release motion selects an air pose based on vertical velocity. Horizontal velocity may lean the character by at most an asset-approved pixel offset or discrete authored orientation; arbitrary smooth rotation is avoided because it softens pixel edges. If rotation is used for a celebratory throw pose, it must snap to approved integer angles and is not part of V1 baseline behavior.

The first ground contact emits `physics.ground_contact` with impact speed. Low impact plays one squash and recovery with no rebound. Medium impact produces one bounce. High but capped impact may produce a second smaller bounce. Restitution and animation are coordinated so authored feet contact the same simulated ground line.

Animation speed affects authored grab and recovery clips, but not pointer following, gravity, or simulation stability. Reduced motion removes elastic trailing and limits release momentum to a short drop with one small squash; direct positioning remains immediate.

# State Flow

```text
Idle / interruptible state
  -> DragPending       on primary pointer down inside hit mask
DragPending
  -> previous state    on release before threshold
DragPending
  -> Dragging          when movement exceeds threshold
DragPending
  -> previous state    on pointer cancel before threshold
Dragging
  -> Landing           on release, cancel, or capture loss
Landing
  -> Dragging          on a new valid grab
Landing
  -> Idle              after body rests and recovery completes
Any phase
  -> ErrorFallback     only if required core drag assets and fallback pose both fail
```

`DragPending` can be implemented as interaction-controller state rather than a top-level character state; while pending, the visible state must remain unchanged. Once `Dragging` starts, it interrupts Typing, Thinking visuals, reminders, Celebrate, and ambient behavior. A generation source may continue logically in the background; after Landing, the Behavior Engine reevaluates current facts and may re-enter Thinking rather than replaying the interrupted animation.

An active reminder is not dismissed by Drag. Its card is hidden and its deadline retained. After Landing, restore it after a 500 ms quiet delay if it is still unresolved and no higher-priority state is active. Celebration interrupted by Drag is not replayed.

Every exit from Dragging releases pointer capture, clears sample history, resets the kinematic flag, and transfers or discards bubble ownership. Every exit from Landing puts the physics body to sleep and normalizes transforms.

# Technical Design

The companion renderer owns `DragController` because pointer capture and Pixi hit testing occur there. Electron's main process owns actual companion-window position and display topology. The renderer computes desired screen-space ground position and sends coalesced `window:set-companion-position` commands at most once per animation frame. The main process applies bounds and returns the accepted window position when platform constraints change it.

Required events:

| Event | Payload | Purpose |
| --- | --- | --- |
| `drag.pending` | pointer ID, screen point | Begin threshold tracking |
| `drag.started` | grab point, local offset | Enter exclusive direct manipulation |
| `drag.moved` | latest screen point, timestamp | Update kinematic target and sample buffer |
| `drag.released` | estimated velocity, reason | Transfer to physics exactly once |
| `physics.ground_contact` | impact speed, point | Select impact animation and particle-free squash |
| `physics.body_rested` | safe screen point | Recover, persist, and return to Idle |
| `display.topology_changed` | display bounds and scale | Recompute collision surfaces |

Pointer coordinates must be converted from canvas/client space to Electron screen DIP coordinates using the current window bounds and scale factor. Do not rely on DOM `screenX` alone across all Electron platforms without adapter tests. Pointer capture has a renderer path and a main-process safety path for window blur or application suspension.

The physics body contains position, previous position, velocity, scale, deformation velocity, grounded state, and collision extents. The engine uses a fixed 120 Hz step, gravity, bounded restitution, horizontal air resistance, grounded friction, and a maximum of four substeps per render frame. Maximum throw speed prevents crossing an entire display in one stalled frame.

Collision surfaces come from the union of display work areas. At seams, select a supporting floor beneath the character center. If displays have different lower edges, the character may move across only where its center has entered the destination display; it must not fall through the gap between two work areas. Side collision retains enough of the torso grab region inside a work area.

The animation engine applies deformation to a stable character container below the window-position container. This separation prevents window updates, grab pivot changes, and body squash from compounding. Final transform order is window origin, scene scale, body translation, pivot compensation, authored sprite.

Position persistence is main-process-owned. After `physics.body_rested`, debounce 500 ms, validate the display and safe bounds again, then store DIP coordinates, display ID, and companion scale. Persistence failure does not repeat the landing or move the character.

Per-frame code reuses the sample ring buffer and pose objects. Move IPC is coalesced; if the previous window-position request is outstanding, replace its pending target rather than queueing all points. Developer mode shows pointer ID, grab offset, sample count, raw and clamped release velocity, physics step count, collision display, and body sleep state.

Tests use deterministic timestamped paths for click-without-drag, slow move, fast throw, direction reversal, capture loss, window blur, high-DPI conversion, and multi-display seams. Visual tests verify maximum squash/stretch and the exact rest frame.

# Edge Cases

- **Press then release without movement:** Remain in the previous state; no stretch, bounce, or position write occurs.
- **Pointer leaves the companion window:** Captured pointer continues Drag. If capture is lost, release safely using the last sample.
- **Release event is missed:** Window blur, capture loss, app suspend, or a 500 ms missing-sample watchdog synthesizes one release with capped or zero momentum.
- **Second pointer or button:** Ignore it while the owning pointer is active. Only the initiating pointer can release the drag.
- **Click on Dismiss or Snooze:** Bubble control receives the event; Drag does not enter pending state.
- **Very fast throw:** Clamp velocity and sweep collision or use substeps so the body cannot tunnel through work-area edges.
- **Release above a monitor seam:** Choose collision bounds from character center and recompute as it crosses; never teleport to the pointer's monitor.
- **Monitor unplugged mid-drag:** Continue using updated topology, then clamp the minimum distance needed to a remaining display.
- **Different display scale factors:** Keep simulation in DIP virtual coordinates and rebuild physical-pixel presentation at the active display scale.
- **Taskbar or dock moves:** Treat new work area as a topology change and resolve penetration before the next physics step.
- **Application suspends while held:** End Drag with zero velocity, clamp safely, persist, and enter `Suspended` without bounce.
- **Frame stall:** Clamp render delta and physics substeps; do not integrate the full stalled duration.
- **Grab at transparent wing gap:** Use the authored hit mask; do not accept the press.
- **High companion scale near edge:** Maintain a reachable torso region even if effects or bubble safe area cannot fit.
- **New drag during bounce:** Cancel the bounce and normalize the pose around the new grab pivot without snapping position.
- **Reminder becomes due during Drag:** Queue it; display only after Landing and the quiet delay.
- **Generation finishes during Drag:** Queue at most one eligible Celebrate request; Behavior Engine applies its normal expiry after Landing.
- **Persistence failure:** Keep the valid current position for the session and show diagnostic status only.

# Acceptance Criteria

- [ ] Primary-pointer movement must exceed 4 CSS px before Drag starts.
- [ ] A click without threshold movement produces no drag deformation, physics, or persistence write.
- [ ] The local grabbed point remains under the pointer within the defined elastic trailing limit.
- [ ] Visible character pixels are draggable; transparent padding, shadow, particles, and bubble background are not.
- [ ] Drag begins responding within one active rendered frame after threshold crossing.
- [ ] Stretch, squash, and lean remain within asset-approved limits and return exactly to neutral at rest.
- [ ] Release velocity uses recent timestamped samples, rejects stale data, and is capped.
- [ ] Slow release lands locally; faster release carries bounded momentum and produces no more than two bounces.
- [ ] Physics is deterministic under a fake clock and stable after a render stall.
- [ ] The companion remains reachable after collisions, display changes, and restart.
- [ ] Drag works across monitors with negative origins and different scale factors without teleporting.
- [ ] Reminder controls never initiate Drag, and unresolved reminders survive temporary hiding.
- [ ] A new grab can interrupt Landing cleanly.
- [ ] All release paths emit exactly once and release pointer capture.
- [ ] Final position is persisted only after rest and restored to a safe work area.
- [ ] Reduced motion preserves repositioning while limiting trailing, momentum, and bounce.
- [ ] Drag and Landing meet the active CPU and frame-time budgets without unbounded IPC queues or allocations.

# Future Improvements

- Add an optional right-click application menu without changing the primary drag gesture or hit mask.
- Add authored directional held poses if the final art needs more expression than bounded procedural deformation can provide.
- Support user-configurable edge resting zones only after validating that snapping does not make repositioning feel imprecise.
- Add accessibility commands in Settings to move PsyDuck between display corners for users who cannot perform pointer dragging.
