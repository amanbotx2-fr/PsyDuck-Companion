# Overview

## Purpose

Thinking mirrors an external generation lifecycle with a restrained character reaction. When a supported integration reports that generation has started, Ducky adopts a thinking expression, blinks, occasionally scratches its head, and shows a three-dot bubble. When the matching generation finishes, the behavior ends immediately so the completion reaction can run.

Thinking represents status only. Ducky does not read prompts, responses, application content, or model output, and it does not accept conversational input.

## User story

As a developer waiting for a supported tool to finish generating, I can glance at Ducky and see a subtle thinking state that stops as soon as the tool reports completion.

## Goals

- React to explicit, paired generation-start and generation-finish signals.
- Provide a recognizable thinking face within 150 ms of an accepted start.
- Show a quiet looping pose with natural blinks, occasional head scratch, and an animated three-dot bubble.
- Handle overlapping generation sources without stopping while any tracked source remains active.
- Stop immediately on final completion, with bounded visual cleanup.
- Preserve privacy by transporting lifecycle metadata only.
- Avoid continuous expensive animation during long generations.

## Non goals

- Detecting generation by reading screen pixels, prompts, responses, browser content, or clipboard data.
- Displaying progress, elapsed-time pressure, model names, output text, or an estimated completion time.
- Letting the user talk to Ducky or treating the companion as the generator.
- Repeatedly escalating animation during a long wait.
- Starting Celebrate for canceled, failed, or stale generation sessions unless the source explicitly reports a successful finish.

# User Experience

When a supported generation begins, Ducky completes a very short safe exit from an interruptible lower-priority action, changes to a curious thinking face, and raises a small bubble containing three dots. The bubble is a character expression, not a notification. It stays attached to the character and remains within the current display.

The body is mostly still. Subtle breathing continues. The eyes blink at a calm interval. After the state has lasted long enough, Ducky may scratch its head once, then return to the thinking pose. Head scratches are separated by long, irregular cooldowns so a multi-minute generation does not look like a repeated loading spinner.

The dots animate one at a time using discrete pixel states. They do not spin, race, flash, or imply measurable progress. The bubble has no buttons and never takes focus.

When the last active generation reports success, the dots stop immediately, the bubble closes within 100 ms, and Thinking relinquishes the state. The Behavior Engine may then enter Agent Done Celebrate. If the source cancels or fails, Ducky quietly returns to Idle without celebrating. If another generation is still active, no visible restart occurs.

Drag always takes control immediately. After a drag ends, Thinking resumes if at least one generation remains active. A reminder waits until Thinking completes. Typing activity does not replace Thinking.

# Behavior

1. A supported integration publishes `agent.generation_started` with a stable `sourceId`, `generationId`, and timestamp. No content accompanies the event.
2. The lifecycle registry validates the identifier pair and inserts it into an active-generation set. Duplicate start events for the same pair are ignored.
3. When the set changes from empty to non-empty, publish `agent.thinking_started`. The Behavior Engine requests `Thinking` at its defined priority.
4. On entry, cancel ambient behavior and exit Typing through its fast cleanup if required. Show the thinking pose and bubble using the entry animation.
5. Start the low-frequency dot timeline after the bubble reveal marker. Schedule the first optional head scratch no earlier than 8 seconds after entry.
6. While active, new generation-start events add identifiers but do not restart entry, reset blink cadence, replay the bubble, or increase animation intensity.
7. A matching `agent.generation_finished`, `agent.generation_failed`, or `agent.generation_canceled` removes exactly that identifier. Unknown completions are ignored and logged only in developer mode.
8. If active identifiers remain, continue Thinking unchanged.
9. When the set becomes empty, cancel all pending blink and scratch timers and publish a terminal event with outcome derived from the last removal and aggregate session rules.
10. On successful completion, stop dot animation and hide the bubble immediately, then transition out of Thinking. Agent Done may start once cleanup reaches its 80–100 ms release marker.
11. On failure or cancel, use the same fast bubble cleanup and transition to Idle without Celebrate.
12. On a safety timeout or stale integration disconnect, clear affected identifiers and return to Idle without Celebrate.

The integration adapter must send explicit outcomes. Silence is not success. A generation is considered stale after the adapter's documented heartbeat or maximum lifecycle deadline; the default safety cap is 30 minutes. The cap exists to prevent a permanent Thinking state, not to estimate expected duration.

Head scratch is optional per cooldown. A scratch request waits for the current blink and dot marker boundary, plays once, and returns to the same thinking loop. No more than one scratch may occur in any 12-second window. The first eight seconds remain visually simple.

# Animation

Thinking has an entry, a low-motion base loop, two ambient overlays, and a fast exit.

