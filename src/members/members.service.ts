import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateMemberDto } from './dto/create-member.dto.js';

// Lo único que se devuelve de un miembro: nunca el hash de la contraseña
export const PUBLIC_MEMBER = { id: true, name: true, email: true, role: true, createdAt: true } as const;

const SALT_ROUNDS = 10;

@Injectable()
export class MembersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMemberDto) {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.member.findUnique({ where: { email } });
    if (exists) {
      throw new ConflictException(`Ya existe un miembro con el correo ${email}`);
    }

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, SALT_ROUNDS) : null;
    const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
    const role = ownerEmail && email === ownerEmail ? Role.OWNER : Role.MEMBER;

    return this.prisma.member.create({
      data: { name: dto.name, email, passwordHash, role },
      select: PUBLIC_MEMBER,
    });
  }

  // La contraseña nunca sale de Membership: solo se responde si es correcta o no
  async verifyCredentials(email: string, password: string) {
    const member = await this.prisma.member.findUnique({ where: { email: email.trim().toLowerCase() } });
    const valid = member?.passwordHash ? await bcrypt.compare(password, member.passwordHash) : false;
    if (!member || !valid) {
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }
    return { id: member.id, name: member.name, email: member.email, role: member.role };
  }

  findAll(email?: string) {
    return this.prisma.member.findMany({
      where: { email: email?.trim().toLowerCase() },
      select: PUBLIC_MEMBER,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const member = await this.prisma.member.findUnique({
      where: { id },
      select: { ...PUBLIC_MEMBER, subscriptions: { include: { plan: true } } },
    });
    if (!member) {
      throw new NotFoundException(`Miembro ${id} no encontrado`);
    }
    return member;
  }

  async updateRole(actorId: string | undefined, actorRole: string | undefined, id: string, role: Role) {
    if (actorRole !== Role.OWNER) {
      throw new ForbiddenException('Solo el jefe puede cambiar roles');
    }
    if (actorId === id) {
      throw new BadRequestException('No puedes cambiar tu propio rol');
    }
    await this.findOne(id);
    return this.prisma.member.update({ where: { id }, data: { role }, select: PUBLIC_MEMBER });
  }
}