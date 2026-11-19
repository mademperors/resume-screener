import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Repository } from 'typeorm';
import { sha256Hex } from '../common/crypto.js';
import type { Company } from '../companies/company.entity.js';
import type { User } from '../users/user.entity.js';
import { AuthService } from './auth.service.js';
import type {
  GoogleIdentity,
  GoogleTokenVerifier,
} from './google-token.verifier.js';
import type { Session } from './session.entity.js';

const config = {
  get: (key: string) =>
    ({
      ACCESS_TOKEN_TTL_MINUTES: 15,
      SESSION_IDLE_TIMEOUT_MINUTES: 30,
      SESSION_MAX_AGE_HOURS: 168,
    })[key],
} as unknown as ConfigService;

const identity: GoogleIdentity = {
  subject: 'google-sub-1',
  email: 'recruiter@gmail.com',
  name: 'Recruiter',
  avatarUrl: null,
  hostedDomain: null,
};

function memoryRepo<T extends { id: string }>(prefix: string) {
  const rows: T[] = [];
  const matches = (row: T, where: Partial<T>) =>
    Object.entries(where).every(
      ([key, value]) => row[key as keyof T] === value,
    );
  return {
    rows,
    create: (data: Partial<T>) => ({ ...data }) as T,
    save: async (row: T) => {
      if (!row.id) {
        row.id = `${prefix}-${rows.length + 1}`;
        rows.push(row);
      }
      return row;
    },
    findOneBy: async (where: Partial<T>) =>
      rows.find((row) => matches(row, where)) ?? null,
    update: async (id: string, patch: Partial<T>) => {
      Object.assign(rows.find((row) => row.id === id) ?? {}, patch);
    },
  };
}

function createService() {
  const users = memoryRepo<User>('user');
  const companies = memoryRepo<Company>('company');
  const sessions = memoryRepo<Session>('session');
  const sessionsRepo = {
    ...sessions,
    findOne: async ({ where }: { where: { refreshTokenHash: string } }) => {
      const session = sessions.rows.find(
        (row) => row.refreshTokenHash === where.refreshTokenHash,
      );
      return session
        ? Object.assign({}, session, {
            user: users.rows.find((u) => u.id === session.userId),
          })
        : null;
    },
    save: async (row: Session) => {
      const existing = sessions.rows.find((s) => s.id === row.id);
      if (existing) {
        Object.assign(existing, { refreshTokenHash: row.refreshTokenHash });
        return existing;
      }
      return sessions.save(row);
    },
  };
  const google = { verify: vi.fn(async () => identity) };
  const jwt = new JwtService({ secret: 'test-secret-test-secret-test-secret' });
  const service = new AuthService(
    users as unknown as Repository<User>,
    companies as unknown as Repository<Company>,
    sessionsRepo as unknown as Repository<Session>,
    google as unknown as GoogleTokenVerifier,
    jwt,
    config,
  );
  return { service, users, companies, sessions };
}

describe('AuthService', () => {
  afterEach(() => vi.useRealTimers());

  it('creates a user, a personal company and a session on first Google sign-in', async () => {
    const { service, users, companies, sessions } = createService();

    const tokens = await service.signInWithGoogle('id-token');

    expect(users.rows).toHaveLength(1);
    expect(companies.rows).toHaveLength(1);
    expect(users.rows[0].companyId).toBe(companies.rows[0].id);
    expect(sessions.rows[0].refreshTokenHash).toBe(
      sha256Hex(tokens.refreshToken),
    );
    expect(tokens.expiresIn).toBe(900);

    const payload = await service.verifyAccessToken(tokens.accessToken);
    expect(payload).toEqual({
      sub: 'user-1',
      cid: 'company-1',
      sid: 'session-1',
    });
  });

  it('reuses the existing user on later sign-ins', async () => {
    const { service, users, companies } = createService();
    await service.signInWithGoogle('id-token');
    await service.signInWithGoogle('id-token');

    expect(users.rows).toHaveLength(1);
    expect(companies.rows).toHaveLength(1);
  });

  it('rotates the refresh token so the old one stops working', async () => {
    const { service } = createService();
    const first = await service.signInWithGoogle('id-token');

    const second = await service.refresh(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('expires the session after 30 minutes without activity, even if refreshed', async () => {
    vi.useFakeTimers();
    const { service, sessions } = createService();
    let tokens = await service.signInWithGoogle('id-token');

    vi.advanceTimersByTime(20 * 60_000);
    tokens = await service.refresh(tokens.refreshToken);
    vi.advanceTimersByTime(11 * 60_000);

    await expect(service.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(await service.touchSession(sessions.rows[0].id)).toBe(false);
  });

  it('keeps an active session alive', async () => {
    vi.useFakeTimers();
    const { service, sessions } = createService();
    const tokens = await service.signInWithGoogle('id-token');

    vi.advanceTimersByTime(25 * 60_000);
    expect(await service.touchSession(sessions.rows[0].id)).toBe(true);
    vi.advanceTimersByTime(25 * 60_000);

    await expect(service.refresh(tokens.refreshToken)).resolves.toBeDefined();
  });

  it('signs out by revoking the session', async () => {
    const { service, sessions } = createService();
    const tokens = await service.signInWithGoogle('id-token');

    await service.signOut(sessions.rows[0].id);

    expect(await service.touchSession(sessions.rows[0].id)).toBe(false);
    await expect(service.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a tampered access token', async () => {
    const { service } = createService();
    const { accessToken } = await service.signInWithGoogle('id-token');

    await expect(
      service.verifyAccessToken(accessToken + 'x'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
