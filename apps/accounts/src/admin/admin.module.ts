import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { UsersModule } from '../users/users.module.js';

/** The administration routes of the service: user administration and the directory page. */
@Module({
  imports: [UsersModule],
  controllers: [AdminController],
})
export class AdminModule {}
