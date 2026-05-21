# 7panel Studio -- UI Review

**Audited:** 2026-05-20
**Baseline:** Abstract 6-pillar standards (no UI-SPEC exists)
**Screenshots:** Not captured (Playwright browsers not installed)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 2/4 | Mixed PT/EN labels, generic "OK"/"Cancel" buttons, inconsistent voice |
| 2. Visuals | 3/4 | Strong skeuomorphic identity; zero aria-labels across entire codebase |
| 3. Color | 2/4 | 300+ hardcoded rgba/hex values bypass the CSS variable design system |
| 4. Typography | 2/4 | 16-step CSS var scale exists but ~30+ instances use raw pixel values (7-48px) |
| 5. Spacing | 3/4 | Consistent --gap-standard and --radius-* tokens; occasional arbitrary px in inline styles |
| 6. Experience Design | 3/4 | Loading/status machines in most panels; no ErrorBoundary; empty states partially covered |

**Overall: 15/24**

---

## Top 3 Priority Fixes

1. **Zero aria-labels on any interactive element** -- Screen readers cannot identify any button, knob, or control. Add `aria-label` to all icon-only buttons, knobs (AppKnob), and emoji-only controls. Start with the ~50 icon-only buttons across sidebar, panel headers, and transport controls.

2. **300+ hardcoded color values bypass the design system** -- Nearly every component uses raw `rgba(255,255,255,0.X)` and hex codes instead of CSS variables. Extract the 5-6 most repeated opacity levels into `--text-60`, `--text-40`, `--text-25`, `--border-subtle`, `--bg-hover` custom properties and replace inline values. This makes theme changes possible and reduces code volume.

3. **Mixed Portuguese/English copy with generic labels** -- "Abrir no Explorer", "Cole uma URL", "Vazio", "sem audio" appear alongside English labels. "OK" buttons (RetroTVPanel, YouTubeChatPanel) and "Cancel" (App.tsx) are generic. Standardize all user-facing copy to one language and replace generic labels with action-specific text (e.g., "OK" -> "Load Video", "Cancel" -> "Discard Changes").

---

## Detailed Findings

### Pillar 1: Copywriting (2/4)

- **Mixed language**: Portuguese strings ("Abrir no Explorer", "Cole uma URL do YouTube", "Vazio", "sem audio") mixed with English throughout
- **Generic CTAs**: `OK` in RetroTVPanel.tsx:1590 and YouTubeChatPanel.tsx:171; `Cancel` in App.tsx:937
- **Good**: Empty states exist in CommandPalette ("No panels found", "No assets found", "No results"), status feedback in ConfigPanel ("Saving...", "Saved"), converter progress phases
- **Missing**: No onboarding or first-use guidance for the complex panel system

### Pillar 2: Visuals (3/4)

- **Strong identity**: Consistent industrial skeuomorphic aesthetic with depth (gradients, shadows, rounded panels at 28px radius)
- **Good hierarchy**: PanelHeader component provides consistent panel framing; AppKnob provides tactile visual feedback; VuMeter segments create clear audio visualization
- **Zero accessibility**: 0 `aria-label` attributes across the entire codebase. 122 `title` attributes provide some tooltip coverage but are not equivalent for screen readers
- **Icon-only buttons**: Sidebar NavBtn uses emoji-only labels with no accessible text alternative

### Pillar 3: Color (2/4)

- **Design system exists**: CSS vars for `--bg-chassis`, `--status-ok`, `--status-err`, `--text-pure`, `--text-40` etc. are defined in index.css
- **Massively bypassed**: 300+ instances of hardcoded `rgba()` and hex values across all .tsx files. AudioMixer alone has 46 hardcoded color instances; DronePanel has 38
- **Repeated patterns**: `rgba(255,255,255,0.06)` (borders), `rgba(255,255,255,0.25)` (muted text), `rgba(255,255,255,0.05)` (hover bg) appear dozens of times each -- these should be tokens
- **Accent usage**: Green (`#00b860`, `var(--status-ok)`) used appropriately for active/success states; Red (`#ef4444`, `#ff5555`) for errors/recording -- good semantic mapping

### Pillar 4: Typography (2/4)

- **Good system**: 16-level CSS var scale from `--fs-3xs` (6px) to `--fs-9xl` (48px), font family consistently Outfit
- **Bypassed in skeuomorphic panels**: RetroTVPanel uses ~20 raw pixel font sizes (7px, 9px, 10px, 11px, 12px, 13px, 14px, 24px, 32px, 48px). SessionPanel uses 11px, 18px, 22px, 26px. AudioPlayerPanel uses 14px repeatedly
- **Font weights**: Consistent use of 400/500/600/700/800 weights -- acceptable range for this dense UI
- **Recommendation**: Map the raw px values to nearest --fs-* var. RetroTVPanel's 7px labels could use --fs-3xs (6px) or a new --fs-retro-label token

### Pillar 5: Spacing (3/4)

- **Tokens in use**: `--gap-standard: 12px`, `--radius-panel: 28px`, `--radius-input: 16px`, `--radius-sm: 8px` consistently applied
- **Inline px is acceptable**: For a drag-based canvas app with complex layouts, inline padding/gap values (8, 10, 12, 14, 16, 20px) follow a reasonable 2-4px step pattern
- **No arbitrary Tailwind**: Project uses inline styles exclusively (no Tailwind classes), so spacing is controlled through the style objects
- **Minor inconsistency**: Some panels use `gap: 14` while others use `gap: 12` (--gap-standard) for similar content layouts

### Pillar 6: Experience Design (3/4)

- **Loading states**: Present in 15 files (103 occurrences). Status machines (idle/saving/ok/err, idle/converting/ok/err) in ConfigPanel, ConverterPanel, PaulstretchPanel, YTDownloadPanel
- **Error handling**: .catch() handlers in 10 files (20 occurrences). Error display with red text in ConfigPanel, ConverterPanel. No ErrorBoundary wrapping the app or individual panels
- **Empty states**: Partially covered (18 occurrences in 9 files). CommandPalette handles all empty cases well. DrumMachinePanel drop zone is a good pattern. Some panels (AudioMixer, VisualizerPanel) lack explicit empty states
- **Destructive actions**: No confirmation dialogs for delete operations (e.g., removing drone layers, clearing sessions)
- **Keyboard support**: Ctrl+K palette, ESC to close modals, Enter to submit -- good foundation but not comprehensive

---

## Files Audited

- `src/index.css` (design system)
- `src/App.tsx` (main orchestrator)
- `src/components/AudioMixer.tsx`
- `src/components/SynthPanel.tsx`
- `src/components/DronePanel.tsx`
- `src/components/PaulstretchPanel.tsx`
- `src/components/DrumMachinePanel.tsx`
- `src/components/SessionPanel.tsx`
- `src/components/ConverterPanel.tsx`
- `src/components/SoundboardPanel.tsx`
- `src/components/VisualizerPanel.tsx`
- `src/components/RetroTVPanel.tsx`
- `src/components/CommandPalette.tsx`
- `src/components/ConfigPanel.tsx`
- `src/components/YTDownloadPanel.tsx`
- `src/components/AppKnob.tsx`
- `src/components/AudioPlayerPanel.tsx`
- All overlay/ and lib/ component files (via grep)
