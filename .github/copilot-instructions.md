# Copilot Instructions for my-app

## Project Overview

- **Architecture:** Monorepo with top-level `index.ts` as entry point. Contains `packages/client` and `packages/server` for future modularization, but these are currently empty.
- **Runtime:** Uses [Bun](https://bun.com) for dependency management and execution. All scripts and commands should use Bun.
- **Entry Point:** Main logic is in `index.ts` at the root.

## Developer Workflows

- **Install dependencies:**
   ```bash
   bun install
   ```
- **Run the app:**
   ```bash
   bun run index.ts
   ```
- **No build step required** (Bun runs TypeScript directly).

## Conventions & Patterns

- **TypeScript:** All code is written in TypeScript. See `tsconfig.json` for configuration.
- **Monorepo Structure:**
   - Future code should be organized into `packages/client` and `packages/server` as the app grows.
   - Keep shared logic at the root or move to a shared package if needed.
- **No custom scripts or test runners** are present yet. Add scripts to `package.json` if needed.

## Integration Points

- **External dependencies:** Managed via Bun. Add new dependencies with `bun add <package>`.
- **No current integrations** with databases, APIs, or external services. Document any new integrations in this file and in `README.md`.

## Examples

- To add a new package:
   ```bash
   bun add lodash
   ```
- To run a new entry point:
   ```bash
   bun run packages/client/main.ts
   ```

## Key Files

- `index.ts`: Main application logic.
- `package.json`: Dependency and script management.
- `tsconfig.json`: TypeScript configuration.
- `README.md`: Basic project instructions.

---

**Update this file as new workflows, conventions, or integrations are added.**
