import { Inject, LoggerService, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { EMITTER_FEATURE_LOGGER, EMITTER_LOGGER } from '../constants';

const WRAPPER_ADDED = Symbol('WRAPPER_ADDED');

/**
 * Decorate a method to listen for an emitter event.
 *
 * Behaves like `@OnEvent` from `@nestjs/event-emitter`, but wraps the
 * handler so any thrown / rejected error is caught and reported to the
 * configured logger:
 *
 * - If the listener's module imported `EmitterModule.forFeature({ logger })`,
 *   that local logger is used.
 * - Otherwise, the root logger registered by `EmitterModule.forRoot({ logger })`
 *   (defaulting to `new Logger('EmitterModule')`) is used.
 *
 * Options:
 *
 * - `promisify: true` (default) — the handler must return a Promise;
 *   rejections are caught with `.catch(...)`.
 * - `promisify: false` — the handler is treated as synchronous; throws
 *   are caught with try/catch and `undefined` is returned.
 */
export function OnEmitterEvent<T>(
  eventType: string & keyof T,
  options: Parameters<typeof OnEvent>[1] = {},
) {
  return (target: any, _property: string, descriptor: PropertyDescriptor) => {
    // Required: every listener resolves the global root logger so we always
    // have a working fallback.
    Inject(EMITTER_LOGGER)(target, EMITTER_LOGGER);

    // Optional: the per-feature override is only present when the listener's
    // module imported `EmitterModule.forFeature({ logger })`.
    Inject(EMITTER_FEATURE_LOGGER)(target, EMITTER_FEATURE_LOGGER);
    Optional()(target, EMITTER_FEATURE_LOGGER);

    const method = descriptor.value;
    const onEventOptions = {
      async: true, promisify: true, suppressErrors: false, ...options,
    };

    if (!target[WRAPPER_ADDED]) {
      descriptor.value = function onEmitterEventWrapper(...args: any[]) {
        const self = this as any;
        const logger = (self[EMITTER_FEATURE_LOGGER] as LoggerService | undefined)
          ?? (self[EMITTER_LOGGER] as LoggerService);

        if (onEventOptions.promisify === false) {
          try {
            return method.apply(this, args);
          } catch (error) {
            logger.error(error);

            return undefined;
          }
        }
        return method.apply(this, args).catch((error: any) => {
          logger.error(error);
        });
      };
      target[WRAPPER_ADDED] = true;
    }

    return OnEvent(eventType, onEventOptions)(target, _property, descriptor);
  };
}
