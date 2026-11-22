import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, ILike } from 'typeorm';
import { Company } from './company.entity.js';

@Injectable()
export class CompaniesRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  findById(id: string): Promise<Company | null> {
    return this.companies().findOneBy({ id });
  }

  /** Companies whose name or Google domain contains the term. */
  search(term: string, limit: number): Promise<Company[]> {
    return this.companies().find({
      where: term
        ? [{ name: ILike(`%${term}%`) }, { googleDomain: ILike(`%${term}%`) }]
        : {},
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  save(company: Company): Promise<Company> {
    return this.companies().save(company);
  }

  /** A company of its own for a personal Google account. */
  createPersonal(name: string): Promise<Company> {
    return this.companies().save(
      this.companies().create({ name, googleDomain: null }),
    );
  }

  /** The company of a Google Workspace domain, created on first use. */
  async findOrCreateForDomain(domain: string): Promise<Company> {
    // Insert-or-ignore so two first sign-ins from one domain don't race.
    await this.companies()
      .createQueryBuilder()
      .insert()
      .values({ name: domain, googleDomain: domain })
      .orIgnore()
      .execute();
    return this.companies().findOneByOrFail({ googleDomain: domain });
  }

  private companies() {
    return this.db.getRepository(Company);
  }
}
