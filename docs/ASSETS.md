# Asset Pipeline

## Scope

This document defines how visual assets are authored, exported, validated, loaded, and maintained. PsyDuck uses pixel art exclusively. Runtime transforms may position, scale, or deform approved sprites, but they must not conceal weak source art with filtering, blur, gradients, or antialiasing.

Source artwork is a build input. Exported PNG files and sprite metadata are runtime inputs. Engineers must never edit generated sprite sheets directly.

## Asset Principles

- The character remains readable at native size and every supported integer scale.
- A stable foot anchor prevents visible jumps between frames and clips.
- Every frame has an intentional silhouette, pose, and timing role.
- Transparent pixels are fully transparent black to prevent colored fringes.
- Runtime textures are deterministic, offline, versioned, and included in the package.
- An asset is not complete until it passes visual, structural, and performance validation.

## Folder Hierarchy

```text
assets/
  source/
    character/
      base/
      eye_follow/
      drag/
      typing/
      thinking/
      reminders/
      celebrate/
    effects/
      particles/
      shadows/
    ui/
      bubbles/
      reminder_cards/
      icons/
    palettes/
    guides/
  pipeline/
    packer.config.json
    palette.config.json
    animation_sources.json
  previews/
    contact_sheets/
    loops/
src/
  assets/
    generated/
      character/
        core/
        eye_follow/
        drag/
        typing/
        thinking/
        water_reminder/
        stretch_reminder/
        agent_done/
      effects/
      ui/
      manifests/
        assets.json
        animations.json
        atlases.json
```

`assets/source/` contains editable art files and layer-preserving originals. `assets/pipeline/` contains deterministic export, packing, palette, and validation configuration. `src/assets/generated/` contains normalized PNG atlases and manifests used by the application. Its `manifests/` directory is the only source of runtime frame order and animation metadata. `assets/previews/` is review material and is excluded from packages.

Runtime code imports through stable manifest identifiers and must not depend on the source folder structure. Working files, thumbnails, editor recovery files, and operating-system metadata are never committed inside `src/assets/generated/`. Generated output changes only through the asset pipeline and is reviewed together with its source input.

## Canvas and Sprite Dimensions

The standard character canvas is either 48 × 48 or 64 × 64 logical pixels, as established by the character artwork. One production character set must use one dimension; clips cannot mix both sizes. Select the smallest canvas that contains the largest required pose plus one transparent pixel around the outermost opaque pixel.

Every frame in a character atlas uses the same canvas dimensions and ground line. Extended actions such as stretching or jumping stay within that canvas where possible. If a feature requires overflow, it uses an explicitly declared larger atlas group and pivot metadata; it must not silently crop or resize only some frames.

The character origin is the center of the standing footprint on the ground line. Each exported frame records:

- `pivotX` and `pivotY` in logical pixels.
- `footLeft` and `footRight` contact points when visible.
- The opaque content bounds.
- Optional named attachment points such as `eyeLeft`, `eyeRight`, `hand`, and `bubbleAnchor`.

Pivots are integer coordinates. Empty borders may vary only if atlas trimming metadata restores the exact original frame and pivot.

## Palette Rules

Core character art uses a maximum 16-color indexed palette, including outline and highlight colors but excluding full transparency. Feature props may use an approved extension palette when a required semantic color is absent; they may not introduce near-duplicate shades.

The palette file is the authority for RGB values and semantic roles:

| Role | Requirement |
| --- | --- |
| Outline | Darkest approved color; readable on light and dark desktop backgrounds |
| Body base | Primary yellow with sufficient separation from highlights and shadows |
| Shadow | Hard-edged palette color; never translucent blur |
| Highlight | Used sparingly on upper-facing forms |
| Eye white | Slightly tinted value rather than display white where the base art defines it |
| Pupil | High-contrast dark value shared across eye assets |
| Semantic blue | Water reminder and droplet particles |
| Semantic neutral | Bubbles, keyboard keys, and settings-support graphics |
| Celebration accent | Sparkles only; must not recolor the character |

