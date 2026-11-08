import { Module } from '@nestjs/common';
import { MembersService } from './members.service.js';
import { MembersController } from './members.controller.js';

@Module({
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}
