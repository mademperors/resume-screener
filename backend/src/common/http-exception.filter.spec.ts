import 'reflect-metadata';
import {
  ArgumentsHost,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  IsArray,
  IsNotEmpty,
  IsString,
  ValidateNested,
  validateSync,
} from 'class-validator';
import { plainToInstance, Type } from 'class-transformer';
import {
  AllExceptionsFilter,
  type ErrorResponseBody,
  validationExceptionFactory,
} from './http-exception.filter.js';

function respond(exception: unknown): {
  status: number;
  body: ErrorResponseBody;
} {
  const result = { status: 0, body: {} as ErrorResponseBody };
  const response = {
    status(code: number) {
      result.status = code;
      return this;
    },
    json(body: ErrorResponseBody) {
      result.body = body;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return result;
}

class Child {
  @IsString()
  @IsNotEmpty()
  name: string;
}

class Parent {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Child)
  children: Child[];
}

describe('AllExceptionsFilter', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('keeps the status and message of HTTP exceptions', () => {
    const { status, body } = respond(
      new ForbiddenException('You do not have access to this job.'),
    );
    expect(status).toBe(403);
    expect(body).toEqual({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You do not have access to this job.',
    });
  });

  it('hides details of unexpected errors', () => {
    const { status, body } = respond(new Error('relation "x" does not exist'));
    expect(status).toBe(500);
    expect(body.message).not.toContain('relation');
    expect(body.message).toMatch(/try again later/);
  });

  it('keeps the message of 501 and 503 responses', () => {
    const { body } = respond(
      new HttpException('Not ready yet.', HttpStatus.SERVICE_UNAVAILABLE),
    );
    expect(body.message).toBe('Not ready yet.');
  });

  it('reports invalid fields, including nested ones, in plain language', () => {
    const input = plainToInstance(Parent, {
      title: '',
      children: [{ name: '' }],
    });
    const { status, body } = respond(
      validationExceptionFactory(validateSync(input)),
    );

    expect(status).toBe(400);
    expect(body.message).toMatch(/Some fields are invalid/);
    expect(body.errors).toEqual([
      { field: 'title', messages: ['Required field is empty.'] },
      { field: 'children.0.name', messages: ['Required field is empty.'] },
    ]);
  });
});