| Phase | Frames idea | Timing |
| --- | --- | ---: |
| Entry | Neutral, glance up, thinking face, bubble reveal | 4–6 frames / 140–240 ms |
| Base loop | Still thinking pose with 1 px breathing change | 6–8 frames / 8–10 FPS |
| Blink | Close, hold, open while keeping pose | 3–4 frames / 160–240 ms |
| Head scratch | Hand lift, two scratch contacts, hand down | 7–10 frames / 700–1,000 ms |
| Fast exit | Bubble close and neutral face release | 2–3 frames / 80–120 ms |

The requirement to stop immediately means terminal signals do not wait for a head-scratch loop, blink, or breathing cycle. Any overlay jumps to its nearest valid exit frame, bubble cleanup begins in the same event turn, and state ownership is released within 120 ms.

The three-dot bubble uses four states: all dim, first active, second active, third active. Each active state holds 240–360 ms. After the third dot, hold all dim for 200–300 ms and repeat. The sequence is intentionally non-progressive and is independent of generation duration. Dots use authored palette changes or visibility, not opacity interpolation.

Thinking blinks every 4–8 eligible seconds, using pose-specific blink frames. A head scratch resets the next blink deadline after it completes so closures do not stack. The base loop may enter a static hold between breathing cycles, allowing the ticker to sleep except for scheduled dot changes.

Animation-speed settings affect entry, scratch, blink, and base-loop clip time. They do not delay terminal cleanup beyond 120 ms. Reduced motion uses a static thinking face and a bubble whose dots change every 600 ms; it removes head scratch repetition but may show one entry scratch if configured by the asset set.

# State Flow

```text
NoActiveGenerations
  -> StartRequested       on first unique generation_started
StartRequested
  -> Thinking.Entry       when Behavior Engine grants state
Thinking.Entry
  -> Thinking.Loop        after bubble reveal and entry completion
Thinking.Loop
  -> Thinking.Blink       when blink deadline is eligible
Thinking.Blink
  -> Thinking.Loop        on completion
Thinking.Loop
  -> Thinking.HeadScratch when scratch deadline is eligible
Thinking.HeadScratch
  -> Thinking.Loop        on completion
Any Thinking phase
  -> Thinking.ExitSuccess when active set becomes empty with success
Any Thinking phase
  -> Thinking.ExitQuiet   when active set becomes empty by failure, cancel, stale, or disconnect
Thinking.ExitSuccess
  -> Celebrate            when cleanup marker fires and request remains eligible
Thinking.ExitQuiet
  -> Idle                 when cleanup marker fires
Any Thinking phase
  -> Dragging              on direct drag; generation set remains active
Landing
  -> Thinking.Entry        if active generation set is still non-empty
```

If `agent.generation_started` and terminal outcome arrive before Thinking is granted, cancel the pending request. A successful lifecycle shorter than the entry threshold may proceed directly to an eligible Celebrate request; it must not flash the Thinking pose for one frame.

The active-generation set is logical integration state, separate from visual state. Drag can interrupt the visual state without clearing the set. Application suspend retains identifiers for a short resume reconciliation window; integrations must reconcile active lifecycles on resume or the entries expire quietly.

# Technical Design

Each external integration implements `GenerationLifecycleAdapter` in the main process or an approved local plugin boundary. It publishes only:

```ts
type GenerationLifecycleEvent = {
  readonly sourceId: string;
  readonly generationId: string;
  readonly outcome?: 'succeeded' | 'failed' | 'canceled';
  readonly atMs: number;
};
```

Identifiers are opaque, bounded strings used for deduplication and correlation. They must not contain prompt text, response text, filenames, conversation titles, URLs, or user identity. The main process validates length and known source registration before forwarding across preload.

`GenerationRegistry` owns a map keyed by `sourceId:generationId`, start timestamp, last heartbeat if supported, and lifecycle status. It publishes aggregate edges only when the set crosses empty/non-empty, plus a final outcome summary. If multiple generations overlap and the last removal succeeds while an earlier one failed, Celebrate occurs only when the aggregate completion policy reports at least one success and no later active item remains. The baseline policy celebrates the final successful completion event; failures removed while another generation remains do not suppress a later success.

`ThinkingBehavior` subscribes to aggregate events through the typed event bus. Entry creates the bubble and schedules ambient deadlines. Exit is idempotent and owns disposal of dot timer, blink timer, scratch timer, bubble display objects, and clip completion listeners.

The bubble is placed by the shared placement service using `bubbleAnchor` metadata and display work area. Dot state changes use one existing container and three pooled dot sprites. Long base holds wake the ticker only for breathing frames, blink/scratch clips, or bubble state changes.

