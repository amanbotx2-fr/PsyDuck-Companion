# Technical Specification

## Scope

This document defines the implementation contract for the PsyDuck desktop application. PsyDuck is a transparent, always-on-top pixel companion. It observes bounded activity signals, converts those signals into character behaviors, renders the result through PixiJS, and exposes configuration through a separate React settings window. It does not provide conversational input, execute user commands, produce audio, or present itself as a system assistant.

The first supported desktop targets are macOS and Windows. Platform-specific capabilities must sit behind typed adapters so the renderer and behavior code remain platform-neutral.

## System Architecture

PsyDuck uses one Electron main process and two renderer surfaces:

| Surface | Technology | Responsibility |
| --- | --- | --- |
| Main process | Electron, TypeScript | Application lifecycle, windows, display coordinates, persistence, auto-launch, global activity adapters, and privileged operating-system APIs |
| Companion renderer | PixiJS, TypeScript | Character rendering, animation playback, eye offsets, particles, bubbles, pointer hit testing, and frame scheduling |
| Settings renderer | React, TypeScript | Settings controls, validation, import/export flows, developer diagnostics, and reset confirmation |
| Preload bridges | Electron context bridge | Narrow, versioned, typed IPC APIs for each renderer |

The companion runtime is divided into deterministic engines. Dependencies flow in one direction:

```text
platform adapters -> event bus -> behavior engine -> state machine
                                             |            |
                                             v            v
                                      animation engine  physics engine
                                             \            /
                                              Pixi scene
```

The event bus transports facts. The behavior engine decides what those facts mean for the character. The state machine owns the active state and transition rules. The animation and physics engines produce visual values. PixiJS applies those values to the scene graph. No engine reads DOM state or invokes Electron APIs directly.

## Folder Structure

The implementation must use the following boundaries. A directory may be introduced only when it has at least one concrete owner and a stable purpose.

```text
src/
  main/
    app.ts                    # Electron lifecycle
    windows/
      companionWindow.ts
      settingsWindow.ts
      windowRegistry.ts
    ipc/
      registerIpc.ts
      settingsHandlers.ts
      windowHandlers.ts
      activityHandlers.ts
    platform/
      activity/
      autoLaunch/
      cursor/
      displays/
    persistence/
      settingsRepository.ts
      positionRepository.ts
      migrations.ts
  preload/
    companion.ts
    settings.ts
    contracts.ts
  renderer/
    companion/
      bootstrap.ts
      scene/
      sprites/
      bubbles/
      particles/
    settings/
      App.tsx
      components/
      hooks/
      routes/
  engine/
    behavior/
    animation/
    physics/
    events/
    state/
  features/
    eyeFollow/
    drag/
    typing/
    thinking/
    waterReminder/
    stretchReminder/
    agentDone/
    settings/
  state/
    companionStore.ts
    settingsStore.ts
    selectors.ts
  config/
    defaults.ts
    schema.ts
  assets/
    generated/                # Build-generated runtime atlases and manifests
  shared/
    geometry/
    time/
    types/
    validation/
  test/
    fixtures/
    helpers/
assets/
  source/                     # Editable art sources; excluded from packages
  pipeline/                   # Deterministic packer and validation configuration
  previews/                   # Review contact sheets and loops; excluded from packages
```

Feature directories contain feature-specific event mapping, state definitions, constants, and tests. Reusable engine code must not import from `features`. Platform code must not import renderer code. Shared code must remain side-effect free. Asset tooling reads repository-level `assets/source`, writes validated runtime output to `src/assets/generated`, and never edits generated output by hand.

## Coding Standards and Naming Conventions

### Files and symbols

| Item | Convention | Example |
| --- | --- | --- |
| React component file | PascalCase | `ReminderCard.tsx` |
| React component | PascalCase noun | `SettingsPanel` |
| Hook file and function | camelCase with `use` prefix | `useSettingsSync.ts`, `useSettingsSync` |
| Class | PascalCase noun | `AnimationEngine` |
| Interface or type | PascalCase, no `I` prefix | `AnimationClip`, `Point` |
| Function and variable | camelCase | `resolveDisplayBounds` |
| Constant | camelCase for scoped values; SCREAMING_SNAKE_CASE only for process-wide invariants | `blinkIntervalMs`, `MAX_FRAME_DELTA_MS` |
| Feature folder | camelCase | `waterReminder/` |
| Non-component module | camelCase | `settingsRepository.ts` |
| Test | source name plus `.test` | `behaviorScheduler.test.ts` |
| Asset file | lowercase snake case | `water_reminder_01.png` |
| Event name | lowercase namespaced verb in past tense | `input.typing_started` |
| State name | PascalCase string union member | `Typing` |

