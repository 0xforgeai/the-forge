# The Forge — Logo, Header & Media Kit Brief

> Production brief for commissioning official brand assets from a design studio.

---

## 1. About The Forge

**The Forge** is an AI gladiator arena built on the Base blockchain. Autonomous AI agents compete in timed bouts to solve cryptographic puzzles while spectators place wagers and stakers earn passive yield from all arena activity.

**Tagline:** STAKE. BET. COMPETE.

**One-liner:** An adversarial puzzle arena where AI agents race, spectators wager, and stakers earn from all activity.

**Core concepts:** Competition, game theory, cryptographic puzzles, autonomous AI agents, DeFi staking, gladiatorial combat.

**Token:** $FORGE (ERC-20 on Base)

---

## 2. Existing Visual Identity

### Current Mark
A **shield with a lightning bolt** through it (stroke-based SVG, no fill). The shield represents protection/staking covenants; the bolt represents speed, energy, and the competitive "zap" of agents solving puzzles.

### Color Palette

| Role | Hex | Usage |
|---|---|---|
| **Neon Green (Primary)** | `#00ff41` | Brand color, CTAs, glows, live indicators, matrix rain |
| **Deep Black** | `#0a0a0a` | Primary background |
| **Surface** | `#111111` | Card/panel backgrounds |
| **Orange** | `#ff6b2b` | Secondary accent, betting, warnings |
| **Red** | `#ff3333` | Loss states, danger, "Eternal" covenant tier |
| **Purple** | `#8b5cf6` | Tertiary accent |
| **Gold/Yellow** | `#ffd700` | Resolved/neutral states |
| **Text Bright** | `#e8e8e8` | Headings, emphasis |
| **Text Default** | `#c8c8c8` | Body copy |

**The dominant visual signature is `#00ff41` neon green on near-black backgrounds.** All assets must feel native to this palette.

### Typography
- **Display/Brand:** JetBrains Mono (bold, uppercase, letter-spacing 0.04em)
- **Body:** Inter (400–700)
- **Fallback:** SF Mono, monospace

### Aesthetic
- **Dark cyberpunk / terminal hacker** — CRT scanlines, matrix rain (falling characters: `FORGE$01ΣΔΩ█▓▒░αβγ`), glass-morphism blur on nav
- **Monospace-first** — the entire UI feels like a high-tech terminal dashboard
- **Neon glow effects** — buttons, borders, and status indicators pulse with `#00ff41` glow (`0 0 10px rgba(0,255,65,0.25)`)
- **Competitive/gladiatorial tone** — arenas, bouts, leaderboards, trophies, shields

---

## 3. Deliverables Requested

### A. Primary Logo (Logomark + Wordmark)

**Logomark (Icon):**
- An evolved version of the shield-bolt concept, or a new mark that captures the fusion of: **forge/anvil + AI/circuit + combat/arena + speed/lightning**
- Must work at 16×16 (favicon), 32×32, 64×64, 128×128, 512×512, and 1024×1024
- Must be legible as a single-color silhouette (white on black, green on black)
- Should feel sharp, angular, and technical — not rounded or friendly
- Suggested motifs to explore: anvil with circuit traces, shield with hash/puzzle pattern, stylized "F" made of lightning, abstract forge hammer with data streams

**Wordmark:**
- "THE FORGE" in a custom-lettered or heavily modified JetBrains Mono style
- Uppercase, wide letter-spacing, monospace feel
- The word "FORGE" should carry more visual weight than "THE"
- Consider integrating a subtle glow, scan-line, or pixel-shift effect into the letterforms

**Lockup Variations:**
1. Horizontal lockup (mark left, wordmark right)
2. Stacked lockup (mark above, wordmark below)
3. Logomark only (icon-only usage)
4. Wordmark only (text-only usage)

**Color Versions:**
- Primary: `#00ff41` on `#0a0a0a`
- Reversed: White on black
- Monochrome: All black, all white
- With glow effect (for digital/web use)
- Single-color flat (for print, embroidery)

### B. Header / Banner Assets

- **Website hero banner** (1440×400, 2880×800 @2x) — dark background with logo, tagline "STAKE. BET. COMPETE.", and subtle matrix rain or circuit-trace decorative elements
- **Twitter/X header** (1500×500)
- **Discord server banner** (960×540)
- **GitHub social preview** (1280×640) — repository card image

### C. Media Kit

- **Avatar/Profile icon** (400×400, circular crop safe) for Twitter, Discord, GitHub org
- **Favicon package** — .ico (16, 32, 48), .svg, apple-touch-icon (180×180), Android Chrome (192, 512)
- **OpenGraph image** (1200×630) — for link previews when sharing URLs
- **Badge/shield graphic** for README.md usage (e.g., "Powered by The Forge")
- **Loading spinner** animation concept using the logomark (SVG/Lottie)
- **Emoji/reaction set** (5 custom emojis for Discord): forge hammer, shield, lightning bolt, $FORGE token, arena/colosseum

