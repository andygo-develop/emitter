/**
 * Per-event payload interfaces. Each event type gets its own named
 * interface so producers / consumers reference it by name rather than
 * by inline object literal — the AppEvents map below stays as the
 * single source-of-truth keying for `EmitterService<AppEvents>` and
 * `@OnEmitterEvent<AppEvents>(...)`.
 */

export interface UserRegisteredEvent {
  userId: number;
  email: string;
}

export interface UserDeletedEvent {
  userId: number;
}

export interface OrderCreatedEvent {
  orderId: number;
  userId: number;
  total: number;
}

export interface OrderPaidEvent {
  orderId: number;
  amount: number;
}

export interface OrderShippedEvent {
  orderId: number;
  trackingNumber: string;
}

/**
 * Single source of truth for every event flowing through the demo app.
 * Try renaming a field in any payload interface above and watch every
 * emit + listener line up red.
 */
export interface AppEvents {
  'user.registered': UserRegisteredEvent;
  'user.deleted': UserDeletedEvent;
  'order.created': OrderCreatedEvent;
  'order.paid': OrderPaidEvent;
  'order.shipped': OrderShippedEvent;
}
