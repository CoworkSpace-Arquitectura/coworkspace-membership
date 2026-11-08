import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatePlanDto } from './dto/create-plan.dto.js';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePlanDto) {
    const exists = await this.prisma.membershipPlan.findUnique({ where: { name: dto.name } });
    if (exists) {
      throw new ConflictException(`Ya existe un plan llamado ${dto.name}`);
    }
    return this.prisma.membershipPlan.create({
      data: { name: dto.name, price: dto.price, resourceAccess: dto.resourceAccess },
    });
  }

  findAll() {
    return this.prisma.membershipPlan.findMany({ orderBy: { price: 'asc' } });
  }

  async findOne(id: string) {
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id } });
    if (!plan) {
      throw new NotFoundException(`Plan ${id} no encontrado`);
    }
    return plan;
  }
}