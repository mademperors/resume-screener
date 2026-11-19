import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * Tenant isolation check for anything loaded by id. A missing record is 404;
 * a record that belongs to another company is 403, as the requirements ask.
 *
 * @param name lower-case display name used in messages, e.g. `'job'`.
 */
export function assertOwnedByCompany<T extends { companyId: string }>(
  entity: T | null | undefined,
  companyId: string,
  name: string,
): T {
  if (!entity) {
    throw new NotFoundException(
      `${name.charAt(0).toUpperCase()}${name.slice(1)} not found.`,
    );
  }
  if (entity.companyId !== companyId) {
    throw new ForbiddenException(`You do not have access to this ${name}.`);
  }
  return entity;
}
