import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionStatus } from '@prisma/client';
import type { MembershipPlan, Subscription } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventsService } from '../events/events.service.js';
import { CreateSubscriptionDto } from './dto/create-subscription.dto.js';

type SubscriptionWithPlan = Subscription & { plan: MembershipPlan };

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async create(dto: CreateSubscriptionDto) {
    const member = await this.prisma.member.findUnique({ where: { id: dto.memberId } });
    if (!member) {
      throw new NotFoundException(`Miembro ${dto.memberId} no encontrado`);
    }
    const plan = await this.prisma.membershipPlan.findUnique({ where: { id: dto.planId } });
    if (!plan) {
      throw new NotFoundException(`Plan ${dto.planId} no encontrado`);
    }
    const active = await this.prisma.subscription.findFirst({
      where: { memberId: dto.memberId, status: SubscriptionStatus.ACTIVE },
    });
    if (active) {
      throw new ConflictException('El miembro ya tiene una suscripción activa');
    }

    const subscription = await this.prisma.subscription.create({
      data: {
        memberId: dto.memberId,
        planId: dto.planId,
        autoRenew: dto.autoRenew ?? true,
        renewsAt: addMonths(new Date(), 1),
      },
      include: { plan: true },
    });
    await this.publishActivated(subscription, false);
    return subscription;
  }

  findAll(memberId?: string) {
    return this.prisma.subscription.findMany({
      where: { memberId },
      include: { plan: true },
      orderBy: { startedAt: 'desc' },
    });
  }

  async findActiveByMember(memberId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { memberId, status: SubscriptionStatus.ACTIVE },
      include: { plan: true },
    });
    if (!subscription) {
      throw new NotFoundException(`El miembro ${memberId} no tiene una suscripción activa`);
    }
    return subscription;
  }

  async cancel(id: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { id } });
    if (!subscription) {
      throw new NotFoundException(`Suscripción ${id} no encontrada`);
    }
    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      throw new ConflictException('La suscripción no está activa');
    }
    const cancelled = await this.prisma.subscription.update({
      where: { id },
      data: { status: SubscriptionStatus.CANCELLED, autoRenew: false },
    });
    await this.publishExpired(cancelled, 'CANCELLED');
    return cancelled;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async processRenewals() {
    const due = await this.prisma.subscription.findMany({
      where: { status: SubscriptionStatus.ACTIVE, renewsAt: { lte: new Date() } },
      include: { plan: true },
    });

    let renewed = 0;
    let expired = 0;
    for (const subscription of due) {
      if (subscription.autoRenew) {
        const updated = await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: { renewsAt: addMonths(subscription.renewsAt, 1) },
          include: { plan: true },
        });
        await this.publishActivated(updated, true);
        renewed++;
      } else {
        const updated = await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: SubscriptionStatus.EXPIRED },
        });
        await this.publishExpired(updated, 'NOT_RENEWED');
        expired++;
      }
    }

    this.logger.log(`Renovaciones procesadas: ${due.length} (renovadas ${renewed}, vencidas ${expired})`);
    return { processed: due.length, renewed, expired };
  }

  private publishActivated(subscription: SubscriptionWithPlan, renewal: boolean) {
    return this.events.publish('membership.activated', {
      subscriptionId: subscription.id,
      memberId: subscription.memberId,
      planId: subscription.planId,
      planName: subscription.plan.name,
      price: subscription.plan.price,
      resourceAccess: subscription.plan.resourceAccess,
      renewsAt: subscription.renewsAt.toISOString(),
      renewal,
    });
  }

  private publishExpired(subscription: Subscription, reason: 'CANCELLED' | 'NOT_RENEWED') {
    return this.events.publish('membership.expired', {
      subscriptionId: subscription.id,
      memberId: subscription.memberId,
      planId: subscription.planId,
      reason,
    });
  }
}