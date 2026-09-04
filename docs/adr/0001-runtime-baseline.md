# ADR-0001: Runtime baseline

- Status: accepted for W0 scaffold
- Decision date: 2026-09-04
- Metadata retrieved: 2026-09-04, Asia/Ho_Chi_Minh

## Context

Pay Slip requires a reproducible Windows-native TypeScript workspace before any payroll behavior is implemented. W0 must pin direct dependencies, preserve a committed npm lockfile, and prove lint, typecheck, focused test, and production build independently of PostgreSQL or external services.

## Decision

| Surface | Exact W0 value | Evidence |
|---|---:|---|
| Node.js | 24.19.0 | local `node --version` |
| npm | 11.4.2 | local `npm --version` |
| Next.js | 16.3.3 | registry metadata; requires Node >=20.9.0 |
| React / React DOM | 19.2.8 | registry metadata; matching peer versions |
| TypeScript | 6.0.3 | registry metadata; compatible with the Next ESLint TypeScript parser |
| Vitest | 5.0.0 | registry metadata; supports Node 24 |
| ESLint | 9.39.5 | registry metadata; compatible with Next's ESLint plugins |
| eslint-config-next | 16.3.3 | registry metadata; matches Next |
| Node types | 24.13.3 | latest retrieved release in major 24 |
| React types | 19.2.18 / 19.2.7 | registry metadata |

Direct dependency versions are exact in package manifests. Transitive resolution is sealed by `package-lock.json`. W0 installs with lifecycle scripts disabled and does not start a server or browser.

The registry's newest ESLint 10.9.1 and TypeScript 7.0.2 releases were rejected for this scaffold because `eslint-config-next` 16.3.3 resolves plugins that support ESLint through major 9 and TypeScript below 6.1. The pinned versions above are the newest compatible releases returned by npm's peer resolver on the decision date; W0 does not suppress these checks with `--legacy-peer-deps` or `--force`.

Prisma is intentionally not installed in W0. Registry metadata reported `latest` as prerelease `8.0.0-rc.12`, so that tag is rejected. The stable production candidate recorded for the later database wave is Prisma and `@prisma/client` 7.10.0, whose engine range includes Node 24.

PostgreSQL is deferred to its approved database wave. `psql` was not installed or not available on `PATH` during W0 preflight, so W0 makes no local PostgreSQL runtime claim.

The architecture test runner had to exist before the first RED run. The approved bootstrap installed only exact Vitest and Node 24 type packages, then observed the test fail because the web workspace did not yet declare Next 16.3.3. The remaining scaffold is the GREEN implementation.

## Sources

- [Node.js releases](https://nodejs.org/en/about/previous-releases)
- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js 16.3.3 registry record](https://www.npmjs.com/package/next/v/16.3.3)
- [Prisma system requirements](https://www.prisma.io/docs/orm/reference/system-requirements)
- [Prisma 7.10.0 registry record](https://www.npmjs.com/package/prisma/v/7.10.0)
- [PostgreSQL Windows downloads](https://www.postgresql.org/download/windows/)

## Consequences

- W0 proves only repository structure and the local build toolchain.
- No database, payroll calculation, authentication, attendance, PDF, delivery, Windows service, or production behavior is implied.
- Dependency upgrades require a new evidence-backed decision and regenerated lockfile.
