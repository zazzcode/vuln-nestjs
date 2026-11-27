import { Module } from '@nestjs/common';
import { DocumentsRepository } from './documents.repository.js';
import { DocumentsService } from './documents.service.js';
import { DocumentsController } from './documents.controller.js';
import { DocumentsResolver } from './documents.resolver.js';
import { UploadsStore } from './uploads.store.js';

/** Uploaded documents: stored under generated names, served with the content type the record names. */
@Module({
  providers: [
    DocumentsRepository,
    DocumentsService,
    UploadsStore,
    DocumentsResolver,
  ],
  controllers: [DocumentsController],
  exports: [DocumentsRepository, DocumentsService, UploadsStore],
})
export class DocumentsModule {}
