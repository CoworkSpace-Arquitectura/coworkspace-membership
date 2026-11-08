import { PartialType } from '@nestjs/mapped-types';
import { CreateSubscriptionDto } from './create-subscription.dto.js';

export class UpdateSubscriptionDto extends PartialType(CreateSubscriptionDto) {}
