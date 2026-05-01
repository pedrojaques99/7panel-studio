# UI Review — keyboard-ui

**Audited:** 2026-04-29
**Baseline:** Abstract 6-pillar standards (no UI-SPEC.md)
**Screenshots:** Captured (dev server at localhost:3000) — canvas is nearly empty on cold load because backend is offline; all panel content requires interaction to appear.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 2/4 | Mix of Portuguese and English throughout; generic fallback label "Vazio" on keyboard keys; some raw internal strings exposed |
| 2. Visuals | 3/4 | Strong skeuomorphic design system with clear depth cues; cold-load empty state gives no orientation for new users |
| 3. Color | 3/4 | Well-restrained palette with --status-ok green as accent; VintageButton introduces an inconsistent orange (#ff6b35) not in the token set |
| 4. Typography | 3/4 | Outfit as the main font is solid; 8+ distinct font-size values used across components; InteractiveKnob uses a second font (Red_Hat_Mono) not declared in index.css |
| 5. Spacing | 3/4 | Consistent use of CSS custom properties for spacing; several components have inline magic pixel values (e.g. `gap: 10`, `padding: 18px 12px 15px`) not routed through tokens |
| 6. Experience Design | 3/4 | Loading, playing, error, and empty states present in most panels; close-button hit target is 22px (below recommended 44px); no visible keyboard shortcut hints on first load |

**Overall: 17/24**

---

## Top 3 Priority Fixes

1. **Cold-load orientation gap** — A new user opening the app sees a near-black screen with only a sidebar of icon buttons and no labels or onboarding message. There is a `[Space] Pan / [Ctrl+Wheel] Zoom` hint rendered at opacity 0.10 which is unreadable. Fix: raise hint opacity to 0.35, add a brief centered welcome card that dissolves after first interaction, or show the keyboard panel open by default.

2. **Language inconsistency (Portuguese/English mix)** — Button labels, error messages, and panel copies mix languages without a clear rule. Examples: `TimerPanel.tsx:151` uses "Pausar"/"Iniciar", `OBSControlPanel.tsx:197` uses "Ao Vivo"/"Iniciar Live"/"Confirmar?", `ShieldAlert.tsx:106` uses "Tela protegida", while `CommandPalette.tsx` and `SoundboardPanel.tsx` use English throughout. Fix: pick one language for all UI strings. Given the developer-tool context, English is recommended; extract all strings to a single `strings.ts` constants file.

3. **Close-button hit target too small** — `closeBtnStyle` in `src/lib/styles.ts:3` defines `width: 22, height: 22` for every panel close button. This is well below the 44×44px minimum recommended touch/click target. The button is also low-contrast (`color: rgba(255,255,255,0.35)`). Fix: increase to `width: 32, height: 32`, bump color to `rgba(255,255,255,0.55)`, and add a visible hover state (currently hover is only handled in some components via `onMouseEnter` inline).

---

## Detailed Findings

### Pillar 1: Copywriting (2/4)

**Portuguese/English mixing (high impact)**
- `src/components/TimerPanel.tsx:151` — button labels "Pausar" / "Iniciar"
- `src/components/TimerPanel.tsx:161` — mode labels "Cronômetro" / "Contagem"
- `src/components/TimerPanel.tsx:169` — section label "Duração"
- `src/components/OBSControlPanel.tsx:157` — field label "Senha", "Cena BRB"
- `src/components/OBSControlPanel.tsx:172` — action button "Salvar & Reconectar"
- `src/components/OBSControlPanel.tsx:187-204` — "Já Volto", "Voltar", "Ao Vivo", "Iniciar Live"
- `src/components/ShieldAlert.tsx:106` — "Tela protegida", "Arquivo sensível detectado", "Liberar tela"
- All other panels (CommandPalette, SoundboardPanel, AudioMixer) use English.

**Generic / placeholder copy**
- `src/App.tsx:456` — `displayLabel` falls back to `'Vazio'` (Portuguese for "Empty") when no label is assigned to a key. This is the primary content shown on unassigned keys — the most visible state for new users.
- `src/components/SoundboardPanel.tsx:67-76` — default key labels are "Sound 1", "Sound 2", "Sound 3", "Sound 4" — acceptable generics but could be more contextual ("Drop audio or right-click to configure").

**Contextual empty states**
- `src/components/CommandPalette.tsx:125` — "No panels found" — fine.
- `src/components/CommandPalette.tsx:160` — "No assets found" / "No results" — fine.
- `src/components/AudioMixer.tsx:783` — Hidden sessions label "Hidden" — minimal but functional.
- `src/components/DronePanel.tsx:388` — "No loaded layers" feedback string is good.

**Save/action button labels**
- "Save" appears in `SoundboardPanel.tsx:157` — acceptable.
- `App.tsx:669` — save button shows "..." while saving (ctxSaving). This is a spinner-text antipattern; use a more descriptive label like "Saving…".

**Score rationale:** Language inconsistency affects every real use session and "Vazio" exposes an untranslated internal default on the most prominent UI element.

---

### Pillar 2: Visuals (3/4)

**Strengths**
- Skeuomorphic key tiles with `--shadow-key-off` / `--shadow-key-on` provide excellent depth and physical affordance.
- VU meters with segmented LEDs and vertical channel faders are visually coherent with the hardware aesthetic.
- The dot-grid canvas background (`canvas-grid` in `index.css:98`) is subtle and effective.
- Panel drag with brightness/drop-shadow on `.panel-drag.dragging` provides good spatial feedback.
- Status indicator (online dot in sidebar) uses glow animation for the connected state — clear and concise.

**Issues**
- Cold-load state: the canvas shows only a 72px sidebar and a tiny zoom control bottom-left. No focal point, no content. The background hint "Space Pan / Ctrl+Wheel Zoom / Click Select" is rendered at `opacity-10` (10%) — effectively invisible.
- `VintageButton.tsx` uses a completely different visual language (large round buttons, orange #ff6b35 accent, `Orbitron` font) compared to the rest of the system. These components appear to be unused in the main app flow (not imported in App.tsx or any panel) but their presence signals design drift if ever wired up.
- `InteractiveKnob.tsx` wraps a `Knob1` SVG component with a yellow text color (`text-[#f0e68c]`) that does not match the system palette.
- Icon-only sidebar buttons use `title` attributes for tooltips — acceptable for desktop, but there is no visible label anywhere in the sidebar to orient a new user.

---

### Pillar 3: Color (3/4)

**Token system is well structured**
`index.css` defines a coherent set of CSS custom properties:
- `--status-ok: #00b860` (green) — used as primary accent for play states, active elements, and status indicators.
- `--status-err: #ef4444` (red) — correctly limited to destructive/error contexts (stop-all button, mute active, shield alert).
- `--status-warn: #f59e0b` (amber) — used in OBS "Já Volto" BRB state, appropriately cautionary.
- `--text-pure / --text-90 / --text-70 / --text-40 / --text-20` — good opacity ladder for text hierarchy.

**Issues**
- `VintageButton.tsx:33` uses `#ff6b35` (orange) which is not in the token set.
- `InteractiveKnob.tsx:73` uses `text-[#f0e68c]` (pale yellow) — hardcoded Tailwind arbitrary value, not a token.
- `SoundboardPanel.tsx:60` defines `COLORS` as a local array of hardcoded hex values: `['#00b860','#3b82f6','#f59e0b','#ec4899','#8b5cf6','#06b6d4','#f97316','#84cc16']`. These are intentional per-key accent colors (user-facing color picker) so the pattern is justified, but `#3b82f6` (blue) is also used in `DronePanel.tsx:24` as LAYER_COLORS — these two arrays are independent duplicates of the same semantic set.
- `App.css` still contains the default Vite scaffold CSS (`--accent`, `--border`, `.counter`, `.hero` classes, etc.) — dead code that should be removed. It declares `--accent-bg` and `--accent-border` tokens that are never used by the actual app.

---

### Pillar 4: Typography (3/4)

**Font family**
- `index.css:53` — `font-family: 'Outfit', sans-serif` as the global font. Correct, coherent.
- `App.tsx:294` — `font-['Outfit',sans-serif]` as Tailwind class on root div — redundant given the global CSS declaration.
- `InteractiveKnob.tsx:73` — `font-['Red_Hat_Mono',monospace]` introduced for the knob value display. This is a second display font not loaded in `index.css`, creating a fallback-to-monospace or a layout-shift until loaded.
- Several `fontFamily: 'monospace'` inline styles for numeric displays (deck time codes, volume %, etc.) — acceptable for numeric readability.

**Font sizes in use (partial inventory)**
From code scan: `fontSize` values observed across files: 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 36, 48. That is 12 distinct sizes. This is excessive but many are in highly specialized micro-elements (step grid buttons at 7px, LED labels at 8px). The core content hierarchy uses 10-13px which is readable. The 7-8px labels (DronePanel step grid, ParamSlider labels) are below comfortable reading thresholds.

**Font weights in use**
`400`, `500`, `600`, `700`, `800`, `900` — six weights. For a tool UI this is acceptable given the information density, but 800 and 900 weights are used liberally throughout panel headers and micro-labels, reducing their differentiating power.

**Issues**
- Labels at 7-8px (`DronePanel.tsx:83` param label, `DronePanel.tsx:215` step number) may be illegible at system text scaling above 100%.
- The PanelHeader title (`PanelHeader.tsx:30`) uses `fontSize: 11`, `fontWeight: 900`, `letterSpacing: '0.2em'`, `textTransform: 'uppercase'`. All-caps + 0.2em tracking at 11px produces very low readability and low information density per header.

---

### Pillar 5: Spacing (3/4)

**Token usage**
`index.css` defines `--gap-standard: 12px`, `--radius-panel: 28px`, `--radius-input: 16px`, `--radius-key: 14px`, `--radius-sm: 8px`, `--radius-xs: 6px`, `--key-size: clamp(88px, 8vw, 120px)`. Token adoption is generally good across panel containers.

**Inconsistencies**
- `AudioMixer.tsx:77` VuMeter: `gap: 2.25` — arbitrary fractional value not from token.
- `AudioMixer.tsx:262` VerticalSlider: `height: 162`, `width: 18`, `borderRadius: 9` — all magic values.
- `SoundboardPanel.tsx:61-62` — `KEY_SIZE = 96`, `GAP = 10`, `PAD = 18` — local constants that duplicate what `--key-size` and `--gap-standard` provide.
- `TimerPanel.tsx:38-45` — `inputStyle` and `labelStyle` are local constants instead of using `inputStyle` from `lib/styles.ts`.
- `DronePanel.tsx:719-724` — `smBtn` defines `width: 26, height: 22` — the 26×22 hit target is below usable thresholds for small interactive controls.
- `App.tsx:307` sidebar: `padding: 'var(--...)'` uses tokens correctly, but Tailwind classes `py-4 gap-2` are mixed with inline token styles on the same element.

**Positive notes**
- The panel container layout (chassis, header, content) is consistent across all 12 panels.
- The `closeBtnStyle` shared style in `lib/styles.ts` is reused correctly.
- Grid spacing for the 3×4 key grid uses `gap: 'var(--gap-standard)'` correctly.

---

### Pillar 6: Experience Design (3/4)

**State coverage**
- Audio playing: ✓ — `playing` state on KeyTile, deck progress bars, VU meters all active.
- Loading: ✓ — `loadingIds` set in SoundboardPanel with spinner LED; `resolving` state in Deck component.
- Error / offline: ✓ — online status dot in sidebar; `available === false` dot in AudioMixer header; OBSControlPanel status color system; exponential backoff in AudioMixer fetch loop.
- Empty: ✓ — "No panels found", "No assets found", "No loaded layers" messages present.
- Disabled: ✓ — OBS buttons use `disabled` prop correctly with `opacity: 0.4`; DronePanel export button disabled when exporting.
- Destructive confirmation: ✓ — OBSControlPanel `stopConfirm` two-click pattern for stopping live stream; SoundboardPanel MixesMenu "Replace current mix?" confirm row.

**Issues**

- **Cold-load empty canvas** — No panel is open by default if the user's localStorage is clean. The screen presents no actionable content and the navigation hints are at 10% opacity. This creates a blank slate with no onboarding path.

- **Sidebar has no labels** — `NavBtn` renders emoji icons with `title` tooltips only. New users have no way to know what each icon does without hovering. A hover-expand label or a first-run tooltip would significantly reduce the discovery gap. The `CommandPalette` (Ctrl+K) is the intended discovery mechanism but it requires knowing the shortcut exists.

- **Close button hit target** — `closeBtnStyle` in `lib/styles.ts:3` is 22×22px. While fine for mouse, this is a consistent usability issue across all 12 panels.

- **`App.css` dead code** — The Vite scaffold CSS file (`App.css`) is still present and contains `.hero`, `.counter`, `#center`, `#next-steps` styles with no corresponding DOM nodes. These reference undefined CSS custom properties (`--accent`, `--accent-bg`, `--border`) which will produce no visual effect but add noise.

- **Keyboard shortcut discoverability** — Ctrl+K for CommandPalette is the primary navigation mechanism but only mentioned via `title` on a `⌘` button. No visible hint on first load.

- **`VintageButton`, `InteractiveKnob`, `InteractiveToggle`, `InteractiveSliders`, `VintageMeter`, `SimpleToggle`** — These `vintage-components` files exist but none are imported in the main application panels. They appear to be either prototype components or abandoned implementations. Their presence adds dead-code weight and the design language (Orbitron font, orange accent, Tailwind class-heavy approach) is inconsistent with the production design system.

---

## Registry Safety

No `components.json` found — shadcn not initialized. Registry audit skipped.

---

## Files Audited

- `src/App.tsx`
- `src/index.css`
- `src/App.css`
- `src/lib/panel-context.tsx`
- `src/lib/KeyTile.tsx`
- `src/lib/PanelHeader.tsx`
- `src/lib/styles.ts`
- `src/lib/types.ts`
- `src/components/AppKnob.tsx` (referenced, not directly read)
- `src/components/AudioMixer.tsx`
- `src/components/BriefingPanel.tsx`
- `src/components/ConfigPanel.tsx` (referenced, not directly read)
- `src/components/ConverterPanel.tsx` (referenced, not directly read)
- `src/components/DronePanel.tsx`
- `src/components/OBSControlPanel.tsx`
- `src/components/SoundboardPanel.tsx`
- `src/components/SynthPanel.tsx` (referenced, not directly read)
- `src/components/TimerPanel.tsx`
- `src/components/YouTubeChatPanel.tsx` (referenced, not directly read)
- `src/components/PaulstretchPanel.tsx` (referenced, not directly read)
- `src/components/ExporterPanel.tsx` (referenced, not directly read)
- `src/components/CommandPalette.tsx`
- `src/components/PresetBar.tsx` (referenced, not directly read)
- `src/components/ShieldAlert.tsx`
- `src/overlay/Overlay.tsx` (referenced, not directly read)
- `src/overlay/OverlayPinned.tsx` (referenced, not directly read)
- `src/overlay/OverlayTimer.tsx` (referenced, not directly read)
- `src/overlay/OverlayChat.tsx` (referenced, not directly read)
- `src/overlay/OverlayBriefing.tsx` (referenced, not directly read)
- `src/lib/vintage-components/VintageButton.tsx`
- `src/lib/vintage-components/VintageMeter.tsx` (referenced, not directly read)
- `src/lib/vintage-components/VintageSlider.tsx` (referenced, not directly read)
- `src/lib/vintage-components/InteractiveKnob.tsx`
- `src/lib/vintage-components/InteractiveToggle.tsx` (referenced, not directly read)
- `src/lib/vintage-components/InteractiveSliders.tsx` (referenced, not directly read)
- `src/lib/vintage-components/SimpleToggle.tsx` (referenced, not directly read)
