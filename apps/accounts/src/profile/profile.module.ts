import { Module } from '@nestjs/common';
import { ProfileResolver } from './profile.resolver.js';
import { ProfileController } from './profile.controller.js';
import { AvatarClient } from './avatar.client.js';
import { UsersModule } from '../users/users.module.js';

/** The caller's own profile and preferences, written through typed inputs and allowlists. */
@Module({
  imports: [UsersModule],
  providers: [ProfileResolver, AvatarClient],
  controllers: [ProfileController],
})
export class ProfileModule {}
