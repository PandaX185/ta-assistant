# TA Assistant 🐼

> A local-first desktop app for university teaching assistants.
> Track students, grades, attendance, and bonuses — all offline, all yours.

**Stack:** Tauri 2 + React + TypeScript + SQLite + Tailwind + shadcn/ui

## Features

- 📚 **Subjects & Semesters** — Organize by year/semester/subject with a global filter
- 👥 **Student Management** — Add students, search instantly across all data
- 📝 **Grading** — Quizzes, assignments with max scores and per-student grades
- 🪑 **Attendance** — Lecture-based rosters with present/absent/late/excused tracking
- ➕ **Bonuses/Minuses** — Quick adjustments with reason logging
- 📊 **Total Marks** — Auto-calculated sum of all grades + bonuses
- 🔍 **Global Spotlight Search** — `Ctrl+Shift+P` to find any student instantly
- 🌐 **Fully Localized** — English and Arabic (RTL) with more to come
- 📋 **Excel Export** — Formatted xlsx with styling and auto-calculated totals
- 🔒 **Local-First & Private** — Your data never leaves your machine
- 🌙 **Dark Mode** — Because TAs work at night too

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Rust](https://rustup.rs/) (latest stable)
- [Tauri CLI](https://v2.tauri.app/start/cli/)

### Development

```bash
# Clone
git clone https://github.com/PandaX185/ta-assistant.git
cd ta-assistant

# Install frontend deps
npm install

# Run in dev mode
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

Output binaries will be in `src-tauri/target/release/bundle/`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Tauri 2 |
| Frontend | React 19 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Database | SQLite (via tauri-plugin-sql) |
| i18n | react-i18next (ar/en) |
| Excel | rust_xlsxwriter |
| State | Zustand |

## Screenshots

> Coming soon — app is under active development.

## Roadmap

See [plan/brain-ta-assistant.md](plan/brain-ta-assistant.md) for the full design document and development roadmap.

## Contributing

Contributions are welcome! This project aims to be useful for TAs everywhere.

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

Please follow [conventional commits](https://www.conventionalcommits.org/) and ensure linting passes.

## License

MIT — see [LICENSE](LICENSE) for details.

## Author

Built by [Abdullah (PandaX185)](https://github.com/PandaX185) for TAs who deserve better tools.
