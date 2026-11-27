import { Body, Controller, Post } from '@nestjs/common';
import { UserId } from '@zazzles/exchange-internal-auth';
import { IsString, MaxLength } from 'class-validator';
import { AlertsImportService } from './alerts-import.service.js';

/** The body of an import from a URL: the address to read the content from, behind the outbound guard. */
export class ImportUrlBody {
  @IsString()
  @MaxLength(2000)
  url: string;
}

/** Creates the caller's alerts from what the guarded fetch of the URL brought back. */
@Controller('internal/alerts')
export class AlertsImportUrlController {
  constructor(private readonly imports: AlertsImportService) {}

  @Post('import-url')
  importUrl(@UserId() caller: string, @Body() body: ImportUrlBody) {
    return this.imports.fromUrl(caller, body.url);
  }
}
