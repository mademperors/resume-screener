import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { assertOwnedByCompany } from './tenant.js';

describe('assertOwnedByCompany', () => {
  it('returns an entity of the same company', () => {
    const job = { id: 'job-1', companyId: 'company-1' };
    expect(assertOwnedByCompany(job, 'company-1', 'job')).toBe(job);
  });

  it('throws 404 when the entity does not exist', () => {
    expect(() => assertOwnedByCompany(null, 'company-1', 'job')).toThrow(
      new NotFoundException('Job not found.'),
    );
  });

  it("throws 403 for another company's entity", () => {
    expect(() =>
      assertOwnedByCompany({ companyId: 'company-2' }, 'company-1', 'job'),
    ).toThrow(new ForbiddenException('You do not have access to this job.'));
  });
});
