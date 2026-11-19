import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { Repository } from 'typeorm';
import { randomToken, safeEqual, sha256Hex } from '../common/crypto.js';
import { assertOwnedByCompany } from '../common/tenant.js';
import { ApiKey } from './api-key.entity.js';

// Format: rsk_<12 hex prefix>_<43 base64url secret>
const KEY_PATTERN = /^rsk_([0-9a-f]{12})_[A-Za-z0-9_-]{43}$/;
const LAST_USED_RESOLUTION_MS = 60_000;

@Injectable()
export class ApiKeysService {
  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeys: Repository<ApiKey>,
  ) {}

  /** Returns the saved key and its plaintext, which is never retrievable again. */
  async create(
    companyId: string,
    createdByUserId: string,
    name: string,
  ): Promise<{ apiKey: ApiKey; plaintext: string }> {
    const prefix = randomBytes(6).toString('hex');
    const plaintext = `rsk_${prefix}_${randomToken(32)}`;
    const apiKey = await this.apiKeys.save(
      this.apiKeys.create({
        companyId,
        createdByUserId,
        name,
        prefix,
        keyHash: sha256Hex(plaintext),
        lastUsedAt: null,
        revokedAt: null,
      }),
    );
    return { apiKey, plaintext };
  }

  list(companyId: string): Promise<ApiKey[]> {
    return this.apiKeys.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });
  }

  async revoke(companyId: string, id: string): Promise<ApiKey> {
    const apiKey = assertOwnedByCompany(
      await this.apiKeys.findOneBy({ id }),
      companyId,
      'API key',
    );
    if (!apiKey.revokedAt) {
      apiKey.revokedAt = new Date();
      await this.apiKeys.save(apiKey);
    }
    return apiKey;
  }

  /** Resolves an active key with its company, or null if invalid or revoked. */
  async verify(plaintext: string): Promise<ApiKey | null> {
    const match = KEY_PATTERN.exec(plaintext);
    if (!match) {
      return null;
    }
    const apiKey = await this.apiKeys.findOne({
      where: { prefix: match[1] },
      relations: { company: true },
    });
    if (
      !apiKey ||
      apiKey.revokedAt ||
      !safeEqual(sha256Hex(plaintext), apiKey.keyHash)
    ) {
      return null;
    }
    const now = new Date();
    if (
      !apiKey.lastUsedAt ||
      now.getTime() - apiKey.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS
    ) {
      apiKey.lastUsedAt = now;
      await this.apiKeys.update(apiKey.id, { lastUsedAt: now });
    }
    return apiKey;
  }
}
