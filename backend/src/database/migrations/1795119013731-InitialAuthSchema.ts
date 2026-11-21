import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialAuthSchema1795119013731 implements MigrationInterface {
  name = 'InitialAuthSchema1795119013731';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "companies" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "googleDomain" character varying,
                "apiRateLimitPerMinute" integer NOT NULL DEFAULT '200',
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_1dfded086c1df7349281ed0da22" UNIQUE ("googleDomain"),
                CONSTRAINT "PK_d4bc3e82a314fa9e29f652c2c22" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "api_keys" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "companyId" uuid NOT NULL,
                "createdByUserId" uuid NOT NULL,
                "name" character varying NOT NULL,
                "prefix" character varying(16) NOT NULL,
                "keyHash" character(64) NOT NULL,
                "lastUsedAt" TIMESTAMP WITH TIME ZONE,
                "revokedAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_6f6105c8efe05b310d046cbdb3d" UNIQUE ("prefix"),
                CONSTRAINT "PK_5c8a79801b44bd27b79228e1dad" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "googleSubject" character varying NOT NULL,
                "email" character varying NOT NULL,
                "name" character varying,
                "avatarUrl" character varying,
                "companyId" uuid NOT NULL,
                "lastLoginAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_93a009ec6a8776b148dec266b51" UNIQUE ("googleSubject"),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "sessions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "refreshTokenHash" character(64) NOT NULL,
                "lastActivityAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
                "revokedAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_b08788ca45cbd90f0bd96c2f077" UNIQUE ("refreshTokenHash"),
                CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "api_keys"
            ADD CONSTRAINT "FK_40fbec27ca4b3ac70b1bbf23016" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "users"
            ADD CONSTRAINT "FK_6f9395c9037632a31107c8a9e58" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
    await queryRunner.query(`
            ALTER TABLE "sessions"
            ADD CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "sessions" DROP CONSTRAINT "FK_57de40bc620f456c7311aa3a1e6"
        `);
    await queryRunner.query(`
            ALTER TABLE "users" DROP CONSTRAINT "FK_6f9395c9037632a31107c8a9e58"
        `);
    await queryRunner.query(`
            ALTER TABLE "api_keys" DROP CONSTRAINT "FK_40fbec27ca4b3ac70b1bbf23016"
        `);
    await queryRunner.query(`
            DROP TABLE "sessions"
        `);
    await queryRunner.query(`
            DROP TABLE "users"
        `);
    await queryRunner.query(`
            DROP TABLE "api_keys"
        `);
    await queryRunner.query(`
            DROP TABLE "companies"
        `);
  }
}
