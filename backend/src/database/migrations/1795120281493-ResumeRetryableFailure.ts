import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResumeRetryableFailure1795120281493 implements MigrationInterface {
  name = 'ResumeRetryableFailure1795120281493';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "resumes"
            ADD "lastErrorRetryable" boolean NOT NULL DEFAULT false
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "resumes" DROP COLUMN "lastErrorRetryable"
        `);
  }
}
