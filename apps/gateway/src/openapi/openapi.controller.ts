import { Controller, Get } from '@nestjs/common';
import { Roles, ServiceToken } from '@zazzles/exchange-internal-auth';
import { OpenapiService } from './openapi.service.js';

/** The OpenAPI document, for the two callers the contract names. */
@Controller('api/v1')
export class OpenapiController {
  constructor(private readonly openapi: OpenapiService) {}

  /** For an administrator, after the guard has checked the role. */
  @Roles('ADMIN')
  @Get('admin/openapi.json')
  admin() {
    return this.openapi.read();
  }

  /** For the system itself: the service token, and nothing else. */
  @ServiceToken()
  @Get('openapi.json')
  service() {
    return this.openapi.read();
  }
}
