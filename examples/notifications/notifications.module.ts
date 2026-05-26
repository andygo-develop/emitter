import { Logger, Module } from '@nestjs/common';

import { EmitterModule } from '../../src';

import { AnalyticsListener } from './analytics.listener';
import { EmailListener } from './email.listener';
import { SmsListener } from './sms.listener';

/**
 * Demonstrates `EmitterModule.forFeature({ logger })` — error logging
 * for any `@OnEmitterEvent` handler inside this module is routed to a
 * `NotificationsModule`-scoped Logger instead of the global one set up
 * by `forRoot` in `AppModule`.
 */
@Module({
  imports: [
    EmitterModule.forFeature({
      logger: new Logger('NotificationsModule'),
    }),
  ],
  providers: [EmailListener, SmsListener, AnalyticsListener],
})
export class NotificationsModule {}
