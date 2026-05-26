import { Injectable, Logger } from '@nestjs/common';

import { OnEmitterEvent } from '../../src';

import { AppEvents, OrderShippedEvent } from '../events';

@Injectable()
export class SmsListener {
  private readonly log = new Logger('SmsListener');

  @OnEmitterEvent<AppEvents>('order.shipped')
  async sendSms(payload: OrderShippedEvent) {
    // Simulate the Twilio API being flaky to demonstrate that a
    // rejection in one listener does NOT crash the emitter loop —
    // the @OnEmitterEvent wrapper catches it and routes it to the
    // module-scoped logger (which here is 'NotificationsModule'
    // because we used `EmitterModule.forFeature({ logger })`).
    if (payload.orderId % 2 === 0) {
      throw new Error(`SMS gateway timeout for order #${payload.orderId}`);
    }
    this.log.log(`→ SMS sent for order #${payload.orderId}`);
  }
}
