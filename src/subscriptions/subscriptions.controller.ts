import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';
import { CreateSubscriptionDto } from './dto/create-subscription.dto.js';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post()
  create(@Body() dto: CreateSubscriptionDto) {
    return this.subscriptionsService.create(dto);
  }

  @Get()
  findAll(@Query('memberId') memberId?: string) {
    return this.subscriptionsService.findAll(memberId);
  }

  @Get('member/:memberId/active')
  findActiveByMember(@Param('memberId', ParseUUIDPipe) memberId: string) {
    return this.subscriptionsService.findActiveByMember(memberId);
  }

  @Patch(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.subscriptionsService.cancel(id);
  }

  @Post('process-renewals')
  processRenewals() {
    return this.subscriptionsService.processRenewals();
  }
}