import { ArrayNotEmpty, IsArray, IsEnum, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import { ResourceType } from '@prisma/client';

export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @Min(0)
  price!: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ResourceType, { each: true })
  resourceAccess!: ResourceType[];
}