---
name: EIRI Talleres Battlebots 2026
description: Combat-robotics workshop portal — an arena control terminal in dark navy, charged with cyan and championship gold.
colors:
  bg-0: "#04080f"
  bg-1: "#080e1a"
  bg-2: "#0d1625"
  bg-card: "#0a1428"
  blue-900: "#0a2547"
  blue-700: "#1565c0"
  blue-500: "#1976d2"
  blue-400: "#2196f3"
  blue-300: "#42a5f5"
  blue-200: "#90caf9"
  cyan: "#00e5ff"
  gold-700: "#8a6a1f"
  gold-500: "#c9a227"
  gold-400: "#e3bd3f"
  gold-300: "#f4d774"
  white: "#ffffff"
  text: "#dce8f8"
  text-dim: "#6a84a0"
  navy: "#012232"
  navy-2: "#023349"
  border: "#21314f"
typography:
  wordmark:
    fontFamily: "Orbitron, monospace"
    fontSize: "clamp(2.4rem, 5vw, 4.4rem)"
    fontWeight: 900
    lineHeight: 1.05
    letterSpacing: "0.02em"
  display:
    fontFamily: "Chakra Petch, sans-serif"
    fontSize: "clamp(1.8rem, 4.5vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0.01em"
  body:
    fontFamily: "Sora, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Orbitron, monospace"
    fontSize: "0.66rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.32em"
  data:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "0.8rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  xs: "4px"
  sm: "8px"
  md: "10px"
  lg: "14px"
  xl: "18px"
  pill: "100px"
spacing:
  xs: "0.5rem"
  sm: "0.85rem"
  md: "1.2rem"
  lg: "2rem"
  xl: "6rem"
components:
  button-primary:
    backgroundColor: "{colors.blue-700}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    padding: "0.78rem 1.8rem"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.blue-400}"
    textColor: "{colors.white}"
  button-ghost:
    backgroundColor: "#00000000"
    textColor: "{colors.blue-300}"
    rounded: "{rounded.sm}"
    padding: "0.78rem 1.8rem"
    typography: "{typography.label}"
  input:
    backgroundColor: "{colors.bg-1}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0.6rem 0.85rem"
  card:
    backgroundColor: "{colors.bg-card}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "1.2rem"
---

# Design System: EIRI Talleres Battlebots 2026

## 1. Overview

**Creative North Star: "The Arena Terminal"**

This is the control terminal of a combat-robotics championship. The screen is a dark cockpit — deep navy approaching black — where information glows rather than sits, and championship gold is reserved for the things that are actually being contested. Every surface should feel like an engineering instrument that happens to be wired into a tournament: precise, legible, and quietly charged with current. The two halves of the brand live here at once — the rigor of a university engineering program (clean data, monospace numbers, disciplined hierarchy) and the adrenaline of an arena (glitch on the wordmark, LED color, glow that intensifies when you touch it). Rigor is what keeps the energy from becoming noise; energy is what keeps the rigor from going dull.

The palette is committed and dark by intent, not by fashion: a student pulls this up on a phone in a loud, bright workshop room, and the dark cockpit plus high-contrast text is what stays readable. Color is functional — blue is the system's working voice, cyan is the live/electric signal, and gold is the championship layer (brackets, ranking, the trophy moments). Depth is never a realistic drop shadow; it's a colored halo that brightens on interaction, as if the element drew more power.

This system explicitly rejects the **generic corporate / SaaS** look: no bland blue-gradient startup template, no stock photography, no interchangeable icon-heading-text card grid, no "trusted by" marketing scaffolding. If a screen could belong to any other product, it has failed the brand. The identity must read, unmistakably, as Battlebots robotics.

**Key Characteristics:**
- Dark arena cockpit (`#04080f` → `#0d1625`), never a tinted near-white
- Blue = working voice, cyan = live signal, gold = championship layer
- Glow-as-elevation: flat at rest, halo on interaction
- Four-font tournament system: Orbitron wordmark, Chakra Petch display, JetBrains Mono data, Sora body
- Precise and charged: instrument-grade components that come alive under interaction

