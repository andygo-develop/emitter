import { Logger, Module } from '@nestjs/common';

import { EmitterModule } from '../src';

import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // Root logger applies to every @OnEmitterEvent handler whose
    // module did NOT call `forFeature({ logger: ... })`.
    EmitterModule.forRoot({
      logger: new Logger('EmitterModule'),
      maxListeners: 100,
    }),
    UsersModule,
    OrdersModule,
    NotificationsModule,
  ],
})
export class AppModule {}