No gradients, color interpolation, semitransparent antialiasing, hue-shift filters, or editor-generated color profiles. Export in sRGB and strip embedded profiles that change appearance between platforms. Palette edits require a full character contact-sheet review because changing one entry affects every animation.

## Pixel-Art Rules

- Draw on the native logical-pixel grid with pencil tools only.
- Use a one-pixel outer outline unless a contact point intentionally opens the contour.
- Preserve connected clusters; avoid isolated noise pixels and accidental single-pixel holes.
- Use hard-edged shadows. The optional ground shadow is a discrete sprite with limited alpha values, not a runtime blur.
- Maintain volume between frames. Squash and stretch redistribute mass rather than changing it arbitrarily.
- Use anticipation and overshoot frames only when they clarify motion at the target playback rate.
- Keep eyes and face readable. Pupil travel must remain inside the eye mask at every supported offset.
- Props follow the same perspective, light direction, outline weight, and palette discipline as the character.
- Do not use text baked into reminder art or speech bubbles. Text is rendered separately so it can scale and remain accessible.

Animation is reviewed at native size, 2×, and 4×. Zoomed review detects pixel errors; native-size review determines whether the motion actually reads.

## File Naming

All exported asset names use lowercase snake case, ASCII characters, and a zero-padded frame suffix:

```text
idle_01.png
idle_02.png
typing_left_press_01.png
thinking_scratch_03.png
water_reminder_wave_02.png
agent_done_land_01.png
sparkle_small_03.png
```

Names follow `<feature>_<action>_<phase>_<frame>.png`. Omit segments that add no information, but never encode playback FPS, dimensions, dates, or artist initials into runtime names. Frame numbers begin at `01` and remain contiguous. Retired names are removed from the manifest; do not reuse an identifier for visually different semantics within the same asset-manifest version.

Source files use the same base name plus their editor extension. Review exports may add `.sheet` or `.preview`, but generated previews never share a path with runtime files.

## Sprite Sheets and Atlases

Texture packing is organized by loading boundary, not by an arbitrary maximum sheet count:

| Atlas group | Contents | Load policy |
| --- | --- | --- |
| `character_core` | Idle, blink, fallback, pupils, shadow | Blocking at bootstrap |
| `interaction_direct` | Drag, stretch deformation overlays, landing | Loaded immediately after core |
| `activity` | Typing and Thinking clips | Deferred during first idle period |
| `reminders` | Water, stretch, bubbles, reminder icons | Deferred before first reminder deadline |
| `celebration` | Agent Done clips and sparkles | Deferred with activity assets |
| `settings_ui` | Pixel icons used by settings | Settings-window only |

Use lossless PNG atlases with accompanying JSON. Atlas pages must not exceed the target GPU's conservative texture-size limit; use 2048 × 2048 as the normal upper bound. Packing may trim transparent borders and rotate only assets whose orientation metadata is correctly restored. Character frames should not be rotated because it complicates pivot review.

Add two transparent pixels of extrusion/padding around packed regions to prevent neighboring pixels from sampling during scaled or deformed rendering. Disable mipmaps. All regions reference one shared base texture per atlas page.

## Animation Exports

Animation definitions live in `animations.json` and reference atlas frame keys. An animation entry contains:

```json
{
  "id": "typing.knead",
  "frames": ["typing_left_press_01", "typing_left_press_02"],
  "fps": 12,
  "loop": true,
  "pivot": { "x": 24, "y": 44 },
  "markers": [{ "frame": 1, "name": "left_contact" }],
  "reducedMotionId": "typing.knead_reduced"
}
```

Core idle art contains 12 authored frames and normally plays at 10 FPS. Feature clips normally target 12 FPS unless their specification defines phase-specific holds. The manifest is authoritative; runtime code never infers order by sorting filenames.

Each non-looping clip declares its final hold duration and completion semantics. Looping clips identify a safe loop boundary and, where necessary, an exit clip. Markers fire on meaningful contacts, takeoff, apex, landing, bubble reveal, or particle emission. Markers must not be placed on frames that the playback engine can skip without compensating dispatch.

