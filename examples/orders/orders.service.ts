import { Injectable, Logger } from '@nestjs/common';

import { EmitterService } from '../../src';

import {
  AppEvents, OrderCreatedEvent, OrderPaidEvent, OrderShippedEvent,
} from '../events';

interface Order {
  id: number;
  userId: number;
  total: number;
  status: 'created' | 'paid' | 'shipped' | 'cancelled';
}

@Injectable()
export class OrdersService {
  private readonly log = new Logger('OrdersService');

  private readonly orders = new Map<number, Order>();

  private nextId = 1000;

  constructor(private readonly emitterService: EmitterService<AppEvents>) {}

  async create(userId: number, total: number) {
    const order: Order = {
      id: this.nextId++, userId, total, status: 'created',
    };
    this.orders.set(order.id, order);
    this.log.log(`created order #${order.id} for user #${userId} ($${total})`);

    const payload: OrderCreatedEvent = {
      orderId: order.id, userId, total,
    };
    await this.emitterService.emitAsync('order.created', payload);

    return order;
  }

  async pay(orderId: number) {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'created') return;

    order.status = 'paid';
    this.log.log(`order #${orderId} paid`);

    const payload: OrderPaidEvent = {
      orderId, amount: order.total,
    };
    await this.emitterService.emitAsync('order.paid', payload);
  }

  async ship(orderId: number, trackingNumber: string) {
    const order = this.orders.get(orderId);
    if (!order || order.status !== 'paid') return;

    order.status = 'shipped';
    this.log.log(`order #${orderId} shipped — tracking ${trackingNumber}`);

    const payload: OrderShippedEvent = { orderId, trackingNumber };
    await this.emitterService.emitAsync('order.shipped', payload);
  }

  cancelByUser(userId: number) {
    let count = 0;
    for (const order of this.orders.values()) {
      if (order.userId === userId && order.status !== 'cancelled') {
        order.status = 'cancelled';
        count += 1;
      }
    }
    if (count > 0) {
      this.log.log(`cancelled ${count} order(s) for deleted user #${userId}`);
    }
  }
}
