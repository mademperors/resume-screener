import { MigrationInterface, QueryRunner } from 'typeorm';

export class JobScoringSettings1795125845856 implements MigrationInterface {
  name = 'JobScoringSettings1795125845856';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "jobs"
            ADD "requiredSkillWeight" numeric(4, 2) NOT NULL DEFAULT '2'
        `);
    await queryRunner.query(`
            ALTER TABLE "jobs"
            ADD "preferredSkillWeight" numeric(4, 2) NOT NULL DEFAULT '1'
        `);
    await queryRunner.query(`
            ALTER TABLE "jobs"
            ADD "experienceWeight" numeric(4, 2) NOT NULL DEFAULT '2'
        `);
    await queryRunner.query(`
            ALTER TABLE "jobs"
            ADD "skillWeights" jsonb NOT NULL DEFAULT '[]'
        `);
    await queryRunner.query(`
            ALTER TABLE "jobs"
            ADD "manualReviewThreshold" numeric(3, 2) NOT NULL DEFAULT '0.6'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "jobs" DROP COLUMN "manualReviewThreshold"
        `);
    await queryRunner.query(`
            ALTER TABLE "jobs" DROP COLUMN "skillWeights"
        `);
    await queryRunner.query(`
            ALTER TABLE "jobs" DROP COLUMN "experienceWeight"
        `);
    await queryRunner.query(`
            ALTER TABLE "jobs" DROP COLUMN "preferredSkillWeight"
        `);
    await queryRunner.query(`
            ALTER TABLE "jobs" DROP COLUMN "requiredSkillWeight"
        `);
  }
}
