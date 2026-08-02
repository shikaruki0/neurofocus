# Theme System — Ink, Paper, Forest

NeuroFocusX ships three focus-first themes. Each one is a *mood*, not a random color swap:
they follow color psychology for concentration and calm, and share the same token
structure (`src/styles/variables.css`), so the UI never needs per-theme code.

## The three themes

| Theme | Internal ID | Mood | Accent | Why it works |
|---|---|---|---|---|
| 🌙 **Ink** (default) | `midnight` | Deep navy, night library | Indigo → Sky `#818cf8` → `#38bdf8` | Dark navy reduces eye strain vs pure black; indigo/sky is calm and credible — no gaming-cyan/purple clichés |
| ☀️ **Paper** | `light` | Warm cream, notebook & daylight | Amber → Orange `#b45309` → `#c2410c` | Warm paper (`#faf6f0`) reads like a study notebook; amber ink keeps energy without red aggression |
| 🌲 **Forest** | `dusk` | Pine forest, deep calm | Emerald → Teal `#34d399` → `#2dd4bf` | Green is the best-studied calm/concentration color (Forest app effect); deep pine (`#0b1512`) is restful for evening work |

> **Why internal IDs stay `midnight` / `light` / `dusk`:** saved profiles, sync data and
> auto-theme code all reference these keys. Renaming them would force migration for zero
> user benefit. The visible names (Ink/Paper/Forest) live in `THEME_LABELS` and i18n only.

## Auto-switch

- **6:00 AM – 6:00 PM** → Paper (light)
- **6:00 PM – 6:00 AM** → Ink (dark)

Implemented in `applyAutoTheme()` (`src/modules/theme.ts`).

## Tokens per theme

Every theme defines the same ~60 tokens in `variables.css`:

- **Surfaces:** `--bg`, `--surface`, `--surface-2`, `--elevated` (4-step elevation)
- **Brand:** `--accent-start`, `--accent-end` (gradient), `--success`, `--danger`, `--gold`
- **Text:** `--text`, `--text-secondary`, `--text-tertiary`
- **Chrome:** `--header-bg`, `--nav-bg`, `--overlay-bg`, `--glass-bg`
- **Glow:** `--ambient-1/2`, `--shadow`, `--accent-start/end-fade`
- **Rarity (6):** `--common` → `--ultra`
- **Subjects (8):** `--physics` … `--other`, each with a matching `-fade` and `-border`

## Accessibility rules enforced here

- Body text contrast ≥ 7:1 in all three themes (e.g. `#292524` on `#faf6f0` ≈ 12:1).
- Accent gradients chosen so **white text on buttons passes AA** (4.5:1) in every theme
  (Paper uses amber-700/orange-700, not light amber).
- `color-scheme` is set per theme so native controls (scrollbars, inputs) match.

## How to add a new theme

1. Add a `[data-theme='name']` block in `variables.css` (copy an existing block, keep every token).
2. Add the name to `ThemeName`, `THEMES`, `THEME_LABELS`, and `THEME_META_COLOR` in `src/modules/theme.ts`.
3. Add a picker button in `index.html` + i18n labels in `src/modules/locales.ts`.
4. Add the browser chrome color to `THEME_META_COLOR` (PWA title bar).

## Concept previews

AI concept mockups used during the redesign (color mood only — the real app uses the
exact hex values above):

- `design/theme-concepts/ink-dark.png`
- `design/theme-concepts/paper-light.png`
- `design/theme-concepts/forest-dark.png`
