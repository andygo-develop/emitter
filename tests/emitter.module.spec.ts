import 'reflect-metadata';

import { Injectable, Logger, LoggerService, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  EMITTER_LOGGER, EmitterModule, EmitterService, OnEmitterEvent,
} from '../src';

import { TestEvents } from './test-events';

function createMockLogger(label: string): jest.Mocked<LoggerService> & { label: string } {
  const m = {
    label,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    fatal: jest.fn(),
    setLogLevels: jest.fn(),
  } as unknown as jest.Mocked<LoggerService> & { label: string };

  return m;
}

describe('EmitterModule', () => {
  describe('default static module shape', () => {
    let moduleRef: TestingModule;

    beforeEach(async () => {
      moduleRef = await Test.createTestingModule({
        imports: [EmitterModule],
      }).compile();
      await moduleRef.init();
    });

    afterEach(() => moduleRef.close());

    it('provides EmitterService', () => {
      expect(moduleRef.get(EmitterService)).toBeInstanceOf(EmitterService);
    });

    it('provides EMITTER_LOGGER with a default NestJS Logger', () => {
      const logger = moduleRef.get(EMITTER_LOGGER);

      expect(logger).toBeInstanceOf(Logger);
    });
  });

  describe('forRoot', () => {
    it('uses a custom logger when one is supplied', async () => {
      const customLogger = createMockLogger('root-custom');

      const moduleRef = await Test.createTestingModule({
        imports: [EmitterModule.forRoot({ logger: customLogger })],
      }).compile();

      await moduleRef.init();

      expect(moduleRef.get(EMITTER_LOGGER)).toBe(customLogger);

      await moduleRef.close();
    });

    it('falls back to the default Logger when no logger is supplied', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [EmitterModule.forRoot()],
      }).compile();

      await moduleRef.init();

      expect(moduleRef.get(EMITTER_LOGGER)).toBeInstanceOf(Logger);
      await moduleRef.close();
    });

    it('still provides a working EmitterService that delivers events', async () => {
      @Injectable()
      class Listener {
        public seen: TestEvents['user.created'] | null = null;

        @OnEmitterEvent<TestEvents>('user.created')
        async onCreated(payload: TestEvents['user.created']) {
          this.seen = payload;
        }
      }

      const moduleRef = await Test.createTestingModule({
        imports: [EmitterModule.forRoot({ maxListeners: 200 })],
        providers: [Listener],
      }).compile();

      await moduleRef.init();

      const emitter = moduleRef.get(EmitterService) as EmitterService<TestEvents>;
      const listener = moduleRef.get(Listener);

      await emitter.emitAsync('user.created', { id: 1, email: 'a@b.c' });

      expect(listener.seen).toEqual({ id: 1, email: 'a@b.c' });

      await moduleRef.close();
    });
  });

  describe('forFeature', () => {
    it('overrides EMITTER_LOGGER inside the importing module', async () => {
      const rootLogger = createMockLogger('root');
      const featureLogger = createMockLogger('feature');

      @Injectable()
      class FeatureListener {
        @OnEmitterEvent<TestEvents>('user.created')
        async onCreated(_payload: TestEvents['user.created']) {
          throw new Error('feature-boom');
        }
      }

      @Module({
        imports: [EmitterModule.forFeature({ logger: featureLogger })],
        providers: [FeatureListener],
      })
      class FeatureModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [EmitterModule.forRoot({ logger: rootLogger }), FeatureModule],
      }).compile();

      await moduleRef.init();

      const emitter = moduleRef.get(EmitterService) as EmitterService<TestEvents>;

      await emitter.emitAsync('user.created', { id: 1, email: 'x@y.z' });

      expect(featureLogger.error).toHaveBeenCalledTimes(1);
      expect(rootLogger.error).not.toHaveBeenCalled();

      await moduleRef.close();
    });

    it('falls through to the root logger when no override is provided', async () => {
      const rootLogger = createMockLogger('root');

      @Injectable()
      class FeatureListener {
        @OnEmitterEvent<TestEvents>('user.created')
        async onCreated(_payload: TestEvents['user.created']) {
          throw new Error('fall-through-boom');
        }
      }

      @Module({
        imports: [EmitterModule.forFeature()],     // no logger ⇒ inherit
        providers: [FeatureListener],
      })
      class FeatureModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [EmitterModule.forRoot({ logger: rootLogger }), FeatureModule],
      }).compile();

      await moduleRef.init();

      const emitter = moduleRef.get(EmitterService) as EmitterService<TestEvents>;

      await emitter.emitAsync('user.created', { id: 1, email: 'x@y.z' });

      expect(rootLogger.error).toHaveBeenCalledTimes(1);
      const errArg = rootLogger.error.mock.calls[0][0];

      expect((errArg as Error).message).toBe('fall-through-boom');

      await moduleRef.close();
    });

    it('only applies the override locally — listeners outside the feature module keep using root logger', async () => {
      const rootLogger = createMockLogger('root');
      const featureLogger = createMockLogger('feature');

      @Injectable()
      class RootListener {
        @OnEmitterEvent<TestEvents>('user.deleted')
        async onDeleted(_payload: TestEvents['user.deleted']) {
          throw new Error('root-boom');
        }
      }

      @Injectable()
      class FeatureListener {
        @OnEmitterEvent<TestEvents>('user.created')
        async onCreated(_payload: TestEvents['user.created']) {
          throw new Error('feature-boom');
        }
      }

      @Module({
        imports: [EmitterModule.forFeature({ logger: featureLogger })],
        providers: [FeatureListener],
      })
      class FeatureModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [EmitterModule.forRoot({ logger: rootLogger }), FeatureModule],
        providers: [RootListener],
      }).compile();

      await moduleRef.init();

      const emitter = moduleRef.get(EmitterService) as EmitterService<TestEvents>;

      await emitter.emitAsync('user.created', { id: 1, email: 'x@y.z' }); // → feature
      await emitter.emitAsync('user.deleted', { id: 1 });                  // → root

      expect(featureLogger.error).toHaveBeenCalledTimes(1);
      expect(featureLogger.error.mock.calls[0][0]).toBeInstanceOf(Error);
      expect((featureLogger.error.mock.calls[0][0] as Error).message).toBe('feature-boom');

      expect(rootLogger.error).toHaveBeenCalledTimes(1);
      expect((rootLogger.error.mock.calls[0][0] as Error).message).toBe('root-boom');

      await moduleRef.close();
    });
  });
});
