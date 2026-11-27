import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Public } from '@zazzles/exchange-internal-auth';
import type { Response } from 'express';
import { AnnouncementsService } from './announcements.service.js';

/**
 * One announcement as JSON, open to anyone, with `x-content-type-options:
 * nosniff` so a browser never reads it as anything else.
 */
@Public()
@Controller('internal/announcements')
export class AnnouncementByIdController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get(':id')
  async byId(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const announcement = await this.announcements.byId(Number(id));
    if (announcement === null) {
      throw new NotFoundException(`There is no announcement ${id}`);
    }
    response.setHeader('x-content-type-options', 'nosniff');
    return announcement;
  }
}
