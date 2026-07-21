# User Interface Specification

## Scope

PsyDuck has two interface layers: the companion surface and the settings window. The companion surface is primarily animated pixel art with small, temporary speech bubbles and reminder controls. The settings window is a conventional, keyboard-accessible desktop utility. UI supports the character; it must not compete with it or turn routine behaviors into notifications.

No UI plays sound, requests conversational input, displays advertising, uses urgency language, or blocks the user's active application.

## Interface Surfaces

| Surface | Purpose | Input model | Lifetime |
| --- | --- | --- | --- |
| Companion | Render character, direct drag interaction, bubbles, and small effects | Pointer; bounded semantic controls | Application lifetime |
| Settings window | Configure application behavior | Pointer and keyboard | Open on demand; single instance |
| Reminder card | Offer a quiet reminder with Dismiss and Snooze | Pointer and keyboard | Until action, replacement, or timeout policy |
| Speech bubble | Express character state with concise text or symbols | Usually passive | Bound to the owning behavior |
| Developer overlay | Diagnose state, frames, physics, and events | Read-only by default | Developer mode only |

The companion window is not a general-purpose panel. It must remain close to the visual bounds of PsyDuck and its active bubble. Settings and diagnostics that require reading, navigation, or data entry belong in the settings window.

## Design Language

The visual language combines authentic pixel character art with restrained desktop controls. Character, bubble frames, reminder icons, and decorative UI use hard pixel edges. Text and form controls prioritize legibility and platform accessibility; they are not rasterized to imitate low-resolution game text.

Principles:

- One clear primary action per decision point.
- Information appears near the object it affects.
- Motion explains state change and does not decorate static settings.
- UI is quiet at rest. Persistent pulsing, shimmer, marquee, and animated backgrounds are prohibited.
- Color supports structure and state but never carries meaning alone.
- Destructive and privacy-relevant actions are explicit and reversible where possible.

## Layout and Spacing

The settings window uses a 4 px base grid. Standard spacing tokens are:

| Token | Value | Use |
| --- | ---: | --- |
| `space-1` | 4 px | Icon-to-label fine spacing |
| `space-2` | 8 px | Inline control spacing |
| `space-3` | 12 px | Compact row padding |
| `space-4` | 16 px | Standard panel padding and field gaps |
| `space-5` | 24 px | Section spacing |
| `space-6` | 32 px | Major group separation |

Settings content has a maximum width of 720 px and minimum horizontal padding of 20 px. Control labels align to a consistent column at wide widths. At narrow widths, labels stack above controls. Section separators use space and a one-pixel rule; do not wrap every section in a card.

Reminder cards use 8 px internal padding at 1× logical scale, a 6 px gap between message and actions, and a minimum 8 px safe area from the companion. Bubble dimensions fit content and never use more than two text lines in V1. The bubble tail remains attached to the character while the body is stationary.

## Typography

Use the platform system sans-serif stack in settings and live bubble text. This preserves ClearType, Retina rendering, language coverage, and accessibility scaling. Do not use a bitmap font for settings.

| Style | Size / line height | Weight | Use |
| --- | --- | --- | --- |
| Window title | 20 / 28 px | 650 | Settings title |
| Section title | 14 / 20 px | 650 | Settings groups |
| Body | 13 / 20 px | 400 | Labels, descriptions, reminder copy |
| Control label | 13 / 18 px | 550 | Field labels and button text |
| Caption | 12 / 16 px | 400 | Help, range, and status text |
| Diagnostic mono | 11 / 16 px | 400 | Developer overlay values |

Support operating-system text scaling to at least 200% in the settings window. Text may reflow and increase window scroll height; it must not clip or overlap. Companion speech bubbles use 12 px minimum rendered text at the effective scale. Use tabular numerals for intervals, scale values, FPS, and deadlines.

Copy is direct and sentence case. Use “Always on top,” “Start at login,” “Snooze,” and “Reset settings.” Avoid exclamation marks in controls. The established reminder messages, “Drink Water!” and “Time to stretch!”, are the only V1 exclamation exceptions.

## Color Usage

Settings follow system appearance and use semantic tokens rather than literal colors in components:

