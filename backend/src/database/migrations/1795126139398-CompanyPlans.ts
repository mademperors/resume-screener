import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces the fixed per-company rate limit with a plan (standard/extended,
 * limits from configuration) and an optional custom limit. Limits that were
 * changed from the old default of 200 are kept as custom limits.
 * Generated, then edited by hand to carry the data over.
 */
export class CompanyPlans1795126139398 implements MigrationInterface {
  name = 'CompanyPlans1795126139398';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."companies_plan_enum" AS ENUM('standard', 'extended')
        `);
    await queryRunner.query(`
            ALTER TABLE "companies"
            ADD "plan" "public"."companies_plan_enum" NOT NULL DEFAULT 'standard'
        `);
    await queryRunner.query(`
            ALTER TABLE "companies"
            ADD "customRateLimitPerMinute" integer
        `);
    await queryRunner.query(`
            UPDATE "companies"
            SET "customRateLimitPerMinute" = "apiRateLimitPerMinute"
            WHERE "apiRateLimitPerMinute" <> 200
        `);
    await queryRunner.query(`
            ALTER TABLE "companies" DROP COLUMN "apiRateLimitPerMinute"
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "companies"
            ADD "apiRateLimitPerMinute" integer NOT NULL DEFAULT '200'
        `);
    // The plan limits live in configuration; restore custom limits only.
    await queryRunner.query(`
            UPDATE "companies"
            SET "apiRateLimitPerMinute" = "customRateLimitPerMinute"
            WHERE "customRateLimitPerMinute" IS NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "companies" DROP COLUMN "customRateLimitPerMinute"
        `);
    await queryRunner.query(`
            ALTER TABLE "companies" DROP COLUMN "plan"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."companies_plan_enum"
        `);
  }
}
