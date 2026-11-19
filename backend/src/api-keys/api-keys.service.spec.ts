import { ForbiddenException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { sha256Hex } from '../common/crypto.js';
import type { Company } from '../companies/company.entity.js';
import type { ApiKey } from './api-key.entity.js';
import { ApiKeysService } from './api-keys.service.js';

const company = { id: 'company-1', plan: 'standard' } as Company;

function createService() {
  const rows: ApiKey[] = [];
  const repo = {
    create: (data: Partial<ApiKey>) => ({ ...data }) as ApiKey,
    save: async (key: ApiKey) => {
      if (!key.id) {
        key.id = `key-${rows.length + 1}`;
        key.createdAt = new Date();
        rows.push(key);
      }
      return key;
    },
    findOne: async ({ where }: { where: { prefix: string } }) => {
      const row = rows.find((key) => key.prefix === where.prefix);
      return row ? Object.assign({}, row, { company }) : null;
    },
    findOneBy: async ({ id }: { id: string }) =>
      rows.find((key) => key.id === id) ?? null,
    update: vi.fn(async () => ({})),
  };
  return {
    service: new ApiKeysService(repo as unknown as Repository<ApiKey>),
    rows,
  };
}

describe('ApiKeysService', () => {
  it('stores only a hash of the generated key', async () => {
    const { service, rows } = createService();
    const { plaintext } = await service.create('company-1', 'user-1', 'ATS');

    expect(plaintext).toMatch(/^rsk_[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/);
    expect(rows[0].keyHash).toBe(sha256Hex(plaintext));
    const secret = plaintext.slice('rsk_'.length + 12 + 1);
    expect(JSON.stringify(rows[0])).not.toContain(secret);
  });

  it('verifies a valid key and returns it with its company', async () => {
    const { service } = createService();
    const { plaintext } = await service.create('company-1', 'user-1', 'ATS');

    const key = await service.verify(plaintext);

    expect(key?.companyId).toBe('company-1');
    expect(key?.company.plan).toBe('standard');
  });

  it('rejects a key with the right prefix but wrong secret', async () => {
    const { service } = createService();
    const { plaintext } = await service.create('company-1', 'user-1', 'ATS');
    const forged =
      plaintext.slice(0, -1) + (plaintext.endsWith('A') ? 'B' : 'A');

    expect(await service.verify(forged)).toBeNull();
  });

  it('rejects malformed keys without querying', async () => {
    const { service } = createService();
    expect(await service.verify('not-a-key')).toBeNull();
  });

  it('rejects a revoked key', async () => {
    const { service, rows } = createService();
    const { plaintext } = await service.create('company-1', 'user-1', 'ATS');

    await service.revoke('company-1', rows[0].id);

    expect(rows[0].revokedAt).toBeInstanceOf(Date);
    expect(await service.verify(plaintext)).toBeNull();
  });

  it("forbids revoking another company's key", async () => {
    const { service, rows } = createService();
    await service.create('company-1', 'user-1', 'ATS');

    await expect(
      service.revoke('company-2', rows[0].id),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(rows[0].revokedAt).toBeNull();
  });
});
