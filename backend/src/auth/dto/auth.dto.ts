import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { CompanyPlan } from '../../companies/company.entity.js';

export class GoogleSignInDto {
  @ApiProperty({
    description:
      'ID token returned by Google Identity Services on the frontend.',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class AuthTokensDto {
  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ description: 'Send as `Authorization: Bearer <token>`.' })
  accessToken: string;

  @ApiProperty({
    description: 'Access token lifetime in seconds.',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({ description: 'Single use: each refresh returns a new one.' })
  refreshToken: string;
}

export class CompanyDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: CompanyPlan })
  plan: CompanyPlan;

  @ApiProperty({
    description: 'Requests per minute allowed for each API key.',
    example: 200,
  })
  apiRateLimitPerMinute: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Set when the company has a custom limit instead of its plan limit.',
  })
  customRateLimitPerMinute: number | null;
}

export class MeDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  @ApiProperty({ type: String, nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ type: CompanyDto })
  company: CompanyDto;
}
