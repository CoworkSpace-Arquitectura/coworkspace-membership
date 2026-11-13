import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { SubscriptionsService } from './subscriptions.service.js';

interface SubscriptionPaymentEvent {
  event: string;
  data: { subscriptionId: string; reason?: string };
}

/** Escucha a Billing para terminar la Saga del plan (activar o descartar la suscripción). */
@Injectable()
export class BillingEventsListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BillingEventsListener.name);
  private subscriber?: Redis;

  constructor(private readonly subscriptions: SubscriptionsService) {}

  onModuleInit() {
    if (!process.env.REDIS_URL) {
      this.logger.warn('REDIS_URL no está configurado: no se escucharán eventos');
      return;
    }
    this.subscriber = new Redis(process.env.REDIS_URL);
    this.subscriber.on('message', (channel: string, message: string) => {
      void this.handle(channel, message);
    });
    this.subscriber
      .subscribe('billing.subscription.paid', 'billing.subscription.failed')
      .then(() => this.logger.log('Escuchando billing.subscription.paid y billing.subscription.failed'))
      .catch((error: Error) => this.logger.error(`No se pudo suscribir: ${error.message}`));
  }

  private async handle(channel: string, message: string) {
    try {
      const { data } = JSON.parse(message) as SubscriptionPaymentEvent;
      if (!data?.subscriptionId) {
        return;
      }
      if (channel === 'billing.subscription.paid') {
        await this.subscriptions.activatePaid(data.subscriptionId);
      } else if (channel === 'billing.subscription.failed') {
        await this.subscriptions.discardUnpaid(data.subscriptionId, data.reason ?? 'Pago no completado');
      }
    } catch (error) {
      this.logger.error(`Error procesando ${channel}: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await this.subscriber?.quit();
  }
}
