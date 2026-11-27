import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Public } from '@zazzles/exchange-internal-auth';
import type { Response } from 'express';
import { AnnouncementsService } from './announcements.service.js';

/**
 * One announcement as the raw HTML its body already is: the stored markup is
 * written into the page as it was stored, for the clients that render it.
 */
@Public()
@Controller('internal/announcements')
export class AnnouncementHtmlController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get(':id/html')
  async html(@Param('id') id: string, @Res() response: Response) {
    const announcement = await this.announcements.byId(Number(id));
    if (announcement === null) {
      throw new NotFoundException(`There is no announcement ${id}`);
    }
    response.render('announcement-html', {
      title: announcement.title,
      body: announcement.body, // XSS-001 / CWE-79: the stored body reaches the page unescaped, as text/html with no policy
    });
  }
}
