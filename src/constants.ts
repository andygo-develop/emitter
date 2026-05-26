/**
 * Injection token for the root-level logger used by `@OnEmitterEvent`.
 * Provided by `EmitterModule` with a default `new Logger('EmitterModule')`
 * and overridable via `EmitterModule.forRoot({ logger })`. Always
 * available — `forRoot` exports it globally.
 */
export const EMITTER_LOGGER = Symbol('EMITTER_LOGGER');

/**
 * Injection token for an optional per-feature logger override.
 * Only provided when a caller passes `logger` to
 * `EmitterModule.forFeature({ logger })`. The `@OnEmitterEvent` decorator
 * prefers this over `EMITTER_LOGGER` when both are available, which is
 * how feature modules can route their listener errors to their own
 * logger without disturbing the global default.
 */
export const EMITTER_FEATURE_LOGGER = Symbol('EMITTER_FEATURE_LOGGER');
