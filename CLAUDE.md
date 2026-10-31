# CLAUDE.md

## Publishing a branch

Before pushing or opening a PR:

1. `git fetch origin` and merge `origin/main` into the branch so it is up to date.
2. Run everything CI runs (`.github/workflows/ci.yml`) and make sure it passes:
   `pnpm install --frozen-lockfile`, `pnpm run setup`, `pnpm run check`,
   `pnpm run test:integration`, `pnpm run test:e2e`.
3. Then push and open the PR against `main`.

## Authorship

Claude must never appear as an author or co-author. Commits are authored by the
local git user only: no `Co-Authored-By: Claude` trailers in commit messages and
no "Generated with Claude Code" lines in PR descriptions.
