/**
 * Runnable demo — wires the modules into a NestJS app and walks through
 * the full lifecycle (register → order → pay → ship → delete user)
 * so you can see exactly which listeners fire, which logger context
 * each one uses, and how the `@OnEmitterEvent` wrapper catches the
 * intentional SMS failure without crashing anything else.
 *
 * Run with: `npm run example:complex` (from the package root).
 */
import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { EmitterService } from '../src';

import { AppEvents, OrderCreatedEvent } from './events';
import { AppModule } from './app.module';
import { OrdersService } from './orders/orders.service';
import { UsersService } from './users/users.service';

async function bootstrap() {
  const log = new Logger('demo');

  const app = await NestFactory.createApplicationContext(AppModule, {
    // Keep Nest's bootstrap noise out of the demo output.
    logger: ['log', 'warn', 'error'],
  });

  const users = app.get(UsersService);
  const orders = app.get(OrdersService);
  const emitter = app.get<EmitterService<AppEvents>>(EmitterService);

  log.log('--- step 1: register user ---');
  const alice = await users.register('alice@example.com');

  log.log('--- step 2: create + pay + ship an order (even orderId triggers SMS failure) ---');
  const order = await orders.create(alice.id, 42);
  await orders.pay(order.id);
  await orders.ship(order.id, 'TRACK-ABC-123');

  log.log('--- step 3: create + pay + ship a second order (odd orderId — SMS succeeds) ---');
  const second = await orders.create(alice.id, 17);
  await orders.pay(second.id);
  await orders.ship(second.id, 'TRACK-XYZ-456');

  log.log('--- step 4: delete user (OrdersListener cancels remaining orders) ---');
  await users.delete(alice.id);

  log.log('--- step 5: emit a raw event via EmitterService directly ---');
  const rawOrder: OrderCreatedEvent = { orderId: 9999, userId: 1, total: 1 };
  await emitter.emitAsync('order.created', rawOrder);

  await app.close();
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('demo failed:', err);
  process.exit(1);
});
