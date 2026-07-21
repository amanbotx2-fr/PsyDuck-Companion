# Overview

## Purpose

Agent Done is the short completion reaction that follows a successful external generation lifecycle. PsyDuck jumps, celebrates, emits a small burst of sparkle particles, lands, and returns to Idle. The reaction acknowledges completion without becoming a notification, score, or prolonged celebration.

## User story

As a developer waiting on a supported generation, I see one brief, cheerful jump when the work finishes successfully, giving me a peripheral completion cue without sound or focus interruption.

## Goals

- Trigger exactly once for a validated successful generation completion.
- Begin promptly after Thinking releases visual ownership.
- Present an authored anticipation, jump, celebration pose, landing, and recovery.
- Emit a bounded, pooled sparkle burst at intentional animation markers.
- Remain short, silent, and non-blocking.
- Handle overlapping starts, rapid completions, Drag, reminders, and reduced motion predictably.
- Always clean up physics and particles and return to Idle.

## Non goals

- Celebrating failed, canceled, stale, or unknown lifecycle events.
- Displaying generated content, source names, scores, progress, or a completion notification card.
- Playing sound, spinning indefinitely, flashing the window, or triggering operating-system attention APIs.
- Queueing one celebration for every completion in a burst.
- Moving the companion to a different resting desktop position.

# User Experience

When the final tracked generation reports success, the Thinking bubble closes immediately. PsyDuck briefly crouches, jumps a small distance above its resting point, completes one quick authored spin near the apex, and releases a handful of pixel sparkles. It lands with a soft squash, settles, and becomes Idle.

The full reaction lasts roughly 0.8–1.2 seconds at normal animation speed. It does not show text or buttons. Sparkles remain close to the character, fade through authored frames, and disappear before or shortly after recovery. The jump is expressive but small enough to remain inside the companion's safe window and avoid covering nearby work.

If a successful completion occurs while PsyDuck is already celebrating, the current reaction is not restarted. At most one additional completion is coalesced into the existing celebration, normally by adding a second small sparkle emission at an approved marker. It never produces a chain of repeated jumps.

Direct Drag interrupts immediately. The user can pick PsyDuck up during anticipation, flight, landing, or recovery; celebration particles disappear and Drag becomes authoritative. Reminders wait until celebration ends. Typing does not interrupt the reaction.

With reduced motion, PsyDuck makes a brief happy pose with a tiny upward body shift and no free-flight jump or sparkles, then returns to Idle.

# Behavior

1. `GenerationRegistry` publishes an aggregate successful terminal event with a unique completion ID after removing the final active generation.
2. The Agent Done controller deduplicates the completion ID and publishes `agent.completion_ready`.
3. The Behavior Engine creates a `Celebrate` request with an expiry 2 seconds after completion. If it cannot start within that window because Drag or another higher-priority state is active, discard it rather than showing stale celebration later.
4. Thinking executes fast exit and releases state ownership at its cleanup marker. If the request is still eligible, transition directly to `Celebrate` without an Idle frame.
5. On entry, expand the companion window's visual safe bounds around the fixed ground point so jump and sparkles cannot crop.
6. Play anticipation. At `takeoff`, initialize a vertical physics impulse or authored vertical trajectory while retaining zero net resting displacement.
7. At `apex`, play one discrete authored spin through the happy celebration pose and emit the first sparkle burst.
8. Descend under the jump trajectory. On `land`, play a bounded squash and optionally emit two low sparkles if the pool budget permits.
9. Recover through a small overshoot to neutral. Put the celebration body to rest at its exact pre-jump ground position.
10. Recycle all particles, normalize transforms, emit `animation.completed`, and transition to Idle.
11. If a direct drag starts at any phase, run idempotent celebration cleanup in the same event turn and transfer current screen position to Drag. Do not force the user to wait for landing.
12. If another unique successful completion arrives during Celebrate, record only a coalesced flag. Do not add another state request. If the apex marker has not fired, the current burst represents both; otherwise allow one secondary sparkle burst without a second jump.

Completion requests from failures, cancellation, timeout, integration disconnect, unknown identifier, or duplicate finish are rejected before behavior scheduling. The feature does not infer success from the end of Thinking.

Celebration has priority over reminders, Typing, and ambient behaviors but below Drag. New Thinking lifecycle signals normally preempt or prevent a pending Celebrate: if a new generation starts before takeoff, cancel Celebrate and enter Thinking. If it starts after takeoff, complete the short jump unless product priority testing requires an immediate fast exit; the baseline completes within the bounded duration, then enters Thinking.

# Animation

Agent Done combines authored poses with a bounded vertical trajectory. The jump ground origin remains constant.