## Export Process

1. Confirm the source document uses the approved canvas, palette, and ground guide.
2. Flatten only for export; retain the layered source.
3. Hide guides, labels, onion skins, editor backgrounds, and unused layers.
4. Export frames as RGBA PNG in sRGB with nearest-neighbor resampling disabled because no resizing should occur.
5. Normalize transparent RGB values and reject partial alpha except for assets explicitly allowing it.
6. Run frame dimension, palette, alpha, filename, and sequence validation.
7. Pack the appropriate atlas group with required padding.
8. Generate atlas and animation manifests with stable keys.
9. Render contact sheets and animated loop previews from the generated manifest.
10. Review at native size and supported integer scales on light, dark, and visually busy backgrounds.
11. Run the application asset smoke test and record the new manifest version when the serialized contract changes.

Export scripts must be deterministic. Given the same source PNGs and configuration, they produce byte-equivalent metadata and visually equivalent atlases. Generated file ordering, JSON key ordering, and whitespace remain stable to keep reviews readable.

## Scaling and Nearest-Neighbor Rendering

Assets are authored at 1× and displayed at integer logical scales. Supported companion scale choices map to approved integer multipliers; the UI may present friendly labels but must not produce arbitrary fractional character scaling.

Pixi texture scale mode is nearest-neighbor globally before texture creation. Mipmaps and anisotropic filtering are disabled. CSS must not resize the canvas independently from renderer resolution. The canvas backing resolution follows device pixel ratio, while character sprites resolve to whole physical pixels.

At rest, round the final character container position to a physical pixel. During motion, simulation retains subpixel precision but the presented sprite remains snapped at the render boundary. Speech bubble HTML or vector typography may use device-resolution rendering, but its pixel frame and tail align to the logical pixel grid.

When an operating-system scale factor makes a requested multiplier land on fractional physical pixels, choose the nearest supported multiplier that preserves sharpness and report the effective scale in settings. Do not enable bilinear filtering to conceal scaling mismatch.

## Transparency

PNG backgrounds must be fully transparent. The outermost opaque character pixel requires at least one transparent pixel of source padding. Standard character pixels use alpha `0` or `255`; the approved ground shadow, sparkle fade variants, and UI overlay may use a small documented alpha set.

Remove color data from fully transparent pixels during export to prevent halos. Review alpha edges against white, black, body-yellow, blue, and magenta checker backgrounds. An asset fails if it shows matte contamination, a one-pixel box edge, clipped motion, or semitransparent antialiasing.

## Compression and Optimization

PNG compression must be lossless and must preserve the exact palette and alpha values. Use indexed PNG when it preserves all required alpha steps; otherwise use optimized RGBA PNG. Never use JPEG, lossy WebP, or an optimizer mode that changes colors.

Optimization targets decoded runtime cost first and package bytes second:

- Reuse identical frames through manifest references rather than storing duplicates.
- Trim safe transparent borders in atlases while retaining source-size and pivot metadata.
- Group assets by actual load boundary to avoid decoding unused features.
- Share particle frames across features where their visual meaning is identical.
- Avoid sheets so large that one minor feature forces a costly base texture into memory.
- Remove unreachable frames and preview assets from production manifests.

Every optimization pass must compare pixels or palette indices before and after. Package-size reduction does not justify a visible change.

## Texture Loading and Caching

The asset loader reads the versioned manifest, resolves packaged URLs, decodes each required atlas once, and stores handles by stable group identifier. Feature code asks for a typed frame or clip identifier; it never constructs a file path.

Bootstrap blocks only on `character_core`. Direct-interaction assets load next because drag can happen immediately. Other groups load through an idle task with a hard deadline before their first possible trigger. If an event arrives before its group is ready, the behavior engine holds the request for a short bounded period or uses an approved core fallback pose. It must not display a broken texture or stall the frame loop.

