import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateMemberDto } from './dto/create-member.dto.js';

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMemberDto) {
    const exists = await this.prisma.member.findUnique({ where: { email: dto.email } });
    if (exists) {
      throw new ConflictException(`Ya existe un miembro con el correo ${dto.email}`);
    }
    return this.prisma.member.create({ data: { name: dto.name, email: dto.email } });
  }

  findAll(email?: string) {
    return this.prisma.member.findMany({
      where: { email },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      include: { subscriptions: { include: { plan: true } } },
    });
    if (!member) {
      throw new NotFoundException(`Miembro ${id} no encontrado`);
    }
    return member;
  }
}