Use domain names rather than implementation names. Prefer `snoozeReminder` to `handleClick`, `landingVelocity` to `value`, and `companionBounds` to `rect`. Boolean names begin with `is`, `has`, `can`, or `should`. Durations include their unit, such as `idleTimeoutMs`. Coordinates identify their space when ambiguity exists, such as `screenPosition` and `localPointer`.

### Module rules

- One primary responsibility per module. A module should remain below 300 lines unless it is a declarative table or generated data.
- Use named exports. Default exports are limited to Vite or Electron configuration files that require them.
- Keep public types beside the owning subsystem in `types.ts`; do not create a global catch-all types file.
- Import through configured aliases such as `@engine/animation` and `@features/drag`; do not cross more than two directories with relative paths.
- Dependencies are injected into engines as typed constructor or factory arguments. Do not import mutable singletons inside business logic.
- Comments document invariants, coordinate systems, compatibility constraints, or non-obvious tradeoffs. They do not restate code.

## TypeScript Rules

TypeScript runs in strict mode. Enable `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, and `useUnknownInCatchVariables`. Production code must compile without suppressed errors.

- Do not use `any`. Accept untrusted values as `unknown` and parse them at the boundary.
- Model state and events with discriminated unions. Exhaustive switches end with an `assertNever` check.
- Use `readonly` for event payloads, configuration, animation metadata, and engine inputs.
- Avoid numeric enums. Use string unions or `as const` objects for serializable values.
- Do not use non-null assertions except after a local invariant check that cannot be represented in the type system.
- All IPC payloads, imported settings, and persisted data are runtime-validated before use.
- Public functions declare return types. Event handlers may infer `void` when local.
- Time is represented as monotonic milliseconds for runtime scheduling and ISO 8601 UTC strings for persisted timestamps.
- Coordinates and scalar values use small structural types rather than tuples when the meaning is not obvious.

```ts
type CompanionEvent =
  | { readonly type: 'input.typing_started'; readonly atMs: number }
  | { readonly type: 'input.typing_stopped'; readonly atMs: number }
  | { readonly type: 'agent.generation_started'; readonly sourceId: string }
  | { readonly type: 'agent.generation_finished'; readonly sourceId: string };
