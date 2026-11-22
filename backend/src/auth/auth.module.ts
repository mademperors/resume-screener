import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKeysModule } from '../api-keys/api-keys.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { Company } from '../companies/company.entity.js';
import { authConfig, type AuthConfig } from '../config/auth.config.js';
import { sessionConfig } from '../config/session.config.js';
import { User } from '../users/user.entity.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { GoogleTokenVerifier } from './google-token.verifier.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import { Session } from './session.entity.js';

@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    ConfigModule.forFeature(sessionConfig),
    TypeOrmModule.forFeature([User, Company, Session]),
    JwtModule.registerAsync({
      imports: [ConfigModule.forFeature(authConfig)],
      inject: [authConfig.KEY],
      useFactory: (config: AuthConfig) => ({ secret: config.jwtSecret }),
    }),
    ApiKeysModule,
    CompaniesModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    GoogleTokenVerifier,
    // Order matters: rate limiting needs the principal set by AuthGuard.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AuthModule {}