| Token | Purpose |
| --- | --- |
| `surface-window` | Main settings background |
| `surface-raised` | Menus, confirmations, and inset previews |
| `surface-hover` | Hovered rows or controls |
| `text-primary` | Labels and primary content |
| `text-secondary` | Help and metadata |
| `border-default` | Separators and idle control borders |
| `border-focus` | High-contrast keyboard focus ring |
| `accent` | Selected controls and primary action |
| `danger` | Reset confirmation and destructive error state |
| `success` | Completed import/export status |
| `warning` | Recoverable configuration or integration issue |

The companion palette is fixed by the asset specification and does not adapt to system theme. Speech bubbles use an opaque light neutral fill with a dark pixel border because they appear over arbitrary desktop backgrounds. If contrast against the immediate background becomes unreliable, add a one-pixel outer keyline from the approved bubble palette; do not add blur.

All text and essential control boundaries meet WCAG 2.2 AA contrast. Focus indicators meet at least 3:1 contrast against adjacent colors. Danger color is paired with an icon and text. Disabled state uses opacity plus loss of interactivity, not color alone.

## Dark Mode Handling

The settings window automatically follows the operating system appearance. There is no separate theme setting in V1. Switching appearance while the window is open updates tokens without recreating the form or discarding edits.

Dark mode uses dark neutral surfaces, light primary text, and an accent adjusted to preserve contrast. Borders remain visible without becoming bright boxes. Native title bar treatment should match the chosen Electron window frame. Screenshots, previews, and icons with fixed backgrounds provide theme variants where required.

The transparent companion does not tint or recolor in dark mode. Pixel-art outline and bubble border must be tested over both theme extremes and real desktop imagery.

## Pixel Consistency

- Character and effect sprites render with nearest-neighbor sampling.
- Decorative pixel borders use whole physical pixels at supported display scales.
- Integer scale settings are the only character scale values.
- Character-at-rest, bubble tail, and pixel icons align to physical pixels.
- CSS transforms must not apply fractional scale to pixel assets.
- Form text, focus rings, native menus, and scrollbars remain device-resolution UI; forcing them onto a coarse pixel grid would reduce accessibility.
- Mixing outline weights within the same bubble or icon family is prohibited.

At 125%, 150%, or other operating-system display scaling, calculate device-aware dimensions instead of stretching a pre-rendered companion canvas. If a border cannot resolve to exactly one physical pixel, prefer a crisp two-pixel edge over an antialiased fractional edge.

## Settings Window

The Settings window is a single-instance utility window. Default content size is 640 × 680 px, minimum size is 480 × 560 px, and content scrolls vertically when required. Restoring the previous size is acceptable if the resulting bounds remain inside a current display work area.

The top-level order is stable:

1. Companion
2. Reminders
3. Window and startup
4. Data
5. Developer mode

### Companion

| Setting | Control | Range / values | Behavior |
| --- | --- | --- | --- |
| Scale | Segmented buttons or select | 1×, 2×, 3×, 4× where supported | Preview immediately; persist accepted value |
| Animation speed | Slider with numeric value | 0.75×–1.5×, step 0.05× | Affects authored character clip time only |
| Always on top | Switch | On / Off | Applies immediately to companion window |

Scale controls show only values that remain crisp on the active display configuration. The current effective scale is announced when a requested scale must be adjusted. Animation speed includes a “1×” tick and Reset-to-default affordance in its value menu, not a separate persistent button.

### Reminders

Water and Stretch each have an enabled switch and interval control. Water defaults to 45 minutes; Stretch defaults to 60 minutes. Interval values are expressed in minutes, not ambiguous clock strings. The supported range is 15–240 minutes in five-minute increments. Disabling a reminder removes its active bubble and pauses scheduling until re-enabled.

Snooze duration is not a global setting in V1; each reminder exposes its documented default action. Help text explains that reminder timers resume after sleep without replaying missed reminders.

### Window and startup

“Start at login” is a switch backed by the platform auto-launch adapter. While an operating-system change is pending, disable only that control and show an inline progress state. If permission or platform policy prevents the change, restore the prior value and show a concise error under the control.

“Always on top” may appear in the Companion group; it must not be duplicated here. Window position is managed by dragging the character and is not exposed as numeric coordinates.

### Data

Data actions appear in this order: Export settings, Import settings, Reset settings. Export opens a native save dialog and never overwrites without platform confirmation. Import opens a native file dialog, validates the document, and presents a summary of changes before Apply. Reset is visually separated as destructive and requires confirmation.

