import { Module } from '@nestjs/common';
import { OpenapiModule } from '../openapi/openapi.module.js';
import { DocsController } from './docs.controller.js';

@Module({
  imports: [OpenapiModule],
  controllers: [DocsController],
})
export class ApiDocsModule {}
