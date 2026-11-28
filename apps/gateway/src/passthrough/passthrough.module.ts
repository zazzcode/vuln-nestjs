import { Module } from '@nestjs/common';
import { InternalModule } from '../internal/internal.module.js';
import { AdminUsersController } from './accounts/admin-users.controller.js';
import { AuthController } from './accounts/auth.controller.js';
import { DocumentsController } from './accounts/documents.controller.js';
import { ProfileController } from './accounts/profile.controller.js';
import { UsersController } from './accounts/users.controller.js';
import { AdminController } from './trading/admin.controller.js';
import { OrdersController } from './trading/orders.controller.js';
import { ReportsController } from './trading/reports.controller.js';
import { WalletsController } from './trading/wallets.controller.js';
import { AlertsController } from './notifications/alerts.controller.js';
import { AnnouncementsController } from './notifications/announcements.controller.js';
import { DeliveriesController } from './notifications/deliveries.controller.js';
import { WebhooksController } from './notifications/webhooks.controller.js';

/**
 * The REST pass-through: one controller per feature of each backend service,
 * each carrying a request to the service's `/internal/*` path as it arrived
 * and returning what the service answered. The gateway adds nothing to them.
 */
@Module({
  imports: [InternalModule],
  controllers: [
    // accounts
    AuthController,
    ProfileController,
    DocumentsController,
    UsersController,
    AdminUsersController,
    // trading
    AdminController,
    WalletsController,
    OrdersController,
    ReportsController,
    // notifications
    WebhooksController,
    AlertsController,
    AnnouncementsController,
    DeliveriesController,
  ],
})
export class PassthroughModule {}
