import { Module } from '@nestjs/common';

import { OrdersListener } from './orders.listener';
import { OrdersService } from './orders.service';

@Module({
  providers: [OrdersService, OrdersListener],
  exports: [OrdersService],
})
export class OrdersModule {}
