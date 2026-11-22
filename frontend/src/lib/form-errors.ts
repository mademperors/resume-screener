import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from '@/api/client'

/**
 * Maps backend validation errors (`errors[].field`) onto form fields.
 * Returns a message to show when no field could be matched.
 */
export function applyApiFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
): string | null {
  if (error instanceof ApiError) {
    let matched = false

    for (const [field, messages] of Object.entries(error.fieldErrors)) {
      if (messages.length === 0) continue
      setError(field as Path<T>, { type: 'server', message: messages.join(' ') })
      matched = true
    }

    return matched ? null : error.message
  }

  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
