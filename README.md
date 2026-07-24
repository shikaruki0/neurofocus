<div align="center">

# 🧠 NeuroFocus

**Gamified Productivity & Study App**

_Level up your brain. Build unbreakable discipline. Track everything that matters._

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Live Demo](https://shikaruki0.github.io/neurofocus) · [Report Bug](../../issues) · [Request Feature](../../issues)

</div>

---

## ✨ Features

- 🎯 **XP & Level System** — Earn experience points, level up, unlock ranks
- 🔥 **Streak Tracking** — Build consecutive day streaks with freeze tokens
- ⏱️ **Focus Timer** — Pomodoro (25min), Deep Work (52min), Flow State (90min)
- 📚 **Backlog Blaster** — Track lectures by subject (Physics, Chemistry, Math, Biology, Hindi, English, IT)
- ✅ **Habit Forge** — Stack tiny habits with streak tracking
- ⚔️ **Battle Plan** — Priority-based daily task planning (A/B/C)
- 🏆 **Trophy Room** — 35+ badges across rarity tiers (Common → Ultra)
- 🌅 **Morning Ritual** — 5-step priming routine for 2x XP boost
- 🧘 **Detox Protocol** — Urge surfing timer for digital discipline
- 📊 **Weekly Reports** — Visual activity breakdown
- 🔐 **Safe account start** — Continue with email for cross-device sync or skip for a local-only profile
- 💾 **Progress protection** — Local backups and explicit local/cloud/merge choices prevent silent overwrites
- 🎨 **3 Themes** — Midnight, Cream, Dusk + auto-switch by time
- 📱 **PWA** — Installable, works offline
- 🔔 **Haptic Feedback** — Vibration on milestones (mobile)

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 20.19+ (22 LTS recommended)
- npm 10+ or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/shikaruki0/neurofocus.git
cd neurofocus

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
npm run preview
```

---

## 🏗️ Architecture

```
neurofocus/
├── src/
│   ├── main.js              # App entry point
│   ├── styles/              # CSS modules
│   │   ├── variables.css    # Design tokens (colors, spacing, typography)
│   │   ├── base.css         # Reset, layout, ambient background
│   │   ├── components.css   # Cards, buttons, inputs, modals
│   │   └── animations.css   # Keyframes and transitions
│   ├── modules/             # Feature modules
│   │   ├── storage.js       # LocalStorage abstraction
│   │   ├── xp.js            # XP, levels, ranks
│   │   ├── quests.js        # Daily quest generation + checking
│   │   ├── ritual.js        # Morning ritual logic
│   │   ├── streak.js        # Streak tracking + freezes
│   │   ├── badges.js        # Badge definitions + unlock logic
│   │   ├── subjects.js      # Subject mastery tracking
│   │   ├── focus.js         # Focus timer engine
│   │   ├── urge.js          # Urge surfing timer
│   │   ├── backlogs.js      # Backlog management
│   │   ├── habits.js        # Habit tracking
│   │   ├── battle.js        # Battle plan tasks
│   │   ├── weekly.js        # Weekly report stats
│   │   ├── buddy.js         # Accountability partner
│   │   ├── theme.js         # Theme switching
│   │   ├── quotes.js        # Daily quotes
│   │   ├── celebration.js   # Confetti + modal celebrations
│   │   ├── sound.js         # Web Audio sound engine
│   │   └── session.js       # Frictionless local login
│   ├── ui/                  # DOM rendering
│   │   ├── render.js        # Main render orchestrator
│   │   ├── home.js          # Home tab rendering
│   │   ├── detox.js         # Detox tab rendering
│   │   ├── backlog.js       # Backlog tab rendering
│   │   ├── focus.js         # Focus tab rendering
│   │   ├── plan.js          # Plan tab rendering
│   │   ├── settings.js      # Settings drawer
│   │   └── trophy.js        # Trophy room modal
│   └── utils/               # Helpers
│       ├── dom.js           # DOM helpers (createElement, qs)
│       ├── sanitize.js      # XSS prevention
│       ├── date.js          # Date utilities
│       └── validation.js    # Input validation
├── tests/                   # Unit tests
├── public/                  # Static assets
├── index.html               # Entry HTML
├── vite.config.js           # Vite + PWA config
├── .eslintrc.cjs            # ESLint config
├── .prettierrc              # Prettier config
└── package.json
```

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

---

## 🔧 Configuration

### Login & Data Storage

The first screen offers **Continue with Email** (a Supabase magic link for cross-device sync) and **Skip for now** (a display-name profile saved locally). Missing cloud configuration never blocks local use. Existing local data is not deleted when logging out. When both local and cloud data exist, the app backs up locally and requires an explicit local, cloud, or safe merge choice before replacing anything.

See [docs/supabase-setup.md](docs/supabase-setup.md) for the one-time database and Auth setup.

### Environment Variables

| Variable                 | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `VITE_SUPABASE_URL`      | Supabase project URL (optional for local mode)     |
| `VITE_SUPABASE_ANON_KEY` | Public Supabase anon key (optional for local mode) |
| `VITE_APP_TITLE`         | App title (default: NeuroFocus)                    |
| `VITE_APP_VERSION`       | Version displayed in settings                      |

Never commit `.env.local` or real credentials.

---

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## 📄 License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- Built for dopamine-driven discipline
- Inspired by ultradian rhythm research
- Designed for deep work practitioners

---

<div align="center">

**⭐ Star this repo if it helped you stay focused! ⭐**

</div>
