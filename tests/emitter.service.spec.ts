import 'reflect-metadata';

import { Test, TestingModule } from '@nestjs/testing';
import { OnEvent } from '@nestjs/event-emitter';
import { Injectable } from '@nestjs/common';

import { EmitterModule, EmitterService } from '../src';

import { TestEvents } from './test-events';

@Injectable()
class CapturingListener {
  public lastUserCreated: TestEvents['user.created'] | null = null;

  public lastOrderPaid: TestEvents['order.paid'] | null = null;

  public asyncCallCount = 0;

  @OnEvent('user.created')
  onUserCreated(payload: TestEvents['user.created']) {
    this.lastUserCreated = payload;
  }

  @OnEvent('order.paid', { async: true, promisify: true })
  async onOrderPaid(payload: TestEvents['order.paid']) {
    this.asyncCallCount += 1;
    this.lastOrderPaid = payload;
  }
}

describe('EmitterService', () => {
  let moduleRef: TestingModule;
  let emitter: EmitterService<TestEvents>;
  let listener: CapturingListener;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [EmitterModule.forRoot()],
      providers: [CapturingListener],
    }).compile();

    await moduleRef.init();

    emitter = moduleRef.get(EmitterService);
    listener = moduleRef.get(CapturingListener);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  describe('emit', () => {
    it('delivers the payload to a synchronous listener', () => {
      const payload = { id: 1, email: 'a@b.c' };

      const hadListeners = emitter.emit('user.created', payload);

      expect(hadListeners).toBe(true);
      expect(listener.lastUserCreated).toEqual(payload);
    });

    it('returns false when no listener is registered for the event', () => {
      // 'user.deleted' has no listener in this test setup
      const hadListeners = emitter.emit('user.deleted', { id: 99 });

      expect(hadListeners).toBe(false);
    });
  });

  describe('emitAsync', () => {
    it('returns a promise that resolves after async listeners finish', async () => {
      const payload = { orderId: 7, amount: 42 };

      const result = emitter.emitAsync('order.paid', payload);

      expect(result).toBeInstanceOf(Promise);
      await result;

      expect(listener.asyncCallCount).toBe(1);
      expect(listener.lastOrderPaid).toEqual(payload);
    });

    it('also fires non-async listeners', async () => {
      const payload = { id: 2, email: 'c@d.e' };

      await emitter.emitAsync('user.created', payload);

      expect(listener.lastUserCreated).toEqual(payload);
    });
  });
});
