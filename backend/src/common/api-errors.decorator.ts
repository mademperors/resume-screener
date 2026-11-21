import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

export class FieldErrorDto {
  @ApiProperty({ example: 'requiredSkills' })
  field: string;

  @ApiProperty({ type: [String], example: ['Add at least one value.'] })
  messages: string[];
}

/** The shape of every error response (see AllExceptionsFilter). */
export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({
    example: 'Some fields are invalid. Check the highlighted fields.',
  })
  message: string;

  @ApiPropertyOptional({
    type: [FieldErrorDto],
    description: 'Present for validation errors.',
  })
  errors?: FieldErrorDto[];
}

/** Errors any authenticated, company-scoped endpoint can return. */
export function ApiStandardErrors() {
  return applyDecorators(
    ApiBadRequestResponse({
      type: ErrorResponseDto,
      description: 'Invalid input.',
    }),
    ApiUnauthorizedResponse({
      type: ErrorResponseDto,
      description: 'Not signed in, session expired, or invalid API key.',
    }),
    ApiForbiddenResponse({
      type: ErrorResponseDto,
      description:
        "The record belongs to another company, or the action isn't allowed with an API key.",
    }),
    ApiNotFoundResponse({ type: ErrorResponseDto }),
    ApiTooManyRequestsResponse({
      type: ErrorResponseDto,
      description:
        'API key over its requests-per-minute limit; see Retry-After.',
    }),
  );
}
