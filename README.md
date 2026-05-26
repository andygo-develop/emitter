# @andygo.dev/emitter

A thin, **type-safe** NestJS wrapper around
[`@nestjs/event-emitter`](https://docs.nestjs.com/techniques/events) with an
**error-catching `@OnEmitterEvent`** decorator.

Three pieces:

- `EmitterService<T>` — typed `emit(...)` / `emitAsync(...)` keyed off your
  event map.
- `OnEmitterEvent(...)` — drop-in replacement for `@OnEvent` that catches
  thrown / rejected errors and logs them via the injected
  `EMITTER_LOGGER` (NestJS `Logger` by default), so a single bad listener
  can't take the whole emitter loop down.
- `EmitterModule.forRoot({...})` — wires the underlying `EventEmitter2` with
  whatever options you want.

> **Runnable example:** [`examples/complex/`](examples/complex/) — a NestJS
> app that exercises every feature (typed events, `forRoot` + `forFeature`,
> async + sync listeners, error catching, cross-module flows). Clone the
> repo and run `npm run example:complex`.

## Install

```bash
npm install @andygo.dev/emitter
```

Peer dependencies:

- `@nestjs/common` `^10 || ^11`
- `@nestjs/event-emitter` `^2 || ^3`

## Quick start

### 1. Define your event map

A plain TypeScript type — the key is the event name, the value is the payload
shape. This is the single source of truth for both emit and listen.

```ts
// app.events.ts
export interface AppEvents {
  'user.created': { id: number; email: string };
  'user.deleted': { id: number };
  'order.paid': { orderId: number; amount: number };
}
```

### 2. Register the module

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { EmitterModule } from '@andygo.dev/emitter';

@Module({
  imports: [
    EmitterModule.forRoot({
      // optional — these are the defaults:
      wildcard: false,
      delimiter: '.',
      maxListeners: 50,
    }),
  ],
})
export class AppModule {}
```

Or use the static `EmitterModule` import directly if the defaults are fine —
it's `@Global()` either way, so you only need it once.

### 3. Emit events

```ts
import { Injectable } from '@nestjs/common';
import { EmitterService } from '@andygo.dev/emitter';
import { AppEvents } from './app.events';

@Injectable()
export class UsersService {
  constructor(private readonly events: EmitterService<AppEvents>) {}

  async create(input: CreateUserDto) {
    const user = await this.repo.save(input);

    // ✓ key + payload are checked against AppEvents
    await this.events.emitAsync('user.created', { id: user.id, email: user.email });

    return user;
  }
}
```

Both methods are strictly typed: passing the wrong event name or a payload
that doesn't match `AppEvents[key]` is a compile error.

| Method | Returns | When to use |
|---|---|---|
| `emit(name, payload)` | `boolean` (was anyone listening?) | Fire-and-forget |
| `emitAsync(name, payload)` | `Promise<any[]>` of all listener return values | When you need to wait for handlers to finish |

### 4. Listen for events

Use `@OnEmitterEvent` instead of `@OnEvent`. Same API, but a listener that
throws or rejects is logged via `console.error` instead of crashing the
emitter loop.

```ts
import { Injectable } from '@nestjs/common';
import { OnEmitterEvent } from '@andygo.dev/emitter';
import { AppEvents } from './app.events';

@Injectable()
export class WelcomeEmailListener {
  @OnEmitterEvent<AppEvents>('user.created')
  async sendWelcome(payload: AppEvents['user.created']) {
    await this.mailer.send(payload.email, 'welcome');
    // any throw / rejection here is caught + logged, not propagated
  }
}
```

### Synchronous listeners

For non-async handlers, pass `promisify: false` so the wrapper uses
`try/catch` instead of `.catch()`:

```ts
@OnEmitterEvent<AppEvents>('user.deleted', { promisify: false })
purgeCache(payload: AppEvents['user.deleted']) {
  this.cache.delete(`user:${payload.id}`);
}
```

## Why not just `@OnEvent`?

Vanilla `@nestjs/event-emitter` propagates exceptions out of listeners and
the default `EventEmitter2` will emit an `'error'` event when there's no
listener — easy to miss in production logs. `@OnEmitterEvent` wraps the
listener method exactly once (idempotent across stacked decorators on the
same class) and catches both sync throws and promise rejections, routing
them to the configured logger so they end up in your normal log pipeline.

## Custom logger

By default `@OnEmitterEvent` logs errors via `new Logger('EmitterModule')`
(Nest's built-in console logger). Swap in anything that implements
`LoggerService` via `EmitterModule.forRoot`:

```ts
import { EmitterModule } from '@andygo.dev/emitter';
import { PinoLogger } from 'nestjs-pino'; // or your own LoggerService

@Module({
  imports: [
    EmitterModule.forRoot({
      logger: new PinoLogger({ pinoHttp: {} }),
    }),
  ],
})
export class AppModule {}
```

### Per-module overrides with `forFeature`

`EmitterModule.forFeature({ logger })` overrides `EMITTER_LOGGER` for just
the importing module. Listeners declared inside that module log under the
local logger; listeners in other modules continue to use the
`forRoot`-level default.

`forFeature()` called without a `logger` is effectively a no-op for
logging — the listener inside that module **falls through to whatever
`forRoot` configured** (or the package default if no `forRoot` was
called).

```ts
// app.module.ts
@Module({
  imports: [EmitterModule.forRoot()],          // global default
})
export class AppModule {}

// users.module.ts
@Module({
  imports: [
    EmitterModule.forFeature({
      logger: new Logger('UsersModule'),       // local override
    }),
  ],
  providers: [UserCreatedListener],            // its @OnEmitterEvent
                                               // handlers log under
                                               // 'UsersModule'
})
export class UsersModule {}

// orders.module.ts
@Module({
  imports: [
    EmitterModule.forFeature({
      logger: new Logger('OrdersModule'),
    }),
  ],
  providers: [OrderPaidListener],
})
export class OrdersModule {}
```

Under the hood `forFeature({ logger })` provides a separate
`EMITTER_FEATURE_LOGGER` token (also exported), and the decorator injects
both `EMITTER_LOGGER` (required, global) and `EMITTER_FEATURE_LOGGER`
(optional, local) — preferring the feature one when present. This
sidesteps NestJS's "global module exports beat local imports" resolution
order; without the two-token split, the global `forRoot` logger would
silently win and the override would be dropped.

## API

### `EmitterService<T>`

```ts
class EmitterService<T> {
  emit<K extends string & keyof T>(eventType: K, eventValue: T[K]): boolean;
  emitAsync<K extends string & keyof T>(eventType: K, eventValue: T[K]): Promise<any[]>;
}
```

### `OnEmitterEvent<T>(eventType, options?)`

```ts
function OnEmitterEvent<T>(
  eventType: string & keyof T,
  options?: {
    async?: boolean;          // default: true
    promisify?: boolean;      // default: true
    suppressErrors?: boolean; // default: false (errors caught by wrapper)
    // plus everything @OnEvent accepts
  },
): MethodDecorator;
```

### `EmitterModule.forRoot(options?)`

```ts
EmitterModule.forRoot({
  // forwarded to EventEmitter2
  wildcard?: boolean;          // default: false
  delimiter?: string;          // default: '.'
  maxListeners?: number;       // default: 50
  verboseMemoryLeak?: boolean;
  ignoreErrors?: boolean;
  newListener?: boolean;
  removeListener?: boolean;

  // package-specific
  logger?: LoggerService;      // default: new Logger('EmitterModule')
});
```

### `EmitterModule.forFeature(options?)`

Feature-scoped logger override. Returns a non-global `DynamicModule`, so
the override only applies to providers inside the importing module.
When `logger` is omitted, the module does not rebind `EMITTER_LOGGER` —
listeners inside it fall through to whatever was configured by
`forRoot(...)`. EventEmitter2's `wildcard` / `delimiter` / `maxListeners`
are process-global and cannot be changed per-feature — configure those
via `forRoot`.

```ts
EmitterModule.forFeature({
  logger?: LoggerService;      // omit to inherit from forRoot
});
```

## License

MIT
