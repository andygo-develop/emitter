import { Injectable } from '@nestjs/common';

import { OnEmitterEvent } from '../../src';

import { AppEvents, UserDeletedEvent } from '../events';
import { OrdersService } from './orders.service';

/**
 * Demonstrates a cross-module listener: a user is deleted in
 * UsersModule, OrdersModule reacts by cancelling that user's orders.
 *
 * No `forFeature(...)` here — OrdersModule uses the root logger from
 * `forRoot`, so any thrown error in this listener would be reported
 * under `[EmitterModule]` in the console.
 */
@Injectable()
export class OrdersListener {
  constructor(private readonly orders: OrdersService) {}

  @OnEmitterEvent<AppEvents>('user.deleted')
  async onUserDeleted(payload: UserDeletedEvent) {
    this.orders.cancelByUser(payload.userId);
  }
}