## 2. Colors

A committed dark palette: a deep navy field carrying one working hue (electric blue), one live-signal accent (cyan), and a rare championship metal (gold).

### Primary
- **Working Blue** (`#1565c0` / `#2196f3` / `#42a5f5`): The system's voice. Primary buttons (`blue-700` `#1565c0`), interactive accents, links, the navy navbar's active states, and the labels/kickers (`blue-400`). This is what the interface uses to speak by default.
- **Live Cyan** (`#00e5ff`): The electric/live signal. The hero kicker, inline `code` accents, the glitch channel, and moments that should read as "powered on." Used sparingly so it keeps its charge.

### Secondary
- **Championship Gold** (`#e3bd3f` base, ramp `#8a6a1f` → `#c9a227` → `#e3bd3f` → `#f4d774`): The contest layer. Brackets, ranking, the bracket title and glow, trophy/winner states. Gold means "this is being competed for." Never use gold as a generic accent or for ordinary buttons.

### Neutral
- **Cockpit Field** (`#04080f` `bg-0`, `#080e1a` `bg-1`, `#0d1625` `bg-2`): The dark surface stack, darkest to lightest, used for page, raised, and card-context backgrounds.
- **Card Surface** (`#0a1428`, authored as `rgba(10,20,40,0.85)`): Translucent card fill over the field.
- **Navy Bar** (`#012232` / `#023349`): The fixed navigation bar and its hover layer — a distinct cooler navy from the content field.
- **Primary Text** (`#dce8f8`): Body and heading text on dark. High-contrast, never pure white except for display/headings (`#ffffff`).
- **Dim Text** (`#6a84a0`): Secondary/meta text and descriptions. **Caution:** this is the system's weakest contrast pair on the darkest fields; promote toward `#dce8f8` for anything that must be read carefully (long descriptions, form help, placeholders), per the best-effort a11y stance.
- **Border** (`#21314f`, authored as `rgba(33,150,243,0.15)`; medium `rgba(33,150,243,0.30)`): Hairline dividers and card edges — a tinted blue border, never neutral gray.

### Named Rules
**The Gold-Is-Earned Rule.** Gold is the championship metal, not decoration. It appears only where something is being contested or won — brackets, ranking, winner states, the bracket title. A gold button or a gold section header for ordinary content is forbidden; it cheapens the trophy.

**The Tinted-Border Rule.** Borders carry the brand hue (`rgba(33,150,243,*)`), never neutral gray. On a navy field a gray line looks dead; a faint blue line looks wired.

## 3. Typography

**Wordmark / Tech Font:** Orbitron (monospace fallback) — also the label/kicker font
**Display Font:** Chakra Petch (sans-serif) — titles and buttons
**Data Font:** JetBrains Mono (monospace) — numbers, scores, codes, labels
**Body Font:** Sora (sans-serif)

**Character:** A four-voice tournament system built on a contrast axis, not lookalikes. Orbitron is the loud machine wordmark (EIRI / Battlebots branding only — square, technical, unmistakable). Chakra Petch is the squared-off display workhorse for titles and buttons. JetBrains Mono carries every number and code block so data reads as instrumentation. Sora is the calm humanist body that keeps long text comfortable. The pairing works because each font has a clear job; nothing competes.

### Hierarchy
- **Wordmark** (Orbitron, 900, `clamp(2.4rem, 5vw, 4.4rem)`, ls 0.02em): EIRI/Battlebots brand lockup and the glitch hero title. Brand use only.
- **Display / Section Title** (Chakra Petch, 700, `clamp(1.8rem, 4.5vw, 3rem)`, lh 1.1, ls 0.01em): Section headings. The `.label`/kicker above it uses Orbitron at `0.66rem` / ls 0.32em / uppercase / `blue-400`.
- **Body** (Sora, 400, `0.95rem`, lh 1.6–1.8): Paragraphs and descriptions. Keep prose within ~65–75ch; `--text-dim` body copy gets promoted toward `#dce8f8` when it must be read carefully.
- **Data / Label** (JetBrains Mono, 500, `0.8rem`): Scores, ranking numbers, asset language tags, code. Anything numeric or machine-emitted.

