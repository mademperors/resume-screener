import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { catchError, type Observable } from 'rxjs';

/** Files up to this size are received, then rejected one by one above 10 MB. */
export const UPLOAD_HARD_LIMIT_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 20;

/**
 * Multer stops the whole request on its limits. Put this interceptor before
 * FilesInterceptor to replace multer's terse messages with readable ones.
 */
@Injectable()
export class UploadErrorsInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        throw translate(error);
      }),
    );
  }
}

function translate(error: unknown): unknown {
  if (!(error instanceof HttpException)) {
    return error;
  }
  switch (error.message) {
    case 'File too large':
      return new PayloadTooLargeException(
        'File is too large (max 10 MB). Remove it and upload the others again.',
      );
    case 'Too many files':
      return new BadRequestException(
        `Upload at most ${MAX_FILES_PER_UPLOAD} files at a time.`,
      );
    case 'Unexpected field':
      return new BadRequestException(
        'Send the files in the "files" form field.',
      );
    default:
      return error;
  }
}
