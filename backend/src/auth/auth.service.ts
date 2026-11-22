import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomToken, sha256Hex } from '../common/crypto.js';
import { CompanyPlansService } from '../companies/company-plans.service.js';
import { Company } from '../companies/company.entity.js';
import { sessionConfig, type SessionConfig } from '../config/session.config.js';
import { User } from '../users/user.entity.js';
import type { AuthTokensDto, MeDto } from './dto/auth.dto.js';
import {
  GoogleTokenVerifier,
  type GoogleIdentity,
} from './google-token.verifier.js';
import { Session } from './session.entity.js';

export interface AccessTokenPayload {
  sub: string;
  cid: string;
  sid: string;
}

const SESSION_EXPIRED_MESSAGE =
  'Your session has expired. Please sign in again.';
// Avoid a DB write on every request; activity is tracked to the minute.
const ACTIVITY_RESOLUTION_MS = 60_000;

@Injectable()
export class AuthService {
  private readonly accessTokenTtlSeconds: number;
  private readonly idleTimeoutMs: number;
  private readonly maxAgeMs: number;

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    private readonly google: GoogleTokenVerifier,
    private readonly jwt: JwtService,
    @Inject(sessionConfig.KEY) config: SessionConfig,
    private readonly plans: CompanyPlansService,
  ) {
    this.accessTokenTtlSeconds = config.accessTokenTtlSeconds;
    this.idleTimeoutMs = config.idleTimeoutMs;
    this.maxAgeMs = config.maxAgeMs;
  }

  async signInWithGoogle(idToken: string): Promise<AuthTokensDto> {
    const identity = await this.google.verify(idToken);
    const user = await this.findOrCreateUser(identity);

    const now = new Date();
    const refreshToken = randomToken(48);
    const session = await this.sessions.save(
      this.sessions.create({
        userId: user.id,
        refreshTokenHash: sha256Hex(refreshToken),
        lastActivityAt: now,
        expiresAt: new Date(now.getTime() + this.maxAgeMs),
        revokedAt: null,
      }),
    );
    return this.issueTokens(user, session, refreshToken);
  }

  /**
   * Rotates the refresh token. Refreshing does not count as activity, so a
   * frontend that refreshes in the background still gets signed out when idle.
   */
  async refresh(refreshToken: string): Promise<AuthTokensDto> {
    const session = await this.sessions.findOne({
      where: { refreshTokenHash: sha256Hex(refreshToken) },
      relations: { user: true },
    });
    if (!session || !this.isActive(session, new Date())) {
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }
    const nextRefreshToken = randomToken(48);
    session.refreshTokenHash = sha256Hex(nextRefreshToken);
    await this.sessions.save(session);
    return this.issueTokens(session.user, session, nextRefreshToken);
  }

  async signOut(sessionId: string): Promise<void> {
    await this.sessions.update(sessionId, { revokedAt: new Date() });
  }

  /** Checks the session behind an access token and records activity on it. */
  async touchSession(sessionId: string): Promise<boolean> {
    const session = await this.sessions.findOneBy({ id: sessionId });
    const now = new Date();
    if (!session || !this.isActive(session, now)) {
      return false;
    }
    if (
      now.getTime() - session.lastActivityAt.getTime() >
      ACTIVITY_RESOLUTION_MS
    ) {
      await this.sessions.update(session.id, { lastActivityAt: now });
    }
    return true;
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const payload =
        await this.jwt.verifyAsync<Partial<AccessTokenPayload>>(token);
      if (
        typeof payload.sub === 'string' &&
        typeof payload.cid === 'string' &&
        typeof payload.sid === 'string'
      ) {
        return { sub: payload.sub, cid: payload.cid, sid: payload.sid };
      }
    } catch {
      // Fall through: expired, malformed or wrongly signed.
    }
    throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
  }

  async getProfile(userId: string): Promise<MeDto> {
    const user = await this.users.findOne({
      where: { id: userId },
      relations: { company: true },
    });
    if (!user) {
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      company: {
        id: user.company.id,
        name: user.company.name,
        ...this.plans.describe(user.company),
      },
    };
  }

  private isActive(session: Session, now: Date): boolean {
    return (
      !session.revokedAt &&
      session.expiresAt.getTime() > now.getTime() &&
      now.getTime() - session.lastActivityAt.getTime() <= this.idleTimeoutMs
    );
  }

  private async issueTokens(
    user: User,
    session: Session,
    refreshToken: string,
  ): Promise<AuthTokensDto> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      cid: user.companyId,
      sid: session.id,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.accessTokenTtlSeconds,
    });
    return {
      tokenType: 'Bearer',
      accessToken,
      expiresIn: this.accessTokenTtlSeconds,
      refreshToken,
    };
  }

  private async findOrCreateUser(identity: GoogleIdentity): Promise<User> {
    const existing = await this.users.findOneBy({
      googleSubject: identity.subject,
    });
    if (existing) {
      existing.email = identity.email;
      existing.name = identity.name;
      existing.avatarUrl = identity.avatarUrl;
      existing.lastLoginAt = new Date();
      return this.users.save(existing);
    }
    const company = await this.resolveCompany(identity);
    return this.users.save(
      this.users.create({
        googleSubject: identity.subject,
        email: identity.email,
        name: identity.name,
        avatarUrl: identity.avatarUrl,
        companyId: company.id,
        lastLoginAt: new Date(),
      }),
    );
  }

  /**
   * Google Workspace users share a company per domain. Personal Google
   * accounts each get their own company.
   */
  private async resolveCompany(identity: GoogleIdentity): Promise<Company> {
    const domain = identity.hostedDomain?.toLowerCase();
    if (!domain) {
      return this.companies.save(
        this.companies.create({ name: identity.email, googleDomain: null }),
      );
    }
    // Upsert so two first-time sign-ins from one domain don't race.
    await this.companies
      .createQueryBuilder()
      .insert()
      .values({ name: domain, googleDomain: domain })
      .orIgnore()
      .execute();
    return this.companies.findOneByOrFail({ googleDomain: domain });
  }
}
