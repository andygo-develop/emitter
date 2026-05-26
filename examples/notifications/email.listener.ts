import { Injectable, Logger } from '@nestjs/common';

import { OnEmitterEvent } from '../../src';

import {
  AppEvents, OrderPaidEvent, OrderShippedEvent, UserRegisteredEvent,
} from '../events';

@Injectable()
export class EmailListener {
  private readonly log = new Logger('EmailListener');

  @OnEmitterEvent<AppEvents>('user.registered')
  async sendWelcome(payload: UserRegisteredEvent) {
    // Pretend this hits SendGrid…
    await new Promise((r) => setTimeout(r, 20));
    this.log.log(`→ welcome email to ${payload.email}`);
  }

  @OnEmitterEvent<AppEvents>('order.paid')
  async sendReceipt(payload: OrderPaidEvent) {
    await new Promise((r) => setTimeout(r, 20));
    this.log.log(`→ receipt for order #${payload.orderId} ($${payload.amount})`);
  }

  @OnEmitterEvent<AppEvents>('order.shipped')
  async sendShippingNotice(payload: OrderShippedEvent) {
    await new Promise((r) => setTimeout(r, 20));
    this.log.log(`→ shipping notice for order #${payload.orderId} (${payload.trackingNumber})`);
  }
}
