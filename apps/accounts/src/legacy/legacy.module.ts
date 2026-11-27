import { Module } from '@nestjs/common';
import { LegacyTokenGuard } from './legacy-token.guard.js';
import { WhoAmIResolver } from './whoami.resolver.js';
import { LegacyAuthResolver } from './legacy-auth.resolvers.js';
import { LegacySessionsController } from './legacy-sessions.controller.js';
import { UsersLookupResolver } from './users-lookup.resolver.js';
import { UsersPreferencesResolver } from './users-preferences.resolver.js';
import { UsersFilterController } from './users-filter.controller.js';
import { PreferencesBulkResolver } from './preferences-bulk.resolver.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthFeatureModule } from '../auth/auth.module.js';

/** The legacy token path: the aliases and endpoints the old clients still call. */
@Module({
  imports: [SessionsModule, UsersModule, AuthFeatureModule],
  providers: [
    LegacyTokenGuard,
    WhoAmIResolver,
    LegacyAuthResolver,
    UsersLookupResolver,
    UsersPreferencesResolver,
    PreferencesBulkResolver,
  ],
  controllers: [LegacySessionsController, UsersFilterController],
})
export class LegacyModule {}
