import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type { EnvironmentVariables } from '../config/env.validation.js';

export interface GoogleIdentity {
  subject: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  /** Google Workspace domain (`hd` claim); null for personal accounts. */
  hostedDomain: string | null;
}

@Injectable()
export class GoogleTokenVerifier {
  private readonly client = new OAuth2Client();
  private readonly clientId: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.clientId = config.get('GOOGLE_CLIENT_ID', { infer: true });
  }

  /** Verifies a Google ID token issued to this app's OAuth client. */
  async verify(idToken: string): Promise<GoogleIdentity> {
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException(
        'Google sign-in failed. Please try again.',
      );
    }
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException(
        'Google sign-in failed. Please try again.',
      );
    }
    if (!payload.email_verified) {
      throw new UnauthorizedException(
        'Your Google account email is not verified.',
      );
    }
    return {
      subject: payload.sub,
      email: payload.email,
      name: payload.name ?? null,
      avatarUrl: payload.picture ?? null,
      hostedDomain: payload.hd ?? null,
    };
  }
}