### Named Rules
**The Orbitron-Is-Branding Rule.** Orbitron is for the EIRI/Battlebots wordmark and section kickers only. It is forbidden as a body or paragraph font — at small sizes its tracked, squared letters become an instrument label, not readable text.

**The Numbers-Are-Mono Rule.** Every score, rank, count, and code snippet is JetBrains Mono. Numeric data set in the body font reads as prose; set in mono it reads as telemetry.

**The Tight-Tracking-Floor Rule.** Display tracking never goes below -0.02em (this system runs slightly positive at +0.01–0.02em for a squared, technical feel). Cramped negative tracking is off-brand here.

## 4. Elevation

This system uses **glow-as-elevation**, not realistic shadows. Surfaces are flat at rest on the dark field; depth and focus are conveyed by a colored halo (blue for working elements, gold for championship elements, cyan for live signals) that brightens and spreads on hover or focus, as if the element drew more power. Neutral black shadows appear only where a surface must read as floating above everything else — modals and the lightbox — to separate them from the glow language of the content layer.

### Shadow Vocabulary
- **Primary glow** (`box-shadow: 0 4px 20px rgba(21,101,192,0.4)` → hover `0 6px 28px rgba(33,150,243,0.55)`): Primary buttons. The hover state is the "power up."
- **Card glow** (`box-shadow: 0 8px 28px rgba(33,150,243,0.1)`): Stat cards and interactive cards on hover; very low alpha, ambient.
- **Gallery lift** (`box-shadow: 0 12px 40px rgba(33,150,243,0.2)` with `translateY(-4px)`): Gallery items on hover.
- **Gold glow** (`radial-gradient(circle, rgba(227,189,63,0.35), transparent)` / `text-shadow: 0 0 18px`): Bracket section ambiance and gold labels. Championship-only.
- **Modal float** (`box-shadow: 0 24px 80px rgba(0,0,0,0.7)` / `0 20px 60px rgba(0,0,0,0.5)`): Lightbox and dialogs — the only neutral-black shadows in the system.
- **Nav depth** (`box-shadow: 0 2px 16px rgba(1,34,50,0.25)` → scrolled `0 6px 28px rgba(0,0,0,0.45)`): Fixed header; deepens on scroll.

### Named Rules
**The Flat-At-Rest Rule.** Content surfaces carry no shadow at rest. Glow is a *response* to state (hover, focus, active), never a default decoration. A card that glows while idle looks like a 2014 app — the halo is too strong and always-on; pull it to the interaction.

**The Color-Codes-Depth Rule.** The halo's hue states its role: blue glow = interactive/working, gold glow = championship, neutral-black shadow = floating overlay. Never put a blue glow on a modal or a black drop shadow on a button.

## 5. Components

Components are **precise and charged**: sharp-cornered, tightly typed instrument surfaces with restrained glow that intensifies on interaction. Tactile when touched, disciplined at rest.

### Buttons
- **Shape:** Gently squared (`8px` / `{rounded.sm}`); never pill-rounded for actions (pills are reserved for tags/chips).
- **Type:** Orbitron-adjacent label voice — `0.72rem`, weight 700, uppercase, ls 0.1em.
- **Primary:** `blue-700` (`#1565c0`) fill, white text, primary glow. Hover lifts (`translateY(-2px)`) to `blue-400` with a brighter, wider glow.
- **Ghost / Outline:** Transparent with a `rgba(33,150,243,0.35)` border and `blue-300` text. Hover tints background `rgba(33,150,243,0.08)`, brightens border and text, lifts 1px.

