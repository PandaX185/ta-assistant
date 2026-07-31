# TA Assistant

A local-first desktop app for university teaching assistants. Track students, grades, and attendance — fully offline, no cloud, no account.

**Stack:** Tauri 2 · React 19 · TypeScript · SQLite · Tailwind CSS · shadcn/ui

## Features

- **Subjects & Semesters** — organize everything by year → semester → subject with a persistent global filter bar
- **Students** — enroll, edit, and inspect students; detail view shows grades and attendance history
- **Spotlight Search** — `Ctrl+Shift+P` to find any student; selecting one jumps straight to their detail view
- **Grading** — quizzes and assignments with max scores; one tab per item with inline score editing capped at the max
- **Attendance** — lecture-based checklists; select a lecture and tick the students who showed up
- **Localization** — English and Arabic (RTL)
- **Dark Mode** — because TAs work at night too
- **Local-First & Private** — all data stays in a local SQLite file on your machine

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (stable)
- [Tauri CLI](https://v2.tauri.app/start/cli/)

### Development

```bash
git clone https://github.com/PandaX185/ta-assistant.git
cd ta-assistant
npm install
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

Bundles land in `src-tauri/target/release/bundle/`.

## Tech Stack

| Layer       | Technology                        |
| ----------- | --------------------------------- |
| Desktop     | Tauri 2                           |
| Frontend    | React 19 + TypeScript             |
| Styling     | Tailwind CSS + shadcn/ui          |
| Database    | SQLite via rusqlite (bundled)     |
| State       | Zustand                           |
| i18n        | react-i18next (en/ar)             |

## Security

- The app is **locked on every launch** with a password set during first-run onboarding
- The password is verified against an **Argon2** hash and never stored or transmitted in plaintext
- There is **no recovery option** — losing the password means resetting the app data
- All data is stored locally; nothing is transmitted anywhere

## Contributing

Contributions are welcome.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push and open a Pull Request

Please use [conventional commits](https://www.conventionalcommits.org/) and ensure the TypeScript and Rust builds pass.

## License

MIT — see [LICENSE](LICENSE).
