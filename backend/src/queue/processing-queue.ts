/** Process one resume against one version of its job's scoring config. */
export interface ResumeTask {
  resumeId: string;
  configVersionId: string;
}

/**
 * Hands resumes to the background workers. Inject this abstract class; the
 * BullMQ implementation can be swapped (e.g. for tests) without touching callers.
 *
 * Enqueueing the same task again while it is waiting, delayed or running does
 * nothing: one resume and config version is one task.
 */
export abstract class ProcessingQueue {
  abstract enqueue(tasks: readonly ResumeTask[]): Promise<void>;
}

export const RESUME_QUEUE = 'resume-processing';

/** BullMQ job ids can't contain ":", so the parts are joined with "_". */
export function resumeTaskId(task: ResumeTask): string {
  return `${task.resumeId}_${task.configVersionId}`;
}