### Chips / Tags
- **Style:** Pill (`100px`), small. Asset language tags use `bg-input` fill, `text-dim` text, `4px` radius for the compact variant; status/category pills use full pill radius with tinted-blue fills.

### Cards / Containers
- **Corner Style:** `14px` (`{rounded.lg}`) for primary cards; `10px`–`12px` for media/asset containers.
- **Background:** Translucent card surface `rgba(10,20,40,0.85)` over the field; some overlays add `backdrop-filter: blur(6px)` (used purposefully, not as decoration).
- **Shadow Strategy:** Flat at rest; ambient blue card-glow on hover only (see Elevation).
- **Border:** Hairline tinted-blue (`rgba(33,150,243,0.15)`), strengthening to `0.30` on hover/focus.
- **Internal Padding:** `1.2rem` (`{spacing.md}`) typical.

### Inputs / Fields
- **Style:** `bg-input` (dark `#080e1a`-family) fill, `1px` medium tinted-blue border (`rgba(33,150,243,0.30)`), `8px` radius, `0.6rem 0.85rem` padding, `text` color.
- **Focus:** Border brightens to the lit blue (no neutral focus ring); code/score inputs shift border to gold (`#e3bd3f`) in championship contexts.
- **Labels:** `0.78rem`, `text-dim`, weight 500, sitting above the field.
- **Code textareas:** Monospace, `0.8rem`, min-height ~220px.

### Navigation
- **Style:** Two-tier fixed header — a white logo strip (university lockups) that collapses on scroll, over a `navy` (`#012232`) nav bar. Nav links use the display voice; active/hover states use working blue. Burger menu on mobile (`22px`, white bars). Depth deepens on scroll.

### Signature: The Glitch Wordmark
The hero title renders the event name in Orbitron with cyan (`#00e5ff`) and magenta (`#e040fb`) channel-split layers (`.glitch::before` / `::after`, clip-path bands, ~4.5s loop). This is the brand's single loudest flourish — reserved for the hero title only. It must degrade to a clean static wordmark under `prefers-reduced-motion`.

## 6. Do's and Don'ts

### Do:
- **Do** keep the field dark (`#04080f`–`#0d1625`) and let information glow against it.
- **Do** reserve gold strictly for championship contexts — brackets, ranking, winner/trophy states (the Gold-Is-Earned Rule).
- **Do** set every number, score, and code block in JetBrains Mono (the Numbers-Are-Mono Rule).
- **Do** use Orbitron for the wordmark and section kickers only; Chakra Petch for titles/buttons; Sora for body.
- **Do** convey depth with colored glow that responds to interaction, flat at rest (the Flat-At-Rest + Color-Codes-Depth Rules).
- **Do** tint borders with the brand blue (`rgba(33,150,243,*)`), never neutral gray.
- **Do** promote `--text-dim` (`#6a84a0`) toward `#dce8f8` for any copy that must be read carefully; it's the weakest contrast pair.
- **Do** provide a `prefers-reduced-motion` fallback for the glitch, LED carousel, and scroll effects (best-effort a11y).

### Don't:
- **Don't** make this look like a **generic corporate / SaaS** product: no bland blue-gradient startup hero, no stock photography, no interchangeable icon-heading-text card grid, no "trusted by" scaffolding. If a screen could belong to any other product, rework it.
- **Don't** introduce a cream/sand/tinted near-white background. The brand is a dark cockpit; warmth is forbidden as a body field.
- **Don't** use gold as a generic accent or on ordinary buttons — it must mean "championship."
- **Don't** set body or paragraph text in Orbitron; at small sizes it stops being readable.
- **Don't** leave glow always-on at rest, and don't put a blue glow on modals or a neutral-black drop shadow on a button (wrong depth language).
- **Don't** pill-round action buttons (pills are for tags/chips); don't over-round cards past ~16–18px.
- **Don't** use neutral-gray borders or dividers on the navy field.
