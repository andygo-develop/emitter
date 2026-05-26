import {
  DynamicModule, Global, Logger, LoggerService, Module,
} from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { EMITTER_FEATURE_LOGGER, EMITTER_LOGGER } from './constants';
import { EmitterService } from './services/emitter.service';

export interface EmitterModuleOptions {
  wildcard?: boolean;
  delimiter?: string;
  maxListeners?: number;
  verboseMemoryLeak?: boolean;
  ignoreErrors?: boolean;
  newListener?: boolean;
  removeListener?: boolean;
  global?: boolean;

  /**
   * Logger used by `@OnEmitterEvent` when a listener throws or rejects.
   * Anything implementing NestJS's `LoggerService` interface works —
   * Nest's built-in `Logger`, `pino`, `winston`, your project's
   * `LoggerService`, etc.
   *
   * Defaults to `new Logger('EmitterModule')` (the NestJS console logger).
   */
  logger?: LoggerService;
}

/**
 * Options accepted by `EmitterModule.forFeature(...)` — currently just the
 * logger. EventEmitter2's `wildcard` / `delimiter` / `maxListeners` are
 * process-global and can only be configured via `forRoot(...)`.
 */
export interface EmitterFeatureOptions {
  /**
   * Logger to use for listeners declared inside the importing module.
   * Falls back to the root-level `EMITTER_LOGGER` (set via `forRoot`,
   * defaulting to `new Logger('EmitterModule')`) when omitted.
   */
  logger?: LoggerService;
}

const EVENT_EMITTER_KEYS = [
  'wildcard',
  'delimiter',
  'maxListeners',
  'verboseMemoryLeak',
  'ignoreErrors',
  'newListener',
  'removeListener',
  'global',
] as const;

const DEFAULT_OPTIONS: EmitterModuleOptions = {
  wildcard: false,
  delimiter: '.',
  maxListeners: 50,
};

const DEFAULT_LOGGER: LoggerService = new Logger('EmitterModule');

function pickEventEmitterOptions(options: EmitterModuleOptions) {
  const out: Record<string, unknown> = {};
  for (const key of EVENT_EMITTER_KEYS) {
    if (options[key] !== undefined) out[key] = options[key];
  }
  return out;
}

@Global()
@Module({
  imports: [EventEmitterModule.forRoot(pickEventEmitterOptions(DEFAULT_OPTIONS))],
  providers: [
    EmitterService,
    { provide: EMITTER_LOGGER, useValue: DEFAULT_LOGGER },
  ],
  exports: [EmitterService, EMITTER_LOGGER],
})
export class EmitterModule {
  /**
   * Use `EmitterModule.forRoot({...})` to override the default
   * EventEmitter2 configuration and/or supply a custom logger.
   *
   * Default options are: `{ wildcard: false, delimiter: '.', maxListeners: 50 }`.
   * Default logger is `new Logger('EmitterModule')`.
   *
   * The returned module is global — `EmitterService` and `EMITTER_LOGGER`
   * are available app-wide without explicit imports.
   */
  static forRoot(options: EmitterModuleOptions = {}): DynamicModule {
    const merged = { ...DEFAULT_OPTIONS, ...options };
    const logger = options.logger ?? DEFAULT_LOGGER;

    return {
      module: EmitterModule,
      global: true,
      imports: [EventEmitterModule.forRoot(pickEventEmitterOptions(merged))],
      providers: [
        EmitterService,
        { provide: EMITTER_LOGGER, useValue: logger },
      ],
      exports: [EmitterService, EMITTER_LOGGER],
    };
  }

  /**
   * Override the logger used by `@OnEmitterEvent` for listeners declared
   * inside the importing module.
   *
   * Implementation note: `forFeature` provides a separate
   * `EMITTER_FEATURE_LOGGER` token, *not* a second binding of
   * `EMITTER_LOGGER`. The decorator injects both tokens and prefers the
   * feature one when present. This sidesteps NestJS's "global module
   * exports beat local imports" resolution — without it, `forRoot`'s
   * global `EMITTER_LOGGER` would always win and the override would be
   * silently dropped.
   *
   * If `options.logger` is omitted, the feature module is effectively
   * a no-op (still useful as documentation that a module wants
   * emitter-aware logging), and listeners inside it fall through to
   * the root-level `EMITTER_LOGGER` from `forRoot(...)`.
   *
   * @example
   * ```ts
   * // app.module.ts
   * @Module({
   *   imports: [EmitterModule.forRoot({ logger: rootLogger })],
   * })
   * export class AppModule {}
   *
   * // users.module.ts — overrides the root logger locally
   * @Module({
   *   imports: [
   *     EmitterModule.forFeature({
   *       logger: new Logger('UsersModule'),
   *     }),
   *   ],
   *   providers: [UserCreatedListener],
   * })
   * export class UsersModule {}
   *
   * // orders.module.ts — no override, falls back to rootLogger
   * @Module({
   *   imports: [EmitterModule.forFeature()],
   *   providers: [OrderPaidListener],
   * })
   * export class OrdersModule {}
   * ```
   */
  static forFeature(options: EmitterFeatureOptions = {}): DynamicModule {
    // Fresh class per call so Nest doesn't dedupe the feature import.
    class EmitterFeatureModule {}

    if (options.logger === undefined) {
      // No override — listeners fall through to root EMITTER_LOGGER.
      return {
        module: EmitterFeatureModule,
      };
    }

    return {
      module: EmitterFeatureModule,
      providers: [
        { provide: EMITTER_FEATURE_LOGGER, useValue: options.logger },
      ],
      exports: [EMITTER_FEATURE_LOGGER],
    };
  }
}
