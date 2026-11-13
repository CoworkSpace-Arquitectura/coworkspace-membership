import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { MembersService } from './members.service.js';
import { CreateMemberDto, UpdateRoleDto, VerifyCredentialsDto } from './dto/create-member.dto.js';

@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Post()
  create(@Body() dto: CreateMemberDto) {
    return this.membersService.create(dto);
  }

  @Get()
  findAll(@Query('email') email?: string) {
    return this.membersService.findAll(email);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.membersService.findOne(id);
  }

  @Patch(':id/role')
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @Headers('x-member-id') actorId?: string,
    @Headers('x-member-role') actorRole?: string,
  ) {
    return this.membersService.updateRole(actorId, actorRole, id, dto.role);
  }
}

// Solo lo usa el API Gateway: el Gateway no tiene una ruta pública hacia /internal
@Controller('internal/auth')
export class InternalAuthController {
  constructor(private readonly membersService: MembersService) {}

  @Post('verify')
  @HttpCode(200)
  verify(@Body() dto: VerifyCredentialsDto) {
    return this.membersService.verifyCredentials(dto.email, dto.password);
  }
}