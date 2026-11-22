import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type DeepPartial } from 'typeorm';
import { User } from './user.entity.js';

@Injectable()
export class UsersRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  findByGoogleSubject(googleSubject: string): Promise<User | null> {
    return this.users().findOneBy({ googleSubject });
  }

  /** The user with their company, or null. */
  findWithCompany(id: string): Promise<User | null> {
    return this.users().findOne({
      where: { id },
      relations: { company: true },
    });
  }

  create(data: DeepPartial<User>): Promise<User> {
    return this.users().save(this.users().create(data));
  }

  save(user: User): Promise<User> {
    return this.users().save(user);
  }

  private users() {
    return this.db.getRepository(User);
  }
}