Status feedback appears inline in this section and is announced through a polite live region. It does not create an operating-system notification.

### Save model

Changes save automatically after validation. Immediate controls such as switches apply on activation. Sliders preview while moving and persist on pointer release, Enter, or loss of focus after a 250 ms debounce. An unobtrusive “Saved” status may appear for two seconds; it must not shift layout.

If persistence fails, retain the user's draft, show “Couldn’t save settings,” and offer Retry. Do not claim that a setting was applied if the main process rejected it.

## Developer Mode

Developer mode is a settings switch with the description “Show runtime diagnostics for animation and behavior.” Enabling it reveals a compact Developer section and makes the companion diagnostic overlay available.

The section contains read-only values and bounded controls:

- Current companion state and state age.
- Active animation clip, frame, and playback rate.
- FPS, average frame time, and ticker sleep status.
- Physics position, velocity, grounded status, and active display.
- Last event type and next reminder deadlines.
- Loaded atlas groups, texture count, and particle pool use.
- Buttons to copy a sanitized diagnostic snapshot and clear the local event ring buffer.

Developer mode may expose manual behavior triggers only when they call the same event contracts as production and are visibly labeled “Preview.” Previews must respect state guards and cannot alter persisted reminder deadlines. Typed content, active application names, user file paths, and cursor targets are never shown.

The overlay uses a small opaque panel positioned away from the character face and reminder actions. It is ignored by pointer hit testing unless an explicit inspector toggle is active. Developer mode resets to Off on settings import unless the imported document explicitly enables it.

## Reminder Cards

A reminder card is a speech bubble with a semantic icon, one-line message, Dismiss action, and Snooze action when the feature supports snoozing. It is visually attached to PsyDuck, not to a screen corner or notification center.

Water layout:

```text
[droplet] Drink Water!
           Dismiss   Snooze
```

Stretch layout:

```text
[stretch] Time to stretch!
            Dismiss
```

Actions use compact text buttons with minimum 32 × 28 px pointer targets inside the small companion surface. When exposed through the semantic DOM layer, their accessible target is at least 44 × 44 CSS px without changing visible pixel geometry. Dismiss is neutral. Snooze is the emphasized action only when the default keyboard action is Snooze; otherwise both actions are equal.

Only one reminder card is visible. If both reminders become due, the scheduler displays the earlier deadline and queues the other with a quiet separation interval. Reminder cards do not steal system focus, bounce the dock/taskbar, flash the window, or raise above full-screen applications solely to demand attention.

## Speech Bubbles

Speech bubbles support three modes:

| Mode | Content | Controls |
| --- | --- | --- |
| Expression | `…`, `?`, `!`, or approved small icon | None |
| Status | Thinking three-dot sequence | None |
| Reminder | Short message and semantic icon | Dismiss and optional Snooze |

Bubbles choose above-right, above-left, or above-center placement based on available work area. They must remain within the active display. The tail changes variant rather than stretching. If neither side has enough room, position above center; if vertical room is unavailable, position beside the character and adjust the tail.

Expression bubbles remain visible for 800–1,600 ms according to their behavior. Status bubbles last exactly as long as the owning state. Reminder bubbles follow their feature's dismiss rules. Bubble appearance and disappearance are 100–160 ms frame-based scale/pose transitions from the tail origin; no opacity-only fade over the desktop.

## Notifications

PsyDuck uses companion bubbles for routine reminders and state reactions. It does not issue native operating-system notifications in V1. This prevents duplicate surfaces and avoids interrupting the user.

Errors that affect only settings appear inline in Settings. A critical packaged-resource failure may show one non-modal settings banner and keep the fallback companion visible. The application must not send repeated banners for the same error code within one session.

No surface uses badges, unread counts, alarm styling, red urgency color for wellness reminders, sound, or vibration.

## Controls

### Buttons

Buttons have default, hover, pressed, focus-visible, disabled, and progress states. Primary buttons use the accent fill; secondary buttons use a neutral surface and border; destructive buttons use danger styling only in the confirmation context. Button labels are verbs or verb phrases.

Minimum settings button height is 32 px; primary dialog buttons are 36 px. Icon-only buttons require a tooltip after 600 ms hover and an accessible name. Pressed state moves decorative pixel icon content by at most one physical pixel; text does not jump.

