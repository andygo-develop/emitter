# Complex example — e-commerce event flow

A runnable NestJS application that exercises every feature of
`@andygo.dev/emitter` in one place.

Run it from the package root:

```bash
npm run example:complex
```

## What's exercised

| Feature | Where |
|---|---|
| Type-safe `EmitterService<AppEvents>` | [`users/users.service.ts`](users/users.service.ts), [`orders/orders.service.ts`](orders/orders.service.ts) |
| `EmitterModule.forRoot({ logger, maxListeners })` | [`app.module.ts`](app.module.ts) |
| `EmitterModule.forFeature({ logger })` — per-module override | [`notifications/notifications.module.ts`](notifications/notifications.module.ts) |
| `@OnEmitterEvent` — async (default) | [`notifications/email.listener.ts`](notifications/email.listener.ts) |
| `@OnEmitterEvent({ promisify: false })` — sync | [`notifications/analytics.listener.ts`](notifications/analytics.listener.ts) |
| Cross-module listener | [`orders/orders.listener.ts`](orders/orders.listener.ts) (listens to `user.deleted` from UsersModule) |
| Error catching — async rejection | [`notifications/sms.listener.ts`](notifications/sms.listener.ts) throws for even order ids |
| Multiple listeners on one event | `order.shipped` → SMS + email |

## Demo flow

`main.ts` runs five steps and logs progress:

1. **Register a user** → fires `user.registered` → email + analytics listeners pick it up.
2. **Create / pay / ship an order with an even id** → fires `order.created`, `order.paid`, `order.shipped`. SMS listener throws on the even order id; the wrapper catches and logs under `[NotificationsModule]`. Email + analytics + shipping notice still run.
3. **Create / pay / ship a second order with an odd id** → same flow, this time SMS succeeds.
4. **Delete the user** → fires `user.deleted` → `OrdersListener` (in OrdersModule, no override → root logger) cancels the user's outstanding orders.
5. **Emit a raw event** via `EmitterService` directly — to show emission isn't tied to a service method.

## Reading the output

Look at the `[ContextName]` tags on each log line:

- `[EmitterModule]` — root logger, set by `forRoot` in `AppModule`. The cancellation listener in OrdersModule logs through here.
- `[NotificationsModule]` — local logger, set by `forFeature` in NotificationsModule. The SMS gateway timeout shows up here, not under root.
- `[UsersService]`, `[OrdersService]`, `[EmailListener]`, etc. — each component's own Logger, unrelated to `@OnEmitterEvent`.

The point: the SMS failure is contained — every other listener for `order.shipped` still runs to completion, and the error is reported under the right module's logger context.