Concurrent requests for the same group share one promise. Failed loads use bounded retry only for transient decode errors; packaged missing files are deterministic errors and fall back immediately. Texture references are released on renderer shutdown. Normal feature cycling does not destroy and recreate atlases.

The loader reports load duration, decoded dimensions, base texture count, and failure code in developer mode. It never logs user paths.

## Lazy Loading

Lazy loading is scheduled around product behavior:

1. Load core before first frame.
2. Load drag and landing immediately after visible idle.
3. Load activity and celebration during the first idle window or within two seconds, whichever comes first.
4. Load reminder assets before the earliest reminder can be due.
5. Load settings-only graphics when the settings window opens.

All required runtime assets are local; lazy means deferred decode, not network fetch. A group may be evicted only after memory pressure is observed, it is not active, and its reload does not threaten an imminent behavior. Core and direct-interaction groups are pinned.

## Particles

Particles are small authored sprites controlled by a pool. Supported V1 particles are water droplets where required by reminder animation and sparkle variants for Agent Done. Particles contain no blur, trails, procedural gradients, or additive glow.

Each emitter defines maximum live count, spawn marker, lifetime, initial velocity range, gravity, integer rotation policy, alpha frame sequence, and reduced-motion behavior. Agent Done may show 4–8 sparkles with a maximum 700 ms lifetime. Particle creation occurs on an animation marker, not every ticker callback.

Pool capacity is fixed to the feature's maximum. Exhaustion drops new particles rather than allocating. Reset position, texture, alpha, scale, velocity, and ownership before returning an item to the pool. Particles never expand the clickable region and never remain after the owning state exits.

## Speech Bubbles

Speech bubbles consist of a nine-slice-compatible pixel frame, an authored tail, optional semantic icon, live text, and optional HTML controls for reminder actions. The frame corners and tail are never scaled fractionally. Bubble dimensions snap to the spacing grid and have minimum clear space around text.

The bubble tail supports left, center, and right attachment variants so placement can avoid a screen edge without mirroring text. Bubble assets contain no text. Three-dot Thinking content uses three authored dot states or independently toggled pixel dots; it does not use a generic loading spinner.

Bubble art must remain legible on any desktop background. Use an opaque or near-opaque approved fill and a high-contrast one-pixel border. The bubble has no drop-shadow blur. Dismiss and snooze controls follow `UI.md` and must not be baked into the sprite.

## Reminder Graphics

Water and stretch reminders share the bubble frame and control components but use distinct semantic art:

- Water uses a droplet icon and wave/attention character frames. The message is concise and does not use decorative text art.
- Stretch uses an arms-up/yawn sequence and a stretch icon where an icon is needed.
- Dismiss and snooze icons are monochrome pixel symbols with clear accessible labels supplied by the UI.
- Reminder graphics cannot flash, pulse continuously, cover active application content beyond the companion's small window, or resemble an operating-system warning.

Shared assets live under `ui/reminder_cards`; feature-exclusive character frames live in the appropriate character atlas group.

## Asset Validation

The validation command fails the build for:

- Missing manifest targets, duplicate keys, or unreachable exported files.
- Non-contiguous frame suffixes.
- Mixed frame dimensions within a fixed-canvas group.
- Colors outside the approved palette or unexpected alpha values.
- Non-integer pivots or attachment points outside the declared source bounds.
- Atlas regions that overlap padding or exceed texture limits.
- Animations with no frames, invalid FPS, missing safe loop boundaries, or missing reduced-motion mappings where required.
- Filename case mismatches that would fail on case-sensitive filesystems.
- Pixel-difference changes without updated review output.

Visual validation renders every clip through the same Pixi configuration used in production. Browser image rendering alone is not sufficient because sampler and resolution behavior can differ.

## Developer Asset Checklist