Required events include `agent.generation_started`, `agent.generation_finished`, `agent.generation_failed`, `agent.generation_canceled`, `agent.integration_disconnected`, `agent.thinking_started`, and `agent.thinking_ended`. State transition code consumes aggregate events; feature animation never consumes raw lifecycle events.

Thinking has a maximum continuous visual duration of 30 minutes unless an adapter provides active heartbeat and the product explicitly permits extension. At timeout, log `thinking_stale_timeout`, clear the affected registry entry, and exit quietly. Repeated late completion events are ignored.

Zustand may expose active-generation count, current source count, state, and sanitized last outcome in developer mode. It must not persist registry entries across an application quit. Per-frame animation data and timer handles stay outside the store.

Tests cover duplicate starts, unknown finishes, overlapping sources, success/failure mixtures, rapid start-finish, drag interruption, stale timeout, suspend reconciliation, and exit during every animation phase. Contract tests reject content-like payload fields. Performance tests validate ticker sleep during long holds and constant memory over repeated lifecycles.

# Edge Cases

- **Finish arrives before start:** Ignore the unknown identifier; do not flash Thinking or Celebrate.
- **Duplicate start:** Keep one active entry and do not restart animation.
- **Duplicate finish:** Ignore after first removal and never celebrate twice.
- **Two simultaneous generations:** Remain Thinking until both identifiers terminate.
- **One succeeds while another remains active:** Continue Thinking; no intermediate Celebrate.
- **Final result fails or cancels:** Exit quietly to Idle.
- **Generation completes during entry:** Execute fast exit immediately; do not wait for bubble reveal.
- **Generation completes during head scratch or blink:** Jump to the closest exit pose and release within 120 ms.
- **New generation starts during success exit:** Cancel Celebrate if not entered, rebuild the active set, and remain or return to Thinking without an Idle flash.
- **Drag begins:** Hide bubble and suspend Thinking visuals; preserve registry. Resume after Landing if still active.
- **Drag ends after generation finished:** Do not resume Thinking. Run an unexpired completion request according to Behavior Engine policy.
- **Reminder due:** Queue it until Thinking and any immediate Celebrate complete.
- **Typing begins:** Thinking retains priority; no keyboard props appear.
- **Adapter disconnect:** Expire its active entries quietly after a short reconciliation allowance; do not infer success.
- **Application sleeps:** Pause animation. On resume, request adapter reconciliation before continuing or clearing entries.
- **No bubble space above character:** Shared placement chooses a side and keeps the tail attached inside one display.
- **Bubble asset fails:** Show the thinking face without a bubble; lifecycle behavior and cleanup continue.
- **Thinking clip fails:** Use the core confused/idle-compatible fallback pose and the three-dot bubble.
- **Thirty-minute timeout:** Exit quietly, dispose timers, and ignore late stale completion.
- **Reduced motion:** Use the static pose and slow dot states, with the same immediate terminal behavior.

# Acceptance Criteria

- [ ] Thinking starts only from a validated explicit generation-start lifecycle signal.
- [ ] Lifecycle IPC contains opaque identifiers, outcome, and timestamps only; no prompt, response, title, URL, filename, or application content.
- [ ] The accepted start produces a thinking face and bubble within 150 ms when no higher-priority state blocks it.
- [ ] The base state contains a subtle thinking face, natural blinking, a bounded head scratch, and a discrete three-dot bubble.
- [ ] Dot animation does not imply numeric progress and does not run as an expensive continuous effect.
- [ ] Duplicate and overlapping lifecycle events are deduplicated correctly.
- [ ] Thinking remains active until the final tracked generation terminates.
- [ ] Final successful completion stops visible Thinking and releases state ownership within 120 ms.
- [ ] Failure, cancellation, stale timeout, and disconnect return quietly to Idle without Celebrate.
- [ ] Successful completion can request Agent Done exactly once.
- [ ] Drag suspends visual Thinking without losing active lifecycle state.
- [ ] New starts during exit cannot create an Idle or Celebrate flash.
- [ ] All timers, bubble objects, dot sprites, and subscriptions are released on every exit path.
- [ ] Long Thinking sessions allow the ticker to sleep between scheduled visual changes.
- [ ] Integration, privacy contract, interruption, visual, and performance tests pass.

# Future Improvements

- Add more local integration adapters that provide explicit lifecycle events without screen scraping or content access.
- Add source-specific enable/disable controls if multiple integrations ship and users need to choose which lifecycle signals affect Ducky.
- Add a second low-frequency thinking idle variation after art and repetition testing, while maintaining the same maximum motion budget.
- Add adapter health diagnostics and last-signal timestamps to Developer mode without exposing external content.
