import { Module } from '@nestjs/common';
import { InternalAuthController, MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';

@Module({
  controllers: [MembersController, InternalAuthController],
  providers: [MembersService],
})
export class MembersModule {}