import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { UsersRepository } from './users.repository.js';
import { UsersResolver } from './users.resolver.js';
import { UsersService } from './users.service.js';

@Module({
  providers: [UsersRepository, UsersService, UsersResolver],
  controllers: [UsersController],
  exports: [UsersRepository],
})
export class UsersModule {}
