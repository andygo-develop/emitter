import { Injectable, Logger } from '@nestjs/common';

import { OnEmitterEvent } from '../../src';

import {
  AppEvents, OrderCreatedEvent, OrderPaidEvent, UserRegisteredEvent,
} from '../events';

/**
 * Fire-and-forget listener using `promisify: false` — the handler is
 * synchronous, so the wrapper uses try/catch instead of `.catch(...)`.
 */
@Injectable()
export class AnalyticsListener {
  private readonly log = new Logger('AnalyticsListener');

  @OnEmitterEvent<AppEvents>('user.registered', { promisify: false })
  trackRegistration(payload: UserRegisteredEvent) {
    this.log.log(`metrics.userRegistered userId=${payload.userId}`);
  }

  @OnEmitterEvent<AppEvents>('order.created', { promisify: false })
  trackOrder(payload: OrderCreatedEvent) {
    this.log.log(`metrics.orderCreated orderId=${payload.orderId} total=${payload.total}`);
  }

  @OnEmitterEvent<AppEvents>('order.paid', { promisify: false })
  trackPayment(payload: OrderPaidEvent) {
    this.log.log(`metrics.orderPaid orderId=${payload.orderId} amount=${payload.amount}`);
  }
}
