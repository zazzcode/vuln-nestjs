import { Field, InputType } from '@nestjs/graphql';
import { IsBoolean, IsOptional } from 'class-validator';

/** The channels to write, each optional: only the fields given are written. */
@InputType()
export class ChannelsInput {
  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { nullable: true })
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { nullable: true })
  sms?: boolean;

  @IsOptional()
  @IsBoolean()
  @Field(() => Boolean, { nullable: true })
  webhook?: boolean;
}
