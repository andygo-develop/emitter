import 'reflect-metadata';

import { Injectable, LoggerService } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { EMITTER_LOGGER, EmitterModule, EmitterService, OnEmitterEvent } from '../src';

import { TestEvents } from './test-events';

function createMockLogger(): jest.Mocked<LoggerService> {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    fatal: jest.fn(),
    setLogLevels: jest.fn(),
  } as unknown as jest.Mocked<LoggerService>;
}

@Injectable()
class HappyListener {
  public received: TestEvents['user.created'] | null = null;

  @OnEmitterEvent<TestEvents>('user.created')
  async onCreated(payload: TestEvents['user.created']) {
    this.received = payload;
  }
}

@Injectable()
class RejectingListener {
  @OnEmitterEvent<TestEvents>('user.created')
  async onCreated(_payload: TestEvents['user.created']) {
    throw new Error('boom-async');
  }
}

@Injectable()
class ThrowingSyncListener {
  @OnEmitterEvent<TestEvents>('user.created', { promisify: false })
  onCreated(_payload: TestEvents['user.created']) {
    throw new Error('boom-sync');
  }
}

@Injectable()
class MultiDecoratorListener {
  public createdCount = 0;

  public deletedCount = 0;

  @OnEmitterEvent<TestEvents>('user.created')
  async onCreated(_payload: TestEvents['user.created']) {
    this.createdCount += 1;
  }

  @OnEmitterEvent<TestEvents>('user.deleted')
  async onDeleted(_payload: TestEvents['user.deleted']) {
    this.deletedCount += 1;
  }
}

async function buildModule(
  ListenerClass: any,
  logger: LoggerService,
): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [EmitterModule.forRoot({ logger })],
    providers: [ListenerClass],
  }).compile();

  await moduleRef.init();

  return moduleRef;
}

describe('@OnEmitterEvent', () => {
  let logger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    logger = createMockLogger();
  });

  it('delivers payloads to a happy-path async listener', async () => {
    const moduleRef = await buildModule(HappyListener, logger);
    const emitter = moduleRef.get(EmitterService) as EmitterService<TestEvents>;
    const listener = moduleRef.get(HappyListener);
    const payload = { id: 1, email: 'a@b.c' };

    await emitter.emitAsync('user.created', payload);

    expect(listener.received).toEqual(payload);
    expect(logger.error).not.toHaveBeenCalled();

    await moduleRef.close();
  });

  it('catches a rejected promise from an async listener and routes it to the logger', async () => {
    const moduleRef = await buildModule(RejectingListener, logger);
    const emitter = moduleRef.get(EmitterService) as EmitterService<TestEvents>;

    // emitAsync resolves; the rejection is swallowed by the wrapper.
    await expect(emitter.emitAsync('user.created', { id: 1, email: 'x@y.z' })).resolves.toBeDefined();

    expect(logger.error).toHaveBeenCalledTimes(1);
    const errArg = logger.error.mock.calls[0][0];

    expect(errArg).toBeInstanceOf(Error);
    expect((errArg as Error).message).toBe('boom-async');

    await moduleRef.close();
  });

  it('catches a sync throw from a promisify:false listener and routes it to the logger', async () => {
    const moduleRef = await buildModule(ThrowingSyncListener, logger);
    const emitter = moduleRef.get(EmitterService) as EmitterService<TestEvents>;

    // Synchronous emit also doesn't blow up.
    expect(() => emitter.emit('user.created', { id: 1, email: 'a@b.c' })).not.toThrow();

    // EventEmitter2 schedules async:true listeners via setImmediate, so
    // give the runloop one tick before asserting.
    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.error).toHaveBeenCalledTimes(1);
    const errArg = logger.error.mock.calls[0][0];

    expect(errArg).toBeInstanceOf(Error);
    expect((errArg as Error).message).toBe('boom-sync');

    await moduleRef.close();
  });

  it('only applies the error-catching wrapper once per class, but routes each event correctly', async () => {
    const moduleRef = await buildModule(MultiDecoratorListener, logger);
    const emitter = moduleRef.get(EmitterService) as EmitterService<TestEvents>;
    const listener = moduleRef.get(MultiDecoratorListener);

    await emitter.emitAsync('user.created', { id: 1, email: 'a@b.c' });
    await emitter.emitAsync('user.deleted', { id: 1 });
    await emitter.emitAsync('user.created', { id: 2, email: 'c@d.e' });

    expect(listener.createdCount).toBe(2);
    expect(listener.deletedCount).toBe(1);
    expect(logger.error).not.toHaveBeenCalled();

    await moduleRef.close();
  });

  it('uses Nest\'s built-in Logger by default when no logger is configured', async () => {
    // Spy on Logger.prototype.error to confirm the default fallback path
    const { Logger } = await import('@nestjs/common');
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const moduleRef = await Test.createTestingModule({
      imports: [EmitterModule.forRoot()],          // no `logger` option
      providers: [RejectingListener],
    }).compile();

    await moduleRef.init();

    const emitter = moduleRef.get(EmitterService) as EmitterService<TestEvents>;

    await emitter.emitAsync('user.created', { id: 1, email: 'x@y.z' });

    expect(errorSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
    await moduleRef.close();
  });

  it('exposes the EMITTER_LOGGER token so consumers can inject the same instance', async () => {
    const moduleRef = await buildModule(HappyListener, logger);

    const resolved = moduleRef.get(EMITTER_LOGGER);

    expect(resolved).toBe(logger);

    await moduleRef.close();
  });
});
