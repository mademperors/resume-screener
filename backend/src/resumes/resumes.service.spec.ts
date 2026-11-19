import { ConflictException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { Principal } from '../common/principal.js';
import { JobStatus, type Job } from '../jobs/job.entity.js';
import type { JobsService } from '../jobs/jobs.service.js';
import { ProcessingQueue, type ResumeTask } from '../queue/processing-queue.js';
import { InMemoryFileStorage } from '../storage/in-memory-file-storage.js';
import { MAX_RESUME_FILE_BYTES } from './file-type.js';
import { DOCX_BYTES, PDF_BYTES } from './resume-fixtures.js';
import { ResumeStatus, type Resume } from './resume.entity.js';
import { ResumesService, type UploadedFile } from './resumes.service.js';

const principal: Principal = {
  kind: 'user',
  userId: 'user-1',
  companyId: 'company-1',
  sessionId: 'session-1',
};

class FakeQueue extends ProcessingQueue {
  tasks: ResumeTask[] = [];
  fail = false;
  async enqueue(tasks: readonly ResumeTask[]): Promise<void> {
    if (this.fail) {
      throw new Error('down');
    }
    this.tasks.push(...tasks);
  }
}

function file(
  originalname: string,
  buffer: Buffer,
  size = buffer.length,
): UploadedFile {
  return { originalname, buffer, size };
}

function setup(jobOverrides: Partial<Job> = {}) {
  const job = {
    id: 'job-1',
    companyId: 'company-1',
    status: JobStatus.Open,
    currentConfigVersionId: 'config-1',
    ...jobOverrides,
  } as Job;
  const rows: Resume[] = [];
  const repo = {
    create: (data: Partial<Resume>) => ({ ...data }) as Resume,
    save: vi.fn(async (resume: Resume) => {
      rows.push(resume);
      return resume;
    }),
    find: async () => rows.map(({ id, sha256 }) => ({ id, sha256 })),
  };
  const jobs = { getOwned: vi.fn(async () => job) };
  const storage = new InMemoryFileStorage();
  const queue = new FakeQueue();
  const service = new ResumesService(
    repo as unknown as Repository<Resume>,
    jobs as unknown as JobsService,
    storage,
    queue,
  );
  return { service, rows, repo, storage, queue };
}

describe('ResumesService.upload', () => {
  it('stores, records and queues each accepted file', async () => {
    const { service, rows, storage, queue } = setup();

    const result = await service.upload(
      principal,
      'job-1',
      [file('a.pdf', PDF_BYTES), file('b.docx', DOCX_BYTES)],
      'skip',
    );

    expect(result).toMatchObject({ accepted: 2, rejected: 0, duplicates: 0 });
    expect(rows.map((r) => [r.originalFilename, r.mimeType, r.status])).toEqual(
      [
        ['a.pdf', 'application/pdf', ResumeStatus.Queued],
        [
          'b.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          ResumeStatus.Queued,
        ],
      ],
    );
    expect(storage.files.get(rows[0].storageKey)?.body).toEqual(PDF_BYTES);
    expect(rows[0].storageKey).toBe(
      `companies/company-1/jobs/job-1/resumes/${rows[0].id}`,
    );
    expect(queue.tasks).toEqual(
      rows.map((r) => ({ resumeId: r.id, configVersionId: 'config-1' })),
    );
  });

  it('rejects bad files with a reason and keeps the good ones', async () => {
    const { service, rows } = setup();

    const result = await service.upload(
      principal,
      'job-1',
      [
        file('empty.pdf', Buffer.alloc(0)),
        file('big.pdf', PDF_BYTES, MAX_RESUME_FILE_BYTES + 1),
        file('notes.txt', Buffer.from('hello')),
        file('ok.pdf', PDF_BYTES),
      ],
      'skip',
    );

    expect(result.results).toEqual([
      { filename: 'empty.pdf', status: 'rejected', reason: 'File is empty.' },
      {
        filename: 'big.pdf',
        status: 'rejected',
        reason: 'File is too large (max 10 MB).',
      },
      {
        filename: 'notes.txt',
        status: 'rejected',
        reason: 'Unsupported file format. Upload a PDF or DOCX file.',
      },
      { filename: 'ok.pdf', status: 'accepted', resumeId: rows[0].id },
    ]);
    expect(rows).toHaveLength(1);
  });

  it('skips duplicates of earlier uploads and within the batch', async () => {
    const { service } = setup();
    const first = await service.upload(
      principal,
      'job-1',
      [file('a.pdf', PDF_BYTES)],
      'skip',
    );
    const firstId = first.results[0].resumeId;

    const second = await service.upload(
      principal,
      'job-1',
      [
        file('a-again.pdf', PDF_BYTES),
        file('b.docx', DOCX_BYTES),
        file('b-copy.docx', DOCX_BYTES),
      ],
      'skip',
    );

    expect(second.results[0]).toMatchObject({
      status: 'duplicate',
      duplicateOfResumeId: firstId,
    });
    expect(second.results[1].status).toBe('accepted');
    expect(second.results[2]).toMatchObject({
      status: 'duplicate',
      duplicateOfResumeId: second.results[1].resumeId,
    });
  });

  it('uploads duplicates again when asked to keep them', async () => {
    const { service } = setup();
    await service.upload(
      principal,
      'job-1',
      [file('a.pdf', PDF_BYTES)],
      'skip',
    );
    const again = await service.upload(
      principal,
      'job-1',
      [file('a.pdf', PDF_BYTES)],
      'keep',
    );
    expect(again.accepted).toBe(1);
  });

  it('reports a storage failure for that file only', async () => {
    const { service, storage } = setup();
    const put = storage.put.bind(storage);
    let calls = 0;
    storage.put = async (...args) => {
      calls += 1;
      if (calls === 1) {
        throw new Error('storage down');
      }
      return put(...args);
    };

    const result = await service.upload(
      principal,
      'job-1',
      [file('a.pdf', PDF_BYTES), file('b.docx', DOCX_BYTES)],
      'skip',
    );

    expect(result.results.map((r) => r.status)).toEqual([
      'rejected',
      'accepted',
    ]);
    expect(result.results[0].reason).toMatch(/Could not save the file/);
  });

  it('removes the stored file when recording it fails', async () => {
    const { service, repo, storage } = setup();
    repo.save.mockRejectedValueOnce(new Error('db down'));

    const result = await service.upload(
      principal,
      'job-1',
      [file('a.pdf', PDF_BYTES)],
      'skip',
    );

    expect(result.results[0].status).toBe('rejected');
    expect(storage.files.size).toBe(0);
  });

  it('keeps accepted resumes Queued when the queue is down', async () => {
    const { service, rows, queue } = setup();
    queue.fail = true;

    const result = await service.upload(
      principal,
      'job-1',
      [file('a.pdf', PDF_BYTES)],
      'skip',
    );

    expect(result.accepted).toBe(1);
    expect(rows[0].status).toBe(ResumeStatus.Queued);
  });

  it('refuses uploads to a closed job', async () => {
    const { service } = setup({ status: JobStatus.Closed });
    await expect(
      service.upload(principal, 'job-1', [file('a.pdf', PDF_BYTES)], 'skip'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