```

## State Management Strategy

Zustand owns serializable application state required by more than one UI or subsystem. It is not the frame loop and must not receive per-frame sprite coordinates.

`settingsStore` holds the validated settings snapshot, persistence status, and settings-window form status. `companionStore` holds the current logical state, active reminder metadata, current display identity, window scale, developer diagnostics, and reduced-motion status. Store slices expose commands rather than generic setters.

The following values stay outside Zustand:

- Pixi display objects, textures, and renderer instances.
- Mutable animation playheads and physics integration values.
- Pointer samples, frame timestamps, and particle pools.
- Electron objects and IPC subscriptions.

Selectors must be narrow and stable. React components subscribe to the smallest value needed. Engine consumers use explicit store subscriptions and dispose them during shutdown. State updates are immutable. Derived state is computed in selectors unless caching is measurably necessary.

Settings follow a main-process-authoritative model. A renderer submits a complete validated patch with the last known revision. The main process validates, persists atomically, increments the revision, applies platform effects, and broadcasts the accepted snapshot to both renderers. Revision mismatch returns the latest snapshot rather than overwriting a newer update.

## Event Bus

The event bus is an in-process typed publish/subscribe service. Main-process events cross IPC once, then enter the companion renderer bus. An event describes something that occurred and does not request a visual implementation.

Event categories are `app`, `window`, `display`, `pointer`, `input`, `agent`, `reminder`, `settings`, `behavior`, `animation`, and `physics`. Payloads must be immutable, minimal, and serializable. Each event includes a monotonic timestamp where ordering matters and a correlation identifier for paired external signals such as generation start and finish.

Delivery is synchronous within one event-loop turn so transition ordering remains deterministic. Subscribers may publish follow-up events, but the bus queues nested publications until the current event has reached all subscribers. This prevents re-entrant state mutations. Subscriber failures are isolated, logged, and do not stop delivery to remaining subscribers.

High-frequency sources are reduced before publication. Raw cursor sampling is capped at 30 Hz; eye movement itself is interpolated at render frequency. Key events become typing activity edges rather than one bus event per key. Duplicate generation signals and reminder triggers are deduplicated by source identifier.

Every subscription returns an unsubscribe function. Feature teardown must leave zero listeners. The bus supports developer-mode inspection through a bounded 200-event ring buffer containing metadata only; typed text, window titles, and document content must never be captured.

## Behavior Engine

The Behavior Engine converts events, elapsed time, and settings into behavior requests. It owns scheduling, priority, cooldowns, interruption policy, and the rule that every completed behavior resolves to `Idle`.

Behavior requests have an identifier, state target, priority, start condition, interrupt policy, maximum duration, and optional deduplication key. Priority order is:

1. Direct manipulation: drag and release physics.
2. Completion reaction: Agent Done.
3. Active external state: Thinking.
4. Due reminder: water or stretch.
5. Activity response: Typing.
6. Ambient behavior: blink, look, yawn, scratch, and other idle actions.

Higher priority does not automatically mean interruption. Drag can interrupt all character actions because it is initiated directly by the user. A generation-finished signal ends Thinking immediately and may enter Celebrate. Reminders wait while Dragging, Landing, Thinking, or Celebrate is active. Typing suppresses new ambient actions but does not dismiss an active reminder card. Ambient behavior never interrupts another state.

The scheduler uses monotonic deadlines and pauses reminder countdowns while the operating system is asleep. On wake, it must not replay every elapsed reminder; at most one eligible reminder is scheduled after a quiet grace period. Random idle actions use an injectable seeded random source in tests and enforce minimum separation so behavior remains organic without becoming busy.

## State Machine

The companion state machine is the sole authority for logical character state. Initial state is `Booting`; successful texture and settings readiness transitions to `Idle`.

```ts
type CompanionState =
  | 'Booting'
  | 'Idle'
  | 'Dragging'
  | 'Landing'
  | 'Typing'
  | 'Thinking'
  | 'WaterReminder'
  | 'StretchReminder'
  | 'Celebrate'
  | 'Suspended'
  | 'ErrorFallback';
