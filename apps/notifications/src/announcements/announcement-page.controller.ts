import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Public } from '@zazzles/exchange-internal-auth';
import type { Response } from 'express';
import { AnnouncementsService } from './announcements.service.js';

/** A content security policy that allows no script of any kind. */
const CSP =
  "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'none'";

/**
 * One announcement as an HTML page, rendered from the fixed template with
 * the body escaped, and a content security policy that allows no script.
 */
@Public()
@Controller('internal/announcements')
export class AnnouncementPageController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get(':id/page')
  async page(@Param('id') id: string, @Res() response: Response) {
    const announcement = await this.announcements.byId(Number(id));
    if (announcement === null) {
      throw new NotFoundException(`There is no announcement ${id}`);
    }
    response.setHeader('content-security-policy', CSP);
    response.render('announcement-page', {
      title: announcement.title,
      body: announcement.body,
    });
  }
}