| Phase | Frames idea | Duration |
| --- | --- | ---: |
| Anticipation | Crouch, arms prepare, excited eyes | 2–3 frames / 100–160 ms |
| Takeoff | Feet leave ground, body stretches | 2 frames / 80–120 ms |
| Rise | Happy air pose | 2–3 frames / 120–180 ms |
| Apex | Peak pose, one authored spin, and sparkle emission | 3–5 frames / 160–240 ms |
| Fall | Compact descending pose | 2–3 frames / 120–180 ms |
| Land | Contact squash | 2 frames / 80–120 ms |
| Recovery | Rebound, settle, Idle | 3–5 frames / 180–280 ms |

Normal total is 780–1,200 ms. The vertical jump height is asset-scale-relative, initially 8–14 logical pixels, and never depends on completion duration. Horizontal displacement is zero. The spin is one quick rotation authored as discrete sprite frames rather than a runtime transform, preserving hard edges and a readable silhouette. It never loops.

Takeoff and landing use animation markers tied to physics/contact. The trajectory may be an analytical parabola or a small physics body with fixed gravity. It must hit the authored landing marker at the fixed ground line. General Drag momentum does not carry into the celebration.

Sparkles use 4–8 pooled sprites. Initial burst positions are drawn from deterministic bounded offsets around the apex pose. Each lives 350–700 ms, uses an authored three- or four-frame twinkle sequence, and has minimal outward velocity. No blur, additive glow, gradient, random allocation, or full-window particle field is allowed.

The pool is acquired on entry and fully returned on exit. If fewer particles are available, show fewer; never allocate beyond capacity. The feature remains complete if all sparkles are unavailable because the jump carries the semantic meaning.

Animation speed scales clip phase time within 0.75×–1.5× but keeps the experience under 1.5 seconds. Reduced motion uses a 250–450 ms happy pose, at most a two-pixel vertical shift, no ballistic trajectory, no spin, and no particles.

# State Flow

```text
NoRequest
  -> PendingCelebrate      on unique successful completion
PendingCelebrate
  -> Celebrate.Anticipate  when Behavior Engine grants before expiry
PendingCelebrate
  -> NoRequest             on expiry, Drag, or new generation start
Celebrate.Anticipate
  -> Celebrate.Rise        at takeoff marker
Celebrate.Rise
  -> Celebrate.Apex        when vertical velocity reaches apex
Celebrate.Apex
  -> Celebrate.Fall        after apex hold
Celebrate.Fall
  -> Celebrate.Land        on ground contact
Celebrate.Land
  -> Celebrate.Recover     after impact squash
Celebrate.Recover
  -> Idle                  on animation completion
Any Celebrate phase
  -> Dragging              on valid direct drag
Celebrate before takeoff
  -> Thinking              on new generation start
Celebrate after takeoff
  -> Thinking              after bounded recovery when new generation remains active
```

Thinking-success-to-Celebrate is a direct top-level transition; an intermediate Idle render is forbidden. If Celebrate cannot acquire required core pose assets, it may use a short core happy/jump fallback. If fallback is unavailable, mark the request consumed and remain Idle.

Queued reminders remain scheduler-pending. After Celebrate returns to Idle, apply the standard quiet separation before presenting a reminder. Typing state is reevaluated from current anonymous activity and is not resumed from a stale pre-completion pose.

# Technical Design

Agent Done consumes only `agent.generation_succeeded_aggregate` from `GenerationRegistry`, not raw finish events. The aggregate event includes an opaque `completionId`, `completedAtMs`, and no content. A bounded least-recently-used set of consumed completion IDs prevents duplicate celebration across renderer reconnect within the same process.

The Behavior Engine request is:

```ts
type CelebrateRequest = {
  readonly kind: 'Celebrate';
  readonly completionId: string;
  readonly requestedAtMs: number;
  readonly expiresAtMs: number;
  readonly priority: 'completion';
};
```

The main process may persist the last consumed completion ID for a very short renderer-recovery window, but celebration history is not durable user data and is cleared on normal application restart. A completion received while the companion renderer is absent may be delivered if still inside the 2-second expiry after renderer readiness; otherwise it is discarded.

`AgentDoneBehavior` owns the animation instance, vertical body, ground-origin snapshot, expanded safe bounds token, particle-emitter lease, marker subscriptions, and coalesced-completion flag. Its `dispose(reason)` is idempotent and performs all cleanup before the next state's entry effects depend on the scene.

The vertical body is separate from the general companion window position. Apply jump translation inside the scene so Electron window moves are not generated every frame. Before entry, the window expands upward and sideways around the character's fixed on-screen ground point. After particles and recovery finish, shrink safe bounds without moving that ground point.

Use an analytical trajectory when possible: start height zero, apply configured initial velocity and gravity, clamp to ground, and emit one contact. Fixed-step integration is acceptable if it shares Physics Engine invariants. Frame stalls clamp delta; a stall beyond the full reaction snaps to the landing recovery rather than leaving PsyDuck airborne.

