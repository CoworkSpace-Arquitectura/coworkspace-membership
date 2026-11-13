import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { MembersService } from './members.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('MembersService', () => {
  const prisma = { member: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() } };
  let service: MembersService;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OWNER_EMAIL = 'jefe@example.com';
    service = new MembersService(prisma as unknown as PrismaService);
  });

  it('guarda la contraseña cifrada, nunca en texto plano', async () => {
    prisma.member.findUnique.mockResolvedValue(null);
    prisma.member.create.mockResolvedValue({ id: 'm-1' });

    await service.create({ name: 'Ana', email: 'ana@example.com', password: 'secreta123' });

    const args = prisma.member.create.mock.calls[0][0] as { data: { passwordHash: string; role: Role } };
    expect(args.data.passwordHash).not.toBe('secreta123');
    expect(await bcrypt.compare('secreta123', args.data.passwordHash)).toBe(true);
    expect(args.data.role).toBe(Role.MEMBER);
  });

  it('registra como jefe a quien usa el correo de OWNER_EMAIL', async () => {
    prisma.member.findUnique.mockResolvedValue(null);
    prisma.member.create.mockResolvedValue({ id: 'm-1' });

    await service.create({ name: 'Jefe', email: 'Jefe@Example.com', password: 'secreta123' });

    const args = prisma.member.create.mock.calls[0][0] as { data: { role: Role } };
    expect(args.data.role).toBe(Role.OWNER);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const passwordHash = await bcrypt.hash('correcta123', 4);
    prisma.member.findUnique.mockResolvedValue({ id: 'm-1', name: 'Ana', email: 'ana@example.com', role: Role.MEMBER, passwordHash });

    await expect(service.verifyCredentials('ana@example.com', 'otra-clave')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('acepta la contraseña correcta y devuelve el rol, sin el hash', async () => {
    const passwordHash = await bcrypt.hash('correcta123', 4);
    prisma.member.findUnique.mockResolvedValue({ id: 'm-1', name: 'Ana', email: 'ana@example.com', role: Role.MANAGER, passwordHash });

    const member = await service.verifyCredentials('ana@example.com', 'correcta123');

    expect(member).toEqual({ id: 'm-1', name: 'Ana', email: 'ana@example.com', role: Role.MANAGER });
  });

  it('solo el jefe puede cambiar roles', async () => {
    await expect(service.updateRole('m-1', 'MANAGER', 'm-2', Role.MANAGER)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.member.update).not.toHaveBeenCalled();
  });
});