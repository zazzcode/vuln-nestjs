import { Field, ID, Int, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { DateTimeScalar } from '@zazzles/exchange-graphql';
import {
  CurrentUser,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { toStored, type StoredDocument } from './documents.service.js';
import { DocumentsService } from './documents.service.js';

/** A document as the graph shows it: metadata only. */
@ObjectType()
export class DocumentType {
  @Field(() => ID)
  id!: string;

  @Field()
  originalName!: string;

  @Field()
  mimeType!: string;

  @Field(() => Int)
  size!: number;

  @Field(() => DateTimeScalar)
  createdAt!: Date;
}

@Resolver()
export class DocumentsResolver {
  constructor(private readonly documents: DocumentsService) {}

  /** The caller's own documents. */
  @Query(() => [DocumentType], { name: 'documents' })
  async ofCaller(
    @CurrentUser() caller: TokenPayload,
  ): Promise<StoredDocument[]> {
    return (await this.documents.ofUser(caller.sub)).map(toStored);
  }
}
