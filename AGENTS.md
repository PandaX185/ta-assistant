# AGENTS.md — ta-assistant

## Hat to wear
Local-first desktop app for university TAs (subjects, sections, students, grades, attendance). Think **desktop app engineer + data-model designer** — schema changes are high-risk, keep migrations additive and safe.

## Stack
- Tauri 2 + React 19 + TypeScript + Tailwind + shadcn/ui
- Zustand, TanStack Table, Fuse.js, react-i18next
- SQLite via `tauri-plugin-sql`, `rust_xlsxwriter` (Excel export), `argon2` (local password)
- Full i18n ar/en, dark mode, onboarding wizard

## Commands
```bash
npm run dev          # vite dev
npm run build        # tsc --noEmit && vite build
npm test             # vitest run
make install         # install deps
make dev / make build
make lint / make check
make test            # test-rust + test-frontend
```

## Conventions
- **Migrations live in src-tauri.** Numbered `NNN_*.sql` (013, 014, 015…). Never edit an applied migration — add a new one.
- `run_pending` toggles FK OFF around rebuild migrations (production plugin conn never enables FK; test_conn does).
- Dedupe students on university ID (`find_students` → "Use existing" vs "Create new").
- Global spotlight search: Ctrl+Shift+P.
- Plans go in `plan/` (`feat-`, `bug-`, `refactor-`, `brain-`). Design doc: `plan/brain-ta-assistant.md`.
- MIT license, public open source. Repo: `PandaX185/ta-assistant` (verify).
- i18n: both `ar` and `en` must be updated together.

## Workflows
Follow Abdullah's global workflows (`/feat`, `/bug`, `/refactor`, `/chore`, `/brain`). **No coding without explicit approval.**

## Status
Active development — core CRUD built (settings, students, grades, attendance, dashboard); sections feature shipped.
