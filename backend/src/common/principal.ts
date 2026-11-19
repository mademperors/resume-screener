import type { Request } from 'express';

/** A recruiter signed in through Google SSO. */
export interface UserPrincipal {
  kind: 'user';
  userId: string;
  companyId: string;
  sessionId: string;
}

/** An external system calling the API with an API key. */
export interface ApiKeyPrincipal {
  kind: 'apiKey';
  apiKeyId: string;
  companyId: string;
  rateLimitPerMinute: number;
}

/** Every request runs in the context of exactly one company (tenant). */
export type Principal = UserPrincipal | ApiKeyPrincipal;

export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}
