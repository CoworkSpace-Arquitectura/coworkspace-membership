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
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
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

  it('un plan con precio queda pendiente de pago y pide el cobro a Billing', async () => {
    prisma.member.findUnique.mockResolvedValue({ id: 'member-1' });
    prisma.membershipPlan.findUnique.mockResolvedValue(plan);
    prisma.subscription.findFirst.mockResolvedValue(null);
    prisma.subscription.updateMany.mockResolvedValue({ count: 0 });
    prisma.subscription.create.mockResolvedValue(buildSubscription({ status: 'PENDING_PAYMENT' }));

    await service.create(dto);

    expect(prisma.subscription.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_PAYMENT' }) }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      'membership.payment.requested',
      expect.objectContaining({ subscriptionId: 'sub-1', price: 350000, currency: 'COP' }),
    );
    expect(events.publish).not.toHaveBeenCalledWith('membership.activated', expect.anything());
  });

  it('un plan gratuito se activa de inmediato', async () => {
    const freePlan = { ...plan, price: 0 };
    prisma.member.findUnique.mockResolvedValue({ id: 'member-1' });
    prisma.membershipPlan.findUnique.mockResolvedValue(freePlan);
    prisma.subscription.findFirst.mockResolvedValue(null);
    prisma.subscription.updateMany.mockResolvedValue({ count: 0 });
    prisma.subscription.create.mockResolvedValue(buildSubscription({ plan: freePlan }));

    await service.create(dto);

    expect(events.publish).toHaveBeenCalledWith(
      'membership.activated',
      expect.objectContaining({ memberId: 'member-1', renewal: false }),
    );
  });

  it('activa la suscripción cuando Billing confirma el pago', async () => {
    prisma.subscription.updateMany.mockResolvedValue({ count: 1 });
    prisma.subscription.findUniqueOrThrow.mockResolvedValue(buildSubscription());

    const activated = await service.activatePaid('sub-1');

    expect(activated).toBe(true);
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'sub-1', status: 'PENDING_PAYMENT' } }),
    );
    expect(events.publish).toHaveBeenCalledWith(
      'membership.activated',
      expect.objectContaining({ subscriptionId: 'sub-1', planName: 'Puesto flexible' }),
    );
  });

  it('no activa dos veces si el evento de pago llega repetido', async () => {
    prisma.subscription.updateMany.mockResolvedValue({ count: 0 });

    const activated = await service.activatePaid('sub-1');

    expect(activated).toBe(false);
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('descarta la suscripción si el pago falla (compensación)', async () => {
    prisma.subscription.updateMany.mockResolvedValue({ count: 1 });

    await service.discardUnpaid('sub-1', 'Pago cancelado por el usuario');

    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub-1', status: 'PENDING_PAYMENT' },
      data: { status: 'CANCELLED', autoRenew: false },
    });
    expect(events.publish).not.toHaveBeenCalled();
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