### Dropdowns

Use native or accessible custom selects for finite choices. The closed control shows the complete selected value. Menus support Up/Down, Home/End, typeahead, Enter, Escape, and outside-click dismissal. Menu placement remains within the settings work area and supports 200% text scaling.

Do not use a dropdown for binary choices, reminder enablement, or a small scale set that fits as segmented controls.

### Switches

Switches represent settings that take effect immediately. The label is clickable and describes the enabled condition. Use `role="switch"` with `aria-checked`; do not rely on left/right position alone. A pending platform operation retains focus and shows a small progress indicator without animating continuously for longer than necessary.

### Sliders

The animation-speed slider has a persistent numeric value, visible min/max labels, keyboard increments, Page Up/Page Down larger increments, and Home/End bounds. The thumb meets the target size without making the visible track heavy. Announce values as multipliers, such as “1.25 times.”

Reminder intervals should use a numeric stepper or select instead of a continuous slider because exact minute values matter.

## Interaction Rules

- A primary pointer press on the character begins Drag only after movement exceeds the drag threshold; a click without movement may open Settings if that shortcut is implemented consistently.
- Pointer input on reminder actions never initiates Drag.
- Right click may open a compact application menu, but right-drag is not required in V1.
- A bubble interaction stops propagation before it reaches character hit testing.
- Settings changes are applied through typed commands and confirmed by the authoritative settings snapshot.
- One major character behavior runs at a time. UI controls do not bypass state-machine guards.
- Hover is supplemental. Every action remains discoverable and operable without hover.
- The companion never captures keyboard focus unless an actionable reminder control is explicitly navigated.

## Hover and Press Behavior

Settings controls show hover after the pointer enters, with a 100 ms color transition for non-pixel surfaces. The companion and pixel graphics do not interpolate colors. Reminder buttons change a hard-edged background or border state immediately or in one authored frame.

Hovering the character alone does not continuously animate or display tooltips. A subtle one-time look toward the pointer may occur through Eye Follow. Hovering a reminder pauses only its automatic visual timeout; it does not change the scheduling deadline.

Pressed controls show immediate feedback within one frame. A pressed reminder button remains inside the bubble bounds and cannot shift the tail or character.

## Focus States and Keyboard Navigation

Keyboard focus is always visible. Settings use a 2 px focus ring with 2 px offset or an equivalent high-contrast platform indicator. Mouse activation may suppress the ring through `:focus-visible`, but focus itself remains intact.

Tab order follows visual order. Section headings are not focusable. After a dialog closes, focus returns to the control that opened it. Escape closes menus, file previews, and confirmations, but does not close the settings window while a destructive operation is in progress.

Reminder controls are included in keyboard navigation only when the companion window can participate without stealing focus from the user's application. The baseline interaction is pointer-accessible; an accessible alternate in Settings lists any active reminder and offers the same actions. Activating a reminder through the alternate route dismisses the visible bubble immediately.

## Accessibility

- Every form control has a persistent visible label and programmatic name.
- Help and validation messages are associated using `aria-describedby`.
- Save, import, export, and error updates use polite live regions; destructive confirmation uses an alert dialog role.
- All settings functionality is keyboard operable without timing-dependent gestures.
- Text supports 200% zoom and system scaling without horizontal scrolling at the minimum window width, except bounded diagnostic tables.
- Reduced motion removes spins, repeated bounce, and particles, and shortens bubble transforms while preserving state information.
- Color vision is not required to distinguish state, validation, enablement, or action type.
- Pointer targets meet platform guidance through visible or semantic hit areas.
- Settings remain usable with screen readers on macOS and Windows.

Because the companion is primarily visual and non-essential, it must not continuously announce ambient state changes. Screen readers announce user-invoked setting outcomes and actionable reminders only. Thinking, blinking, eye following, typing, and celebration are silent to assistive technology unless the user is inspecting developer diagnostics.

## Responsive Behavior

The settings window uses two responsive layouts:

- At 600 px content width and above, setting rows use a label/description column and a right-aligned control column.
- Below 600 px, controls stack under labels and expand to a sensible width.

No control is reduced below its minimum target to preserve a two-column layout. Data action buttons wrap as a vertical group at narrow widths. Developer diagnostic rows may wrap values, with copy actions remaining visible.

The companion surface responds to display work-area constraints rather than browser breakpoints. Bubble placement changes sides near edges. Character scale may be clamped only when required to keep the character and an actionable reminder reachable. Multi-monitor movement never splits an actionable bubble across displays.

## Window Behavior and Positioning

The companion window is transparent, frameless, and sized to its current safe visual bounds. It remains always on top only when the setting is enabled. It must not reserve desktop space, appear as a large transparent click blocker, or intercept input outside visible hit regions.

Position uses virtual desktop coordinates in device-independent pixels. Persist position after movement settles. On launch, restore relative to the recorded display when available. If display topology changes, move the minimum distance necessary to keep at least the character's grab region inside one work area.

When a bubble opens near an edge, expand or reposition the window without making the character appear to jump. Prefer growing into available space; if window movement is required, animate the adjustment over 120 ms and keep the character's ground point stable in screen coordinates.

The settings window opens centered on the display containing the companion, unless a valid previous settings position exists. It never opens underneath the companion's actionable bubble.

## Micro-interactions and Timing

| Interaction | Duration | Easing / form |
| --- | ---: | --- |
| Settings hover color | 100 ms | ease-out |
| Settings press | immediate–80 ms | ease-out |
| Focus ring | immediate | no animated loop |
| Menu open | 120 ms | ease-out, small vertical offset |
| Confirmation open | 160 ms | ease-out |
| Bubble enter | 120–160 ms | authored pixel scale/pose from tail |
| Bubble exit | 100–120 ms | reverse authored pose |
| Inline saved status | 120 ms in, 2 s hold | no layout shift |
| Companion window edge adjustment | 120 ms | smoothstep |

Character animation timings are defined by each feature and are not replaced by generic CSS easing. UI motion uses real elapsed time and finishes immediately when reduced motion is enabled. No interaction waits for an animation before accepting input.

## Dismiss and Cancellation Behavior

Dismiss means the current presentation ends, owned animation and particles clean up, and the companion returns to `Idle`. For reminders, Dismiss schedules the next reminder from the dismissal time. Snooze ends the presentation and schedules the same reminder from the snooze duration without affecting the regular interval setting.

Clicking outside a reminder card does not dismiss it; this prevents accidental dismissal during ordinary desktop use. Escape dismisses a focused reminder bubble when focus is already inside it, but the application never captures Escape globally.

Passive expression bubbles disappear when their owning animation ends. Thinking status disappears immediately on generation finish. Dragging the character dismisses passive bubbles, temporarily hides reminder cards, and restores an unresolved reminder after Landing and a quiet delay. Opening Settings does not dismiss an active reminder.

Reset confirmation requires an explicit “Reset settings” action. Cancel, Escape, or closing the dialog leaves all values unchanged. Import preview follows the same cancellation rule. File-dialog cancellation is silent.

## Settings Error States

Validation appears under the affected control and does not clear the user's input. Interval errors state the accepted range and unit. Unsupported imported versions explain that the file cannot be applied; they do not partially import unknown data.

Global persistence errors appear in a non-modal banner inside Settings with Retry and Dismiss. Dismissing the banner does not pretend the save succeeded. Auto-launch permission errors stay beside the switch. Asset or renderer fallback errors appear only in developer mode unless user action can resolve them.

Error copy includes what failed and the available next action. It excludes stack traces, numeric-only codes, and blame-oriented wording.

## UI Completion Checklist

- [ ] Settings sections and order match this specification.
- [ ] All controls have default, hover, pressed, focus, disabled, pending, success, and error behavior where applicable.
- [ ] Automatic persistence reports only authoritative success.
- [ ] Reminder cards remain quiet, reachable, and limited to one at a time.
- [ ] Speech bubbles stay inside the active display and retain a valid tail anchor.
- [ ] Character and pixel UI remain crisp at every supported scale and display factor.
- [ ] Settings work with keyboard, screen reader, 200% text scaling, high contrast, and reduced motion.
- [ ] Light and dark system appearances are visually verified.
- [ ] Companion hit regions do not block unrelated desktop input.
- [ ] Opening, moving, resizing, sleep/wake, display removal, and relaunch preserve safe window placement.
- [ ] No routine behavior creates native notifications, sound, focus theft, or persistent motion.
