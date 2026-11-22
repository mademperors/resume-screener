import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type DeepPartial } from 'typeorm';
import { ApiKey } from './api-key.entity.js';

@Injectable()
export class ApiKeysRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  create(data: DeepPartial<ApiKey>): Promise<ApiKey> {
    return this.keys().save(this.keys().create(data));
  }

  findById(id: string): Promise<ApiKey | null> {
    return this.keys().findOneBy({ id });
  }

  /** The key with this public prefix, with its company. */
  findByPrefix(prefix: string): Promise<ApiKey | null> {
    return this.keys().findOne({
      where: { prefix },
      relations: { company: true },
    });
  }

  listByCompany(companyId: string): Promise<ApiKey[]> {
    return this.keys().find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: string, patch: DeepPartial<ApiKey>): Promise<void> {
    await this.keys().update(id, patch as never);
  }

  private keys() {
    return this.db.getRepository(ApiKey);
  }
}
