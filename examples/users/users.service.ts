import { Injectable, Logger } from '@nestjs/common';

import { EmitterService } from '../../src';

import { AppEvents, UserDeletedEvent, UserRegisteredEvent } from '../events';

@Injectable()
export class UsersService {
  private readonly log = new Logger('UsersService');

  private readonly users = new Map<number, { id: number; email: string }>();

  private nextId = 1;

  constructor(private readonly events: EmitterService<AppEvents>) {}

  async register(email: string) {
    const user = { id: this.nextId++, email };
    this.users.set(user.id, user);
    this.log.log(`registered user #${user.id} (${email})`);

    // `emitAsync` returns a Promise that resolves after every listener
    // finishes — useful when downstream side effects must complete
    // before the caller continues.
    const payload: UserRegisteredEvent = {
      userId: user.id,
      email: user.email,
    };
    await this.events.emitAsync('user.registered', payload);

    return user;
  }

  async delete(id: number) {
    if (!this.users.delete(id)) return;
    this.log.log(`deleted user #${id}`);

    // Cancellation downstream (orders) is handled by an `@OnEmitterEvent`
    // listener inside OrdersModule — emit and forget.
    const payload: UserDeletedEvent = { userId: id };
    await this.events.emitAsync('user.deleted', payload);
  }
}
