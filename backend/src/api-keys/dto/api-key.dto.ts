import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { ApiKey } from '../api-key.entity.js';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'ATS integration' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

export class ApiKeyDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({
    description: 'Non-secret start of the key, to recognise it.',
    example: 'rsk_1a2b3c4d5e6f',
  })
  displayPrefix: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastUsedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  revokedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  static from(apiKey: ApiKey): ApiKeyDto {
    return {
      id: apiKey.id,
      name: apiKey.name,
      displayPrefix: `rsk_${apiKey.prefix}`,
      lastUsedAt: apiKey.lastUsedAt,
      revokedAt: apiKey.revokedAt,
      createdAt: apiKey.createdAt,
    };
  }
}

export class CreatedApiKeyDto extends ApiKeyDto {
  @ApiProperty({
    description: 'The full key. Shown only once; store it securely.',
  })
  key: string;
}
