import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OrderManagementService } from './order-management.service';
import { WsService } from './ws.service';
import { PlaceOrderService } from './place-order.service';
import { GlobalStateService } from './global-state.service';

@Module({
  imports: [HttpModule],
  providers: [
    OrderManagementService,
    WsService,
    PlaceOrderService,
    GlobalStateService,
  ],
})
export class ListenerModule {}
