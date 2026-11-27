import { Field, InputType } from '@nestjs/graphql';
import { IsString, MaxLength } from 'class-validator';

/** An announcement as it is sent: a title and a body, both plain text. */
@InputType()
export class AnnouncementInput {
  @IsString()
  @MaxLength(200)
  @Field()
  title: string;

  @IsString()
  @MaxLength(10_000)
  @Field()
  body: string;
}