Required events are `agent.completion_ready`, `behavior.celebrate_started`, `animation.marker` for `takeoff`, `apex`, and `land`, `physics.ground_contact`, `particles.emitter_completed`, and `behavior.celebrate_completed`. Markers and completion callbacks include a behavior instance token so late events from an interrupted reaction are ignored.

The particle system uses a fixed pool created with the scene. Random positions use an injected seeded generator for visual tests. The emitter stops spawning immediately on exit and returns every live sprite after resetting texture, position, velocity, alpha, and ownership.

Developer mode displays request age, expiry, phase, vertical offset/velocity, particle live/capacity, and whether a completion was coalesced. Production logs only invalid outcome use, missing asset, or cleanup invariant failure.

Tests cover success eligibility, non-success rejection, duplicate completion, request expiry, direct transition from Thinking, new generation timing, coalescing, every Drag interruption phase, frame stall, pool exhaustion, and exact ground restoration. Visual captures cover normal and reduced-motion variants at each supported scale.

# Edge Cases

- **Failed or canceled generation:** No Celebrate request is created.
- **Unknown or duplicate completion:** Ignore and do not emit particles.
- **Success before Thinking becomes visible:** Celebrate may run directly if the lifecycle is valid and request is fresh.
- **Completion while Dragging:** Hold only until the 2-second expiry. Do not celebrate stale work after a long drag.
- **Drag begins during anticipation:** Cancel without takeoff and begin Drag immediately.
- **Drag begins while airborne:** Remove particles, transfer the visually current character screen position to Drag, and cancel celebration physics.
- **Drag begins on landing:** Cancel recovery and normalize around the new grab pivot.
- **New generation starts before takeoff:** Cancel pending/current Celebrate and enter Thinking.
- **New generation starts in flight:** Complete bounded landing, then enter Thinking; do not replay Idle.
- **Multiple successes arrive rapidly:** One jump maximum; one optional additional bounded sparkle emission.
- **Reminder is due:** Keep it pending until Celebrate plus quiet separation completes.
- **Typing is active:** Celebrate takes priority; current activity may start Typing only after completion if still recent.
- **Application suspends while airborne:** Snap to safe ground, clear particles, consume the request, and enter Suspended.
- **Window near top edge:** Expand safe bounds downward/sideways or adjust internal scene space while keeping ground point fixed; never crop the apex.
- **Monitor removed mid-reaction:** Resolve to a safe work area, cancel or land immediately, and return to Idle.
- **Particle atlas missing:** Run the complete jump without sparkles.
- **Jump clip missing:** Use a core happy hop fallback if available; otherwise consume and remain Idle.
- **Frame stall:** Skip to land/recovery with exactly one ground contact and no replayed emissions.
- **Reduced motion enabled during reaction:** Switch at the next safe marker to the short happy recovery and clear particles.

# Acceptance Criteria

- [ ] Celebrate is requested only for a validated unique successful generation outcome.
- [ ] Failure, cancellation, timeout, disconnect, unknown finish, and duplicate finish never trigger it.
- [ ] Thinking exits directly into Celebrate without a visible Idle frame when the request is eligible.
- [ ] The normal reaction contains anticipation, jump, one discrete authored spin, apex celebration, landing squash, recovery, and Idle.
- [ ] Total normal duration is approximately 0.8–1.2 seconds and never exceeds 1.5 seconds at supported speed settings.
- [ ] Jump height remains within approved logical-pixel bounds and has zero net resting displacement.
- [ ] Sparkles emit only at approved markers, use a fixed pool, remain between 4 and 8 live sprites, and disappear on exit.
- [ ] Missing or exhausted particles do not block or fail the celebration.
- [ ] Multiple completions during one reaction do not cause repeated jumps.
- [ ] Pending completion expires after 2 seconds rather than producing a stale reaction.
- [ ] Direct Drag interrupts every phase immediately and leaves no particles, velocity, window offset, or late callbacks.
- [ ] Reminders and Typing wait according to state priority and are reevaluated after completion.
- [ ] New generation start follows the documented before/after-takeoff policy.
- [ ] Reduced motion uses a short happy pose with no ballistic jump, spin, or sparkles.
- [ ] Frame-stall, pool-exhaustion, display-edge, interruption, duplicate-event, and visual tests pass.
- [ ] Every terminal path returns the exact ground origin, resets transforms, releases safe bounds, and reaches Idle or the documented next state.

# Future Improvements

- Add a small set of celebration clips chosen without repetition, all within the same duration, particle, and motion budgets.
- Add build-success or task-completion adapters that emit the same content-free completion contract, with separate user controls and deduplication namespaces.
- Add an alternate no-spin celebration variant for users who want less rotational motion without enabling the complete reduced-motion mode.
- Add an optional no-particles preference separate from reduced motion if user testing shows a need.
