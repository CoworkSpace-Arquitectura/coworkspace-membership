import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { EventsService } from '../events/events.service.js';

const plan = { id: 'plan-1', name: 'Puesto flexible', price: 350000, resourceAccess: ['DESK', 'ROOM'] };

function buildSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    memberId: 'member-1',
    planId: 'plan-1',
    status: 'ACTIVE',
    autoRenew: true,
    startedAt: new Date('2026-11-08T00:00:00Z'),
    renewsAt: new Date('2026-12-08T00:00:00Z'),
    plan,
    ...overrides,
  };
}

describe('SubscriptionsService', () => {
  const prisma = {
    member: { findUnique: vi.fn() },
    membershipPlan: { findUnique: vi.fn() },
    subscription: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  const events = { publish: vi.fn() };
  let service: SubscriptionsService;

  const dto = { memberId: 'member-1', planId: 'plan-1' };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SubscriptionsService(
      prisma as unknown as PrismaService,
      events as unknown as EventsService,
    );
  });

  it('crea la suscripción y publica membership.activated', async () => {
    prisma.member.findUnique.mockResolvedValue({ id: 'member-1' });
    prisma.membershipPlan.findUnique.mockResolvedValue(plan);
    prisma.subscription.findFirst.mockResolvedValue(null);
    prisma.subscription.create.mockResolvedValue(buildSubscription());

    await service.create(dto);

    expect(events.publish).toHaveBeenCalledWith(
      'membership.activated',
      expect.objectContaining({ memberId: 'member-1', planName: 'Puesto flexible', renewal: false }),
    );
  });

  it('rechaza con 409 si el miembro ya tiene una suscripción activa', async () => {
    prisma.member.findUnique.mockResolvedValue({ id: 'member-1' });
    prisma.membershipPlan.findUnique.mockResolvedValue(plan);
    prisma.subscription.findFirst.mockResolvedValue(buildSubscription());

    await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.subscription.create).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('rechaza con 404 si el miembro no existe', async () => {
    prisma.member.findUnique.mockResolvedValue(null);

    await expect(service.create(dto)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancela la suscripción y publica membership.expired', async () => {
    prisma.subscription.findUnique.mockResolvedValue(buildSubscription());
    prisma.subscription.update.mockResolvedValue(
      buildSubscription({ status: 'CANCELLED', autoRenew: false }),
    );

    await service.cancel('sub-1');

    expect(events.publish).toHaveBeenCalledWith(
      'membership.expired',
      expect.objectContaining({ subscriptionId: 'sub-1', reason: 'CANCELLED' }),
    );
  });

  it('renueva las que tienen renovación automática y vence las demás', async () => {
    prisma.subscription.findMany.mockResolvedValue([
      buildSubscription({ id: 'sub-renueva', autoRenew: true }),
      buildSubscription({ id: 'sub-vence', autoRenew: false }),
    ]);
    prisma.subscription.update.mockImplementation(
      ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve(buildSubscription({ id: where.id, ...data })),
    );

    const result = await service.processRenewals();

    expect(result).toEqual({ processed: 2, renewed: 1, expired: 1 });
    expect(events.publish).toHaveBeenCalledWith(
      'membership.activated',
      expect.objectContaining({ subscriptionId: 'sub-renueva', renewal: true }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      'membership.expired',
      expect.objectContaining({ subscriptionId: 'sub-vence', reason: 'NOT_RENEWED' }),
    );
  });
});