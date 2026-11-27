import { Module } from '@nestjs/common';
import { InternalModule } from '../internal/internal.module.js';
import { LabController } from './lab.controller.js';
import { LabService } from './lab.service.js';

@Module({
  imports: [InternalModule],
  providers: [LabService],
  controllers: [LabController],
})
export class LabModule {}
