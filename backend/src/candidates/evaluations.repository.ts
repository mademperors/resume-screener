import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type DeepPartial, type EntityManager } from 'typeorm';
import { Evaluation } from './evaluation.entity.js';

/** Evaluations: one per scoring run of a candidate, never changed afterwards. */
@Injectable()
export class EvaluationsRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  findById(id: string): Promise<Evaluation | null> {
    return this.db.getRepository(Evaluation).findOneBy({ id });
  }

  create(
    data: DeepPartial<Evaluation>,
    tx: EntityManager,
  ): Promise<Evaluation> {
    const evaluations = tx.getRepository(Evaluation);
    return evaluations.save(evaluations.create(data));
  }
}
