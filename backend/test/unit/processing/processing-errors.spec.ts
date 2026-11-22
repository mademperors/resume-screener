import { StorageUnavailableError } from '@src/storage/file-storage.js';
import {
  describeFailure,
  exhaustedMessage,
  PermanentProcessingError,
  requestedRetryDelay,
  ScreeningModelUnavailableError,
  UnreadableFileError,
} from '@src/processing/processing-errors.js';

describe('requestedRetryDelay', () => {
  it('finds the wait the model asked for, also behind wrapping errors', () => {
    const unavailable = new ScreeningModelUnavailableError({
      retryAfterMs: 30_000,
    });
    expect(requestedRetryDelay(unavailable)).toBe(30_000);
    expect(
      requestedRetryDelay(new Error('will retry', { cause: unavailable })),
    ).toBe(30_000);
  });

  it('is null when no wait was asked for', () => {
    expect(requestedRetryDelay(new ScreeningModelUnavailableError())).toBe(
      null,
    );
    expect(requestedRetryDelay(new Error('other'))).toBeNull();
    expect(requestedRetryDelay('not an error')).toBeNull();
  });
});

describe('describeFailure', () => {
  it('retries temporary model and storage problems', () => {
    expect(describeFailure(new ScreeningModelUnavailableError())).toEqual({
      retryable: true,
      userMessage:
        'The screening service is temporarily unavailable. Processing will be retried.',
    });
    expect(describeFailure(new StorageUnavailableError('down')).retryable).toBe(
      true,
    );
  });

  it('retries unknown errors without exposing their details', () => {
    const failure = describeFailure(new Error('connection reset by peer'));
    expect(failure.retryable).toBe(true);
    expect(failure.userMessage).not.toContain('connection');
  });

  it('does not retry permanent problems', () => {
    expect(describeFailure(new PermanentProcessingError('Bad input.'))).toEqual(
      { retryable: false, userMessage: 'Bad input.' },
    );
    expect(describeFailure(new UnreadableFileError()).retryable).toBe(false);
  });

  it('rewords the message once retries are used up', () => {
    expect(
      exhaustedMessage(describeFailure(new ScreeningModelUnavailableError())),
    ).toBe(
      'The screening service is temporarily unavailable. Retry processing later.',
    );
  });
});
