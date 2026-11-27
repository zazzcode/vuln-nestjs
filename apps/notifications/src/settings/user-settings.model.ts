import { Field, ID, ObjectType, registerEnumType } from '@nestjs/graphql';

/** The channels a user can be reached through. */
export enum ChannelName {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  WEBHOOK = 'WEBHOOK',
}

registerEnumType(ChannelName, { name: 'ChannelName' });

/** The notification settings of one user. */
@ObjectType()
export class UserSettings {
  @Field(() => ID)
  userId: string;

  @Field(() => String, { nullable: true })
  webhookUrl: string | null;

  @Field()
  email: boolean;

  @Field()
  sms: boolean;

  @Field()
  webhook: boolean;
}