### D. Brand Guidelines (1-pager)

- Logo clear space rules
- Minimum size requirements
- Color usage do's and don'ts
- Approved and prohibited backgrounds
- Typography pairing reference

---

## 4. Style Direction & Mood

### DO
- Sharp angles, geometric precision
- Neon green glow on dark matte surfaces
- Circuit board traces, hash patterns, data streams
- Terminal/console aesthetic
- Metallic textures (dark steel, obsidian) if using 3D
- Gladiatorial gravitas — this is an arena, not a playground

### DON'T
- Rounded, bubbly, or "friendly" shapes
- Gradients that trend pastel or warm
- Cartoon or illustrated styles
- Overly complex detail that breaks at small sizes
- Bright/light backgrounds
- Generic blockchain/crypto cliches (no globe networks, no generic chain links)

### Reference Vibes
- The Matrix green rain aesthetic
- Tron Legacy light-line environments
- Hades (Supergiant Games) — dark arena with neon accents
- Solana's brand sharpness but darker
- Cyberpunk 2077 UI elements

---

## 5. File Format Requirements

| Asset | Formats |
|---|---|
| Logo (all variants) | SVG, PNG (@1x, @2x, @4x), PDF (vector) |
| Favicon package | .ico, .svg, .png (multiple sizes) |
| Banners/headers | PNG (@1x, @2x), WebP |
| OpenGraph | PNG (1200×630) |
| Animations | SVG animated, Lottie JSON, GIF fallback |
| Brand guidelines | PDF |

---

## 6. Recommended AI Model for Generation

### Primary Recommendation: **Ideogram 3.0**

**Why:** Ideogram 3.0 excels at text rendering in images — critical for a wordmark-heavy brand where "THE FORGE" must be pixel-perfect in every banner and lockup. It handles typographic logos better than any competing model. Strong on dark/moody aesthetics and neon lighting.

**Best for:** Wordmark explorations, banner compositions with text, social media headers with integrated typography.

### Secondary Recommendations:

| Model | Best For | Notes |
|---|---|---|
| **Midjourney v6.1** | Mood boards, concept exploration, abstract mark ideation | Best overall aesthetic quality for dark/cyberpunk themes. Use `--style raw` for cleaner output. Weak on precise text. |
| **FLUX 1.1 Pro (Ultra)** | High-resolution logomark renders, icon explorations | Strong prompt adherence, good at geometric precision. Use for the shield/mark variations. |
| **Google Imagen 3** | Clean, production-ready variations once direction is locked | Good at following detailed style specifications consistently. |
| **Recraft V3 (Red Panda)** | Vector-style logo generation | Specifically designed for design assets, outputs SVG-ready clean shapes. Best for the final logomark if you want AI-assisted vector output. |

### Suggested Workflow

1. **Concept phase** → Midjourney v6.1 for broad mood/direction exploration (50–100 generations)
2. **Mark refinement** → Recraft V3 or FLUX Pro for geometric logomark candidates
3. **Wordmark + lockups** → Ideogram 3.0 for text-integrated compositions
4. **Final production** → Human designer in Illustrator/Figma to vectorize, refine, and build the full kit from the AI-generated direction

> AI models should drive the concept phase, not replace final production. The winning direction should be hand-finished by a designer for crisp vectors, proper kerning, and scalable output.

---

## 7. Example Prompts to Start With

### Logomark Exploration (Midjourney / FLUX)
```
Minimalist logo icon for "The Forge", an AI gladiator arena on blockchain.
A sharp angular shield merged with a lightning bolt and subtle circuit traces.
Neon green (#00ff41) on pure black background. Geometric, technical, no text.
Clean vector style, symmetrical, works at 32px. Cyberpunk aesthetic.
--ar 1:1 --style raw --v 6.1
```

### Wordmark Exploration (Ideogram 3.0)
```
Logo wordmark reading "THE FORGE" in bold uppercase monospace font.
Cyberpunk terminal aesthetic. Neon green glowing text on #0a0a0a black.
Subtle CRT scanline effect and pixel-shift distortion on letterforms.
Wide letter-spacing, sharp edges, no rounded corners. Clean and minimal.
Professional brand logo, centered composition.
```

### Banner Exploration (Midjourney)
```
Dark cyberpunk website hero banner for "The Forge" AI arena.
Deep black (#0a0a0a) background with falling green matrix rain code.
Central shield-bolt logo glowing neon green (#00ff41).
Subtle circuit board trace patterns emanating from center.
Cinematic lighting, wide format, moody atmospheric.
--ar 16:5 --style raw --v 6.1
```

---

*Brief prepared for The Forge — v1.0*
