import { MigrationInterface, QueryRunner } from 'typeorm';

export class JobsResumesCandidates1795119225025 implements MigrationInterface {
  name = 'JobsResumesCandidates1795119225025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."jobs_status_enum" AS ENUM('open', 'closed')
        `);
    await queryRunner.query(`
            CREATE TABLE "jobs" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "companyId" uuid NOT NULL,
                "title" character varying(200) NOT NULL,
                "description" text NOT NULL,
                "requiredSkills" text array NOT NULL,
                "preferredSkills" text array NOT NULL DEFAULT '{}',
                "minExperienceYears" numeric(4, 1) NOT NULL,
                "minMatchScore" smallint NOT NULL DEFAULT '0',
                "status" "public"."jobs_status_enum" NOT NULL DEFAULT 'open',
                "closedAt" TIMESTAMP WITH TIME ZONE,
                "currentConfigVersionId" uuid,
                "createdByUserId" uuid,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "deletedAt" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_cf0a6c42b72fcc7f7c237def345" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_64db6398218a462cf7b889656e" ON "jobs" ("companyId", "createdAt")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."resumes_status_enum" AS ENUM(
                'Queued',
                'Processing',
                'Processed',
                'Processing failed',
                'Could not read file'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "resumes" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "companyId" uuid NOT NULL,
                "jobId" uuid NOT NULL,
                "originalFilename" character varying(255) NOT NULL,
                "mimeType" character varying(100) NOT NULL,
                "sizeBytes" integer NOT NULL,
                "sha256" character(64) NOT NULL,
                "storageKey" character varying(500) NOT NULL,
                "status" "public"."resumes_status_enum" NOT NULL DEFAULT 'Queued',
                "attempts" integer NOT NULL DEFAULT '0',
                "autoRetryCount" integer NOT NULL DEFAULT '0',
                "lastError" text,
                "queuedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                "processingStartedAt" TIMESTAMP WITH TIME ZONE,
                "processedAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_9c8677802096d6baece48429d2e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_fb6ad10375e497a8173e0ccf8b" ON "resumes" ("status", "queuedAt")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_75720ec02512e526ca4e6257ab" ON "resumes" ("jobId", "status")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_6ca8401c3b3ba8b39f22add2a5" ON "resumes" ("jobId", "sha256")
        `);
    await queryRunner.query(`
            CREATE TYPE "public"."candidates_decision_enum" AS ENUM('Pending', 'Approved', 'Rejected')
        `);
    await queryRunner.query(`
            CREATE TABLE "candidates" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "companyId" uuid NOT NULL,
                "jobId" uuid NOT NULL,
                "resumeId" uuid NOT NULL,
                "fullName" character varying(200),
                "email" character varying(320),
                "phone" character varying(50),
                "location" character varying(200),
                "decision" "public"."candidates_decision_enum" NOT NULL DEFAULT 'Pending',
                "matchScore" numeric(5, 2),
                "experienceYears" numeric(4, 1),
                "skills" text array NOT NULL DEFAULT '{}',
                "skillsNormalized" text array NOT NULL DEFAULT '{}',
                "missingSkills" text array NOT NULL DEFAULT '{}',
                "flags" text array NOT NULL DEFAULT '{}',
                "belowThreshold" boolean NOT NULL DEFAULT false,
                "latestEvaluationId" uuid,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_bf9b6cf9953696289759fdb80d8" UNIQUE ("resumeId"),
                CONSTRAINT "REL_bf9b6cf9953696289759fdb80d" UNIQUE ("resumeId"),
                CONSTRAINT "PK_140681296bf033ab1eb95288abb" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_ecc148899603e92aff16a81283" ON "candidates" ("jobId", "belowThreshold", "matchScore")
        `);
    await queryRunner.query(`
            CREATE TABLE "scoring_config_versions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "jobId" uuid NOT NULL,
                "version" integer NOT NULL,
                "requirements" jsonb NOT NULL,
                "manualReviewConfidenceThreshold" numeric(3, 2) NOT NULL,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_d8e9f8fc406947bac1984354b5a" UNIQUE ("jobId", "version"),
                CONSTRAINT "PK_6b33e29db2563203a81f9f6a586" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "evaluations" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "companyId" uuid NOT NULL,
                "candidateId" uuid NOT NULL,
                "configVersionId" uuid NOT NULL,
                "modelName" character varying(100) NOT NULL,
                "modelVersion" character varying(100) NOT NULL,
                "matchScore" numeric(5, 2) NOT NULL,
                "experienceYears" numeric(4, 1),
                "verdicts" jsonb NOT NULL,
                "contributions" jsonb NOT NULL,
                "foundSkills" text array NOT NULL DEFAULT '{}',
                "missingSkills" text array NOT NULL DEFAULT '{}',
                "flags" text array NOT NULL DEFAULT '{}',
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_f683b433eba0e6dae7e19b29e29" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_17bba27e2e250dafc012c22f09" ON "evaluations" ("candidateId", "createdAt")
        `);
    await queryRunner.query(`
            ALTER TABLE "jobs"
            ADD CONSTRAINT "FK_6ce4483dc65ed9d2e171269d801" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "resumes"
            ADD CONSTRAINT "FK_5f310b10aa35cd5c4e98d4ca849" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "resumes"
            ADD CONSTRAINT "FK_da705ff919ad91bf22184438abd" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "candidates"
            ADD CONSTRAINT "FK_fefbcf6b9fa21c4acdd1e6b5b0e" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "candidates"
            ADD CONSTRAINT "FK_426d378178da5713f1ab30daabc" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "candidates"
            ADD CONSTRAINT "FK_bf9b6cf9953696289759fdb80d8" FOREIGN KEY ("resumeId") REFERENCES "resumes"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "scoring_config_versions"
            ADD CONSTRAINT "FK_aea14ea53bf2cc40c38cc2e32dd" FOREIGN KEY ("jobId") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "evaluations"
            ADD CONSTRAINT "FK_7b40c3f909ff918aa8a6837364f" FOREIGN KEY ("candidateId") REFERENCES "candidates"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "evaluations"
            ADD CONSTRAINT "FK_0af3f6db26a906e9c902a01a79d" FOREIGN KEY ("configVersionId") REFERENCES "scoring_config_versions"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    // Added by hand: GIN index for skill filters (declared with synchronize: false).
    await queryRunner.query(`
            CREATE INDEX "IDX_candidates_skills_normalized" ON "candidates" USING GIN ("skillsNormalized")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_candidates_skills_normalized"`,
    );
    await queryRunner.query(`
            ALTER TABLE "evaluations" DROP CONSTRAINT "FK_0af3f6db26a906e9c902a01a79d"
        `);
    await queryRunner.query(`
            ALTER TABLE "evaluations" DROP CONSTRAINT "FK_7b40c3f909ff918aa8a6837364f"
        `);
    await queryRunner.query(`
            ALTER TABLE "scoring_config_versions" DROP CONSTRAINT "FK_aea14ea53bf2cc40c38cc2e32dd"
        `);
    await queryRunner.query(`
            ALTER TABLE "candidates" DROP CONSTRAINT "FK_bf9b6cf9953696289759fdb80d8"
        `);
    await queryRunner.query(`
            ALTER TABLE "candidates" DROP CONSTRAINT "FK_426d378178da5713f1ab30daabc"
        `);
    await queryRunner.query(`
            ALTER TABLE "candidates" DROP CONSTRAINT "FK_fefbcf6b9fa21c4acdd1e6b5b0e"
        `);
    await queryRunner.query(`
            ALTER TABLE "resumes" DROP CONSTRAINT "FK_da705ff919ad91bf22184438abd"
        `);
    await queryRunner.query(`
            ALTER TABLE "resumes" DROP CONSTRAINT "FK_5f310b10aa35cd5c4e98d4ca849"
        `);
    await queryRunner.query(`
            ALTER TABLE "jobs" DROP CONSTRAINT "FK_6ce4483dc65ed9d2e171269d801"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_17bba27e2e250dafc012c22f09"
        `);
    await queryRunner.query(`
            DROP TABLE "evaluations"
        `);
    await queryRunner.query(`
            DROP TABLE "scoring_config_versions"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_ecc148899603e92aff16a81283"
        `);
    await queryRunner.query(`
            DROP TABLE "candidates"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."candidates_decision_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_6ca8401c3b3ba8b39f22add2a5"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_75720ec02512e526ca4e6257ab"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_fb6ad10375e497a8173e0ccf8b"
        `);
    await queryRunner.query(`
            DROP TABLE "resumes"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."resumes_status_enum"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_64db6398218a462cf7b889656e"
        `);
    await queryRunner.query(`
            DROP TABLE "jobs"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."jobs_status_enum"
        `);
  }
}
