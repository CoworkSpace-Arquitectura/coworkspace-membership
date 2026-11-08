import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class CreateSubscriptionDto {
  @IsUUID()
  memberId!: string;

  @IsUUID()
  planId!: string;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;
}