```

Transitions are declared in a transition table with guards and entry/exit effects. UI code and animation callbacks cannot assign state directly. Entry effects select animation clips, create bubbles, or initialize physics. Exit effects stop owned timelines, recycle particles, and remove temporary display objects. Completion transitions carry an explicit reason such as `animation_completed`, `user_dismissed`, `source_finished`, or `interrupted_by_drag`.

Every non-looping state defines a maximum duration. If its animation completion event is lost, the timeout performs cleanup and returns to `Idle`. Looping states require an external stop signal plus a safety timeout appropriate to the feature. Transition attempts that violate the table are ignored and logged in developer mode.

## Animation Engine

The Animation Engine loads animation metadata, selects texture frames, advances clip time, blends compatible transforms, and reports animation markers and completion. It is driven by Pixi's ticker but does not own state transitions.

Each clip declares frames, source FPS, loop mode, frame durations where needed, markers, pivot metadata, and reduced-motion alternative. Character clips use authored pixel frames; procedural changes are limited to container translation, integer-aligned scale, pupil offsets, squash/stretch within specified limits, and alpha for short effects. Body-part transforms must preserve the pixel grid at rest.

Frame progression is time-based rather than update-count based. Clamp a single frame delta to 50 ms after stalls so animations do not leap through completion markers. Non-looping clip completion emits exactly once. Transition clips use authored anticipation and recovery frames; do not cross-fade pixel sprites because blending creates muddy intermediate pixels.

Animation speed is a user setting applied to authored clip time within the supported `0.75x` to `1.5x` range. Physics time, reminder intervals, hover durations, and dismissal deadlines are not multiplied by this setting. `prefers-reduced-motion` and the application reduce-motion policy replace repetitive movement with short pose changes and remove spins, large bounce, and particles without removing information.

## Physics Engine

The Physics Engine handles dragging deformation, release momentum, gravity, screen-bound collision, landing bounce, damping, and recovery. It uses a fixed 120 Hz simulation step with an accumulator and a maximum of four substeps per rendered frame. Excess accumulated time is discarded after a logged stall rather than producing an unstable catch-up burst.

Positions and velocities are floating point in virtual desktop screen coordinates. Rendering converts the final interpolated pose to device pixels. All collision calculations use the character's visual footprint, current scale, and active display work area. Constants are grouped in immutable feature configuration: gravity, maximum throw velocity, restitution, horizontal friction, maximum stretch, maximum squash, and rest thresholds.

The engine does not depend on Pixi objects. It accepts a physics body and returns a pose. Physics behavior must be deterministic for a sequence of timestamped pointer samples. A body sleeps after vertical and horizontal velocity remain below thresholds for two consecutive simulation steps while grounded. Sleeping ends ticker demand from physics.

## Rendering Lifecycle

1. The companion preload installs the typed bridge before renderer code runs.
2. Bootstrap requests the validated settings snapshot and current virtual display topology.
3. Pixi creates a transparent renderer using the current device pixel ratio, nearest-neighbor texture sampling, and resolution-aware canvas sizing.
4. The asset loader loads the required bootstrap manifest: idle, blink, fallback, pupils, and shadow.
5. The scene graph is created in stable layers: shadow, character, attached effects, particles, bubbles, and developer overlay.
6. The state machine enters `Idle`; deferred feature texture groups begin loading during idle time.
7. The ticker runs only while a clip, interpolation, physics body, timed bubble, or developer overlay needs frames.
8. On display, scale, or device-pixel-ratio changes, viewport metrics update without recreating loaded textures.
9. On shutdown, adapters stop, subscriptions dispose, pending persistence completes, textures destroy, and windows close.

The scene graph must not be rebuilt each frame. Display objects are allocated at initialization or acquired from pools. Frame work mutates existing transforms and textures. Static idle frames can render on demand; blinking and breathing temporarily wake the ticker.

## Electron Architecture and Window Behavior

The main process creates windows only after `app.whenReady()`. The companion window is frameless, transparent, has no shadow supplied by the OS, stays above ordinary windows according to the `alwaysOnTop` setting, and is excluded from taskbar presentation where supported. Its content area is only large enough for the companion, effects, and bubble safe area. It must not use a full-screen transparent overlay.

The settings window is an ordinary framed utility window with a minimum content size and a single-instance policy. Reopening focuses the existing window. Closing settings releases its renderer while the companion remains running.

Use `contextIsolation: true`, `sandbox: true`, and `nodeIntegration: false`. Disable navigation outside packaged application routes. Deny new-window requests and unexpected permissions. Content Security Policy permits packaged scripts, styles, and images only. Never expose raw `ipcRenderer`, file-system APIs, shell execution, or arbitrary channel names through preload.

The main process owns virtual screen coordinates. When the companion moves across monitors, it resolves the active display using the character center, clamps only enough area to keep a grab target reachable, and persists the DIP position plus display identifier. If the recorded display no longer exists, restore to the nearest work area and maintain a safe edge inset.

## IPC Communication

IPC contracts live in `src/preload/contracts.ts` and are shared as types, not implementations. Channels are constants and follow `domain:action` naming, for example `settings:get`, `settings:update`, `window:set-always-on-top`, and `display:get-topology`.

Request/response operations use `ipcRenderer.invoke` with a validated result envelope. Main-to-renderer streams use narrowly exposed subscriptions that return cleanup functions. Every handler validates sender origin and payload schema. File paths for settings import and export originate from native dialogs in the main process; renderer input cannot provide an arbitrary write target.

Errors cross IPC as stable codes and safe messages:

```ts
type IpcResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: IpcErrorCode; readonly message: string };
```

Global input integrations publish only activity categories and timestamps. Keyboard content, clipboard content, filenames, application content, and cursor click targets are outside the data contract.

## Pixi Rendering Pipeline

Set `TextureStyle.defaultOptions.scaleMode` to nearest-neighbor before any texture is created. Sprite sheets are decoded into shared base textures and cached by manifest key. The renderer uses premultiplied alpha consistently with exported PNG assets.

The root stage uses logical asset pixels. A character scale setting selects an integer display multiplier wherever device geometry permits. The camera container positions the root in physical pixels after device-pixel-ratio conversion. Character pivots come from animation metadata so frame changes do not cause foot sliding.

Layer order is fixed:

1. Ground shadow.
2. Body and authored body parts.
3. Pupils and attached props.
4. Character-local particles.
5. World particles.
6. Speech bubble and reminder controls.
7. Developer overlays.

Round final sprite translation to physical pixel coordinates when the body is at rest. During drag and physics motion, retain subpixel simulation and round only the presented transform. Filters, runtime blur, antialiasing, mipmaps, and fractional CSS scaling are prohibited for character art.

## React and Renderer Responsibilities

React owns declarative settings UI and accessible HTML controls. It may also own an invisible semantic control layer aligned to a Pixi reminder card if platform accessibility requires it. React does not render the character or advance animations.

The companion renderer owns Pixi application setup, canvas hit regions, scene layers, engine instances, and event-to-state wiring. The settings renderer owns draft form state and invokes typed settings commands. Neither renderer accesses the file system, auto-launch APIs, display APIs, or global input APIs directly.

Do not mount a React component on every animation frame. Pixi callbacks update Pixi objects directly. React receives low-frequency logical state only. Shared settings controls use Zustand selectors, while local hover and focus visuals stay inside the component unless another subsystem needs them.

## Configuration and Persistence

Default configuration is versioned in source and includes companion scale, animation speed, water interval, stretch interval, reminder enablement, always-on-top, auto-launch, developer mode, and last safe position. Defaults must match product specifications: water every 45 minutes and stretch every 60 minutes.

Persist settings with Electron Store in the application data directory. The persisted document contains a `schemaVersion` and revision. Writes are atomic. Migrations are ordered, idempotent functions from one version to the next. If parsing or migration fails, move the invalid document to a timestamped recovery file, load defaults, and surface a non-blocking settings error.

Do not persist active animation state, current typing status, reminder bubbles, particle state, or transient physics velocity. Persist the companion position only after 500 ms without movement and again during orderly shutdown. Reminder deadlines persist as timestamps so relaunch does not reset the interval, but overdue reminders follow the wake/startup grace policy.

Import accepts only a JSON settings document through a native open dialog. Validate schema and supported version before showing a preview. Export writes a stable, human-readable JSON document without machine paths, timestamps unrelated to reminders, event history, or diagnostic data.

## Performance Goals

Performance budgets apply to a release build on a supported mid-range device:

| Metric | Goal | Measurement |
| --- | --- | --- |
| Cold launch to visible idle | under 2 seconds | Process launch to first idle frame |
| Total resident memory | under 150 MB | Main plus both renderers; settings window closed for baseline |
| Idle CPU | under 2% | Five-minute average with static cursor |
| Active animation CPU | under 5% | Five-minute average across core behaviors |
| Animation cadence | 60 FPS when active | 99% of frames under 16.7 ms on a 60 Hz display |
| Input-to-visual latency | under 50 ms | Typing edge or drag sample to first visual response |
| Idle wakeups | fewer than 10 per second | No active animation, physics, or pointer proximity |

Only run the ticker on demand. Coalesce pointer and settings updates. Pool particles and bubble controls. Load texture groups lazily, destroy feature textures only under measurable memory pressure, and avoid garbage creation in ticker callbacks. Performance changes require before-and-after traces; do not trade visible frame stability for small memory reductions without evidence.

## Error Handling and Logging

Errors are handled at subsystem boundaries. Asset failure selects a packaged fallback pose. Invalid settings revert only the invalid field where possible. Platform adapter failure disables that integration while preserving idle and direct interactions. An engine callback failure exits the active behavior, performs cleanup, and returns to `Idle` or `ErrorFallback`.

Logs use levels `debug`, `info`, `warn`, and `error`, a subsystem name, stable event code, and structured metadata. Production defaults to `info`; developer mode enables bounded debug telemetry. Do not log keystrokes, typed text, cursor targets, window titles, imported settings contents, or absolute user paths. Repeated expected failures are rate-limited.

The developer overlay may show current state, active clip, FPS, frame time, physics velocity, display ID, last event type, loaded texture count, and next reminder deadlines. It must not change scheduler behavior and is excluded from release screenshots and exported settings.

## Testing Strategy

Testing follows the ownership boundary:

- Unit tests cover state transition tables, behavior priority, cooldowns, reminder deadlines, settings validation, migrations, geometry, animation markers, and deterministic physics.
- Property tests exercise clamping, import validation, and physics invariants across generated display sizes and velocities.
- Component tests cover settings keyboard navigation, field validation, confirmations, focus restoration, and accessible names.
- Integration tests run the renderer with a fake clock, fake event bus, and texture fixtures to verify event-to-state-to-animation sequences.
- IPC contract tests call registered handlers with valid and invalid payloads and verify sender checks.
- Electron end-to-end tests cover launch, companion restoration, drag across displays, settings persistence, import/export, and offline packaged startup.
- Visual regression tests capture integer scales for idle, each feature pose, bubble layouts, settings states, and light/dark system contexts where applicable.
- Performance tests measure idle wakeups, texture memory, frame duration, listener count after repeated feature cycles, and particle pool reuse.

Tests use fake monotonic time; they do not wait for real reminder intervals. Each bug fix includes a regression test at the lowest meaningful layer. Animation snapshots verify frame keys and pivots, not compressed PNG bytes.

## Dependency Guidelines

Electron, React, TypeScript, Vite, PixiJS, Zustand, and Electron Builder are the core stack. New runtime dependencies require a written need that cannot be met cleanly by the platform or existing stack.

Evaluate package size, transitive dependencies, release activity, security history, Electron compatibility, tree-shaking behavior, license, and maintenance ownership. Pin exact major versions through the lockfile. Do not introduce a second renderer, state store, event bus, animation framework, validation framework, or date scheduler for a single feature. Development-only packages must not enter packaged runtime output.

Assets and native integrations must work without a network connection. Runtime downloads, remote scripts, analytics SDKs, and CDN-hosted resources are prohibited. Native modules require signed binaries for every supported architecture and a packaging test on each target.

## Feature Development Workflow

1. Start from the feature specification and identify events, states, priority, interruption rules, assets, settings, and platform inputs.
2. Add or extend typed contracts before implementation. Define observable completion and failure conditions.
3. Implement pure scheduling, state, and geometry logic with fake-clock unit tests.
4. Add feature assets and manifest metadata according to `ASSETS.md`; validate pivots and frame bounds.
5. Wire the feature to the event bus and state machine. Entry and exit effects must be symmetrical.
6. Implement rendering and physics without per-frame allocations.
7. Add settings controls only where the feature specification requires them.
8. Exercise interruption paths, multi-display geometry, sleep/wake, reduced motion, missing assets, and shutdown.
9. Record visual regression references and performance measurements.
10. Update the feature document if implementation reveals a contract that must be explicit. Product behavior changes require review before code changes.

## Build and Packaging

Vite produces separate bundles for the companion renderer, settings renderer, preloads, and Electron main process. Type checking and linting run before bundling. Production source maps are generated as private build artifacts and are not shipped in public packages unless release diagnostics require them.

Electron Builder packages platform-specific artifacts. The build includes only compiled application code, validated manifests, required sprites, licenses, and platform resources. Exclude tests, raw source art, design working files, local logs, and developer fixtures. macOS builds require hardened runtime, application signing, and notarization. Windows builds require code signing and both installer and clean uninstall verification.

The release pipeline must:

1. Install from a locked dependency graph.
2. Run formatting checks, lint, strict type checking, unit tests, component tests, and integration tests.
3. Build all process targets.
4. Validate Content Security Policy and packaged asset manifests.
5. Package each target and architecture.
6. Run packaged smoke tests with networking disabled.
7. Record artifact hashes, versions, and signing status.

Application versions follow semantic versioning. Settings schema and asset manifest versions are independent integers and change only when their serialized formats change.

## Code Review Expectations

Every change must be narrow enough to reason about and include its behavioral intent. Reviewers verify:

- The change matches a documented feature and does not turn the companion into a notification surface or conversational tool.
- Events are facts, state transitions are explicit, and every behavior has a tested route back to `Idle`.
- Entry effects, exit effects, subscriptions, timers, textures, and particles are cleaned up.
- Global inputs collect activity only and preserve user privacy.
- Pixi work avoids per-frame allocation, fractional pixel drift, filters, and unnecessary ticker activity.
- IPC remains minimal, validated, isolated, and origin-checked.
- Settings are migrated and backward compatible.
- Keyboard, focus, reduced-motion, scaling, and multi-display behavior are covered.
- Tests demonstrate success, interruption, timeout, and failure paths.
- Packaged size and performance budgets do not regress without an approved tradeoff.

Changes that alter state priority, event schemas, persistence format, platform permissions, asset dimensions, or user-visible interaction require review from the relevant system owner. A feature is complete only when implementation, assets, tests, diagnostics, and documentation agree.
