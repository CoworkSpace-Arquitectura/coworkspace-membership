import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { BillingEventsListener } from './billing-events.listener.js';

@Module({
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, BillingEventsListener],
})
export class SubscriptionsModule {}
