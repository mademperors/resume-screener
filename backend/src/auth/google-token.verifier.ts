import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { authConfig, type AuthConfig } from '../config/auth.config.js';
import {
  IdentityVerifier,
  type VerifiedIdentity,
} from './identity-verifier.js';

/** Google Identity Services sign-in. */
@Injectable()
export class GoogleTokenVerifier extends IdentityVerifier {
  private readonly client = new OAuth2Client();
  private readonly clientId: string;

  constructor(@Inject(authConfig.KEY) config: AuthConfig) {
    super();
    this.clientId = config.googleClientId;
  }

  /** Verifies a Google ID token issued to this app's OAuth client. */
  async verify(idToken: string): Promise<VerifiedIdentity> {
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
