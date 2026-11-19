import { MigrationInterface, QueryRunner } from 'typeorm';

export class EvaluationNotesPendingDeletions1795122813933 implements MigrationInterface {
  name = 'EvaluationNotesPendingDeletions1795122813933';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "pending_file_deletions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "storageKey" character varying(500) NOT NULL,
                "attempts" integer NOT NULL DEFAULT '0',
                "lastError" text,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_1c75e39de83041dd28869e362c0" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "evaluations"
            ADD "notes" text array NOT NULL DEFAULT '{}'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "evaluations" DROP COLUMN "notes"
        `);
    await queryRunner.query(`
            DROP TABLE "pending_file_deletions"
        `);
  }
}
