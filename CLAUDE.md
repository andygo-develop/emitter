# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`@andygo.dev/emitter` is a published NestJS library — a thin type-safe wrapper around `@nestjs/event-emitter`. It ships three exports:

- `EmitterService<T>` — typed `emit`/`emitAsync` keyed off a user-supplied event map interface.
- `OnEmitterEvent<T>` decorator — drop-in for `@OnEvent` that catches thrown/rejected errors and routes them to an injected logger instead of propagating them.
- `EmitterModule` — `@Global()` NestJS module with `forRoot` and `forFeature` static factory methods.

## Commands

```bash
npm test                     # run all tests (jest)
npm run lint                 # eslint with --max-warnings=0
npm run lint:fix             # eslint --fix
npm run build                # tsc → dist/
npm run example:complex      # run the example NestJS app

# Run a single test file
npx jest tests/on-emitter-event.decorator.spec.ts
```

### Publishing

```bash
npm run bump:patch      # bump version (patch) in package.json only — no git tag, no publish
npm run bump:minor      # bump version (minor) — no git tag, no publish
npm run bump:major      # bump version (major) — no git tag, no publish
npm run publish         # publish current build to npm (triggers prepublishOnly: clean + build)
```

`preversion` runs lint + test + build; `postversion` runs `git push --follow-tags && npm publish --access public`. These fire when `npm version` is invoked directly (e.g. during a release worktree bump). The `bump:*` scripts skip these hooks via `--no-git-tag-version`.

## Architecture

### Two-token logger design

The core challenge: NestJS global module exports always win over local module providers. If `forRoot` exported `EMITTER_LOGGER` globally and `forFeature` tried to re-provide the same token locally, NestJS would silently discard the local override.

The fix is two distinct tokens (`src/constants.ts`):
- `EMITTER_LOGGER` — root-level, provided globally by `forRoot`, always present.
- `EMITTER_FEATURE_LOGGER` — feature-level, provided only when a module calls `EmitterModule.forFeature({ logger })`. Injected as `@Optional()`.

The decorator (`src/decorators/on-emitter-event.decorator.ts`) resolves both at runtime and prefers `EMITTER_FEATURE_LOGGER` when present.

### Decorator wrapper idempotency

`@OnEmitterEvent` injects both logger tokens into the class prototype and wraps `descriptor.value` with an error-catching function. A single method may carry **multiple** `@OnEmitterEvent` decorators (one per event type it handles), and stacked decorators all run the same wrapping logic — but the wrapper must be applied only once to the method (otherwise it double-wraps the same handler).

This is guarded by `WRAPPER_ADDED`: a `Symbol` stamped onto the prototype on first decoration. Subsequent decorators on the same class skip the re-wrap.

### `forFeature` fresh-class pattern

`EmitterModule.forFeature` creates `class EmitterFeatureModule {}` inline on every call. This is intentional — Nest deduplicates dynamic module imports by reference; a shared class would cause all `forFeature` calls across the app to collapse into a single provider set.

### Test structure

Tests live in `tests/` and use `@nestjs/testing`. Each spec bootstraps a real `TestingModule` — with `EmitterModule` (static), `EmitterModule.forRoot()`, or `EmitterModule.forFeature()` depending on what's under test. No mocking of the event emitter itself. Tests call `moduleRef.close()` after each test, either in an `afterEach` hook or inline at the end of each test body.
