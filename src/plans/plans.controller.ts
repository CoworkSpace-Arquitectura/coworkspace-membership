import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { PlansService } from './plans.service.js';
import { CreatePlanDto } from './dto/create-plan.dto.js';

@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.plansService.create(dto);
  }

  @Get()
  findAll() {
    return this.plansService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.plansService.findOne(id);
  }
}