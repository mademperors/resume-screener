import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  type ValidationError,
} from '@nestjs/common';
import type { Response } from 'express';

/** One invalid request field, e.g. `{ field: 'requiredSkills.0', messages: [...] }`. */
export interface FieldError {
  field: string;
  messages: string[];
}

/** Body of every error response. `message` is always readable English. */
export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string;
  errors?: FieldError[];
}

const INTERNAL_ERROR_MESSAGE =
  'Something went wrong on our side. Please try again later.';

// Friendlier text for the class-validator constraints users hit most often.
const CONSTRAINT_MESSAGES: Record<string, string> = {
  isNotEmpty: 'Required field is empty.',
  arrayNotEmpty: 'Add at least one value.',
  whitelistValidation: 'This field is not allowed.',
};

/** Thrown by the ValidationPipe; carries per-field errors. */
export class RequestValidationException extends BadRequestException {
  constructor(readonly fieldErrors: FieldError[]) {
    super('Some fields are invalid. Check the highlighted fields.');
  }
}

export function validationExceptionFactory(
  errors: ValidationError[],
): RequestValidationException {
  return new RequestValidationException(flattenValidationErrors(errors));
}

export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldError[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const own: FieldError[] = error.constraints
      ? [
          {
            field,
            messages: Object.entries(error.constraints).map(
              ([constraint, message]) =>
                CONSTRAINT_MESSAGES[constraint] ?? message,
            ),
          },
        ]
      : [];
    return [...own, ...flattenValidationErrors(error.children ?? [], field)];
  });
}

/**
 * Global filter. Every error leaves the API in the same shape with a readable
 * message. Unexpected errors are logged and reported without internal details.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown): ErrorResponseBody {
    if (!(exception instanceof HttpException)) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: INTERNAL_ERROR_MESSAGE,
      };
    }
    const statusCode = exception.getStatus();
    const body: ErrorResponseBody = {
      statusCode,
      error: reasonPhrase(statusCode),
      message:
        statusCode >= HttpStatus.INTERNAL_SERVER_ERROR &&
        statusCode !== HttpStatus.NOT_IMPLEMENTED &&
        statusCode !== HttpStatus.SERVICE_UNAVAILABLE
          ? INTERNAL_ERROR_MESSAGE
          : messageOf(exception),
    };
    if (exception instanceof RequestValidationException) {
      body.errors = exception.fieldErrors;
    }
    return body;
  }
}

function messageOf(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'string') {
    return response;
  }
  const message = (response as { message?: unknown }).message;
  if (Array.isArray(message)) {
    return message.map(String).join(' ');
  }
  return typeof message === 'string' ? message : exception.message;
}

function reasonPhrase(statusCode: number): string {
  const name = HttpStatus[statusCode] as string | undefined;
  if (!name) {
    return 'Error';
  }
  return name
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
