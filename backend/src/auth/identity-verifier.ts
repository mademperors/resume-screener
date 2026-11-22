/** Who signed in, as confirmed by the identity provider. */
export interface VerifiedIdentity {
  /** Stable id of the account at the provider. */
  subject: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  /** Organisation domain (Google Workspace `hd`); null for personal accounts. */
  hostedDomain: string | null;
}

/**
 * Checks a sign-in token from the browser. Inject this abstract class: the
 * Google implementation is bound in AuthModule, and tests replace it with a
 * fake that accepts any token.
 */
export abstract class IdentityVerifier {
  abstract verify(idToken: string): Promise<VerifiedIdentity>;
}
