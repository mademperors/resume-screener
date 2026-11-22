import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ApiKeysModule } from '../api-keys/api-keys.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { authConfig, type AuthConfig } from '../config/auth.config.js';
import { sessionConfig } from '../config/session.config.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { GoogleTokenVerifier } from './google-token.verifier.js';
import { IdentityVerifier } from './identity-verifier.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { RateLimiter, RedisRateLimiter } from './rate-limiter.js';
import { SessionsModule } from './sessions.module.js';

@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    ConfigModule.forFeature(sessionConfig),
    JwtModule.registerAsync({
      imports: [ConfigModule.forFeature(authConfig)],
      inject: [authConfig.KEY],
      useFactory: (config: AuthConfig) => ({ secret: config.jwtSecret }),
    }),
    ApiKeysModule,
    CompaniesModule,
    SessionsModule,
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: IdentityVerifier, useClass: GoogleTokenVerifier },
    { provide: RateLimiter, useClass: RedisRateLimiter },
    // Order matters: rate limiting needs the principal set by AuthGuard.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AuthModule {}
