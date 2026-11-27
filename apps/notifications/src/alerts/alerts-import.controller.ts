import { Body, Controller, Post } from '@nestjs/common';
import { UserId } from '@zazzles/exchange-internal-auth';
import { IsString, MaxLength } from 'class-validator';
import { AlertsImportService } from './alerts-import.service.js';

/** The body of an import: the content itself, as JSON text. Nothing is fetched. */
export class ImportBody {
  @IsString()
  @MaxLength(100_000)
  json: string;
}

/** Creates the caller's alerts from the content the caller brought. */
@Controller('internal/alerts')
export class AlertsImportController {
  constructor(private readonly imports: AlertsImportService) {}

  @Post('import')
  import(@UserId() caller: string, @Body() body: ImportBody) {
    return this.imports.fromContent(caller, body.json);
  }
}
