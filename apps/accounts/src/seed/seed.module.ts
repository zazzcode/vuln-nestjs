import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { SeedService } from './seed.service.js';

@Module({
  imports: [UsersModule, SessionsModule, DocumentsModule],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