- [ ] Asset belongs to a defined feature and loading group.
- [ ] Source file, exported frames, manifest entry, and preview use matching stable names.
- [ ] Canvas dimension, ground line, pivot, and attachment points are correct.
- [ ] Approved palette, outline, lighting direction, and alpha values are used.
- [ ] Silhouette reads at native size.
- [ ] Character mass and facial features remain consistent across frames.
- [ ] Asset is reviewed on light, dark, and busy backgrounds.
- [ ] Integer scales are crisp on standard and high-density displays.
- [ ] No guide, matte, antialiasing, blur, gradient, or stray pixel is present.
- [ ] Runtime manifest resolves the asset without a direct path in feature code.
- [ ] Failure and fallback behavior has been exercised.
- [ ] Ownership and source license are recorded.

## Animation Export Checklist

- [ ] Frame order is explicit in `animations.json`.
- [ ] Playback rate and phase holds match the feature specification.
- [ ] First frame can enter cleanly from the source state.
- [ ] Final or exit frame returns cleanly to `Idle` or the documented next state.
- [ ] Loop seam has no pose jump, foot slide, or pupil reset.
- [ ] Anticipation, contact, apex, landing, bubble, and particle markers are correctly placed.
- [ ] Pivot remains stable unless movement is intentional.
- [ ] Clip does not crop at maximum squash, stretch, or effect extent.
- [ ] Interruption on every allowed phase has a valid recovery pose.
- [ ] Reduced-motion alternative communicates the same state.
- [ ] Contact sheet and real-time preview have been reviewed at 1×, 2×, and 4×.
- [ ] Non-looping completion emits once and the last hold is intentional.

## Sprite Optimization Checklist

- [ ] Identical frame pixels are referenced rather than duplicated.
- [ ] Transparent trim retains source size and pivot metadata.
- [ ] Atlas padding and extrusion prevent texture bleed.
- [ ] Atlas dimensions stay within the target limit.
- [ ] Mipmaps, bilinear sampling, and lossy compression are disabled.
- [ ] Preview and source files are excluded from packaging.
- [ ] Feature group decode does not pull unrelated atlases into memory.
- [ ] Decoded memory and load time are recorded in developer mode.
- [ ] Optimized output matches source pixels and alpha exactly.
- [ ] Particle count and texture variants remain within their defined budget.

## Versioning

`assets.json` contains an integer `manifestVersion`, a content hash per file, atlas versions, and the application version range that can read it. Increment the manifest version when identifiers, metadata shape, pivots, attachment-point semantics, or atlas grouping changes. Replacing pixels without changing the contract updates content hashes but does not require a schema increment.

Runtime caches include the manifest version in their key. A packaged application must never combine manifests and atlases from different builds. Release tags identify the exact source-art revision used to produce shipped assets. If an asset regression requires rollback, revert source, generated output, manifests, and previews together.

## Asset Ownership

Every source-art directory contains ownership metadata in the repository's asset inventory: creator, reviewer, creation source, license or assignment status, and last approved revision. Only assets with confirmed distribution rights may enter `src/assets/generated/`.

The feature owner is responsible for semantic correctness and integration. The art owner is responsible for palette, pixel quality, animation continuity, and source preservation. The release owner verifies generated outputs and packaged inclusion. Tool-generated metadata is owned by the pipeline and must not be hand-edited.

Changes to character proportions, palette, canvas, outline, or ground line require cross-feature review because they affect all clips. Small effect additions may be approved within the owning feature when they reuse established rules.

## Future Asset Organization

Future skins, companions, seasonal sets, and optional behavior packs must use namespaces rather than new top-level conventions:

```text
src/assets/generated/
  companions/
    psyduck/
      default/
      <skin_id>/
  behavior_packs/
    <pack_id>/
  seasonal/
    <set_id>/
```

Each package will declare compatible canvas dimensions, palette, required core clip identifiers, optional features, manifest version, and fallback mappings. A new skin cannot omit Idle, Blink, Drag, Landing, or error fallback. Community or downloaded assets are outside the initial product and must not influence V1 loader security or introduce runtime network access.

Organization should evolve only when the shipped asset set requires it. Do not pre-create empty directories, speculative atlas groups, or unused manifest fields.
