import { Args, Field, InputType, Mutation, Resolver } from '@nestjs/graphql';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  validateSync,
} from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BadRequestException } from '@nestjs/common';
import {
  CurrentUser,
  type TokenPayload,
} from '@zazzles/exchange-internal-auth';
import { PreferenceName, User } from '../users/user.model.js';
import { PREFERENCE_KEYS } from '../users/users.repository.js';
import { UsersService, toUser } from '../users/users.service.js';

/** What a caller may change on their own profile. Typed fields only, a linear pattern and a length cap. */
@InputType()
export class UpdateProfileInput {
  @IsOptional()
  @Matches(/^[a-zA-Z0-9_ ]{1,80}$/, {
    message: 'A display name is 1 to 80 letters, digits, underscores or spaces',
  })
  @Field({ nullable: true })
  displayName?: string;

  @IsOptional()
  @IsEmail()
  @Field({ nullable: true })
  email?: string;
}

/** What a caller may change in their preferences, field by field. */
@InputType()
export class UpdatePreferencesInput {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Field({ nullable: true })
  theme?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  @Field({ nullable: true })
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  @Field({ nullable: true })
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  @Field({ nullable: true })
  marketingEmails?: string;
}

/** A null-prototype map the preference walk reads: no inherited property is a key. */
function preferenceMap(
  preferences: Record<string, unknown>,
): Record<string, unknown> {
  return Object.assign(Object.create(null), preferences);
}

@Resolver()
export class ProfileResolver {
  constructor(private readonly users: UsersService) {}

  /** Changes the caller's own profile fields, and nothing else: the input names every field it may set. */
  @Mutation(() => User)
  async updateProfile(
    @CurrentUser() caller: TokenPayload,
    @Args('input') input: UpdateProfileInput,
  ): Promise<User> {
    const changes: Record<string, string> = {};
    if (input.displayName !== undefined) {
      changes.displayName = input.displayName;
    }
    if (input.email !== undefined) {
      changes.email = input.email;
    }
    await this.users.update(caller.sub, changes);
    return this.refreshed(caller.sub);
  }

  /** Changes the caller's own preferences through a typed input. */
  @Mutation(() => User)
  async updatePreferences(
    @CurrentUser() caller: TokenPayload,
    @Args('input') input: UpdatePreferencesInput,
  ): Promise<User> {
    const account = await this.users.documentById(caller.sub);
    if (account === null) {
      throw new BadRequestException('No such account');
    }
    const preferences = preferenceMap(account.preferences);
    for (const key of PREFERENCE_KEYS) {
      const value = input[key];
      if (value !== undefined) {
        preferences[key] = value;
      }
    }
    await this.users.update(caller.sub, { preferences });
    return this.refreshed(caller.sub);
  }

  /** Sets one preference, named by the enum: there is no other key it could write. */
  @Mutation(() => User)
  async setPreference(
    @CurrentUser() caller: TokenPayload,
    @Args('name', { type: () => PreferenceName }) name: PreferenceName,
    @Args('value') value: string,
  ): Promise<User> {
    return this.setOwnPreference(caller.sub, name, value);
  }

  /**
   * Sets one preference by a dotted path, the safe way: every segment is
   * checked against the allowlist, only own properties are followed, and the
   * walk happens over a map with no prototype.
   */
  @Mutation(() => User)
  async setPreferencePath(
    @CurrentUser() caller: TokenPayload,
    @Args('path') path: string,
    @Args('value') value: string,
  ): Promise<User> {
    const segments = path.split('.');
    if (segments.length > 2) {
      throw new BadRequestException(
        'A preference path has at most two segments',
      );
    }
    const account = await this.users.documentById(caller.sub);
    if (account === null) {
      throw new BadRequestException('No such account');
    }
    const preferences = preferenceMap(account.preferences);
    let current: Record<string, unknown> = preferences;
    for (const [index, segment] of segments.entries()) {
      if (!(PREFERENCE_KEYS as readonly string[]).includes(segment)) {
        throw new BadRequestException(`${segment} is not a preference name`);
      }
      if (index === segments.length - 1) {
        current[segment] = value;
      } else if (
        Object.hasOwn(current, segment) &&
        typeof current[segment] === 'object' &&
        current[segment] !== null
      ) {
        current = current[segment] as Record<string, unknown>;
      } else {
        throw new BadRequestException(
          `${segment} holds no object to walk into`,
        );
      }
    }
    await this.users.update(caller.sub, { preferences });
    return this.refreshed(caller.sub);
  }

  /**
   * Imports preferences given as JSON text: parsed, then validated against the
   * typed input, which refuses every property the input does not declare.
   */
  @Mutation(() => User)
  async importSettings(
    @CurrentUser() caller: TokenPayload,
    @Args('settings') settings: string,
  ): Promise<User> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(settings);
    } catch {
      throw new BadRequestException('The settings are not valid JSON');
    }
    const input = plainToInstance(UpdatePreferencesInput, parsed);
    if (
      validateSync(input, { whitelist: true, forbidNonWhitelisted: true })
        .length > 0
    ) {
      throw new BadRequestException(
        'The settings hold a property or a value the preferences do not accept',
      );
    }
    return this.updatePreferences(caller, input);
  }

  /** Stores the avatar URL. Nothing is fetched: the URL is data, and a later viewer decides what to do with it. */
  @Mutation(() => User)
  async setAvatarUrl(
    @CurrentUser() caller: TokenPayload,
    @Args('url') url: string,
  ): Promise<User> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('An avatar URL is http or https');
    }
    await this.users.update(caller.sub, { avatarUrl: url });
    return this.refreshed(caller.sub);
  }

  private async refreshed(userId: string): Promise<User> {
    const account = await this.users.documentById(userId);
    if (account === null) {
      throw new BadRequestException('No such account');
    }
    return toUser(account);
  }

  private async setOwnPreference(
    userId: string,
    name: PreferenceName,
    value: string,
  ): Promise<User> {
    const key: Record<PreferenceName, string> = {
      THEME: 'theme',
      LANGUAGE: 'language',
      CURRENCY: 'currency',
      MARKETING_EMAILS: 'marketingEmails',
    };
    const account = await this.users.documentById(userId);
    if (account === null) {
      throw new BadRequestException('No such account');
    }
    const preferences = preferenceMap(account.preferences);
    preferences[key[name]] = value;
    await this.users.update(userId, { preferences });
    return this.refreshed(userId);
  }
}
