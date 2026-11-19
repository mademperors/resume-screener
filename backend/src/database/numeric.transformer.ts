import type { ValueTransformer } from 'typeorm';

/** Postgres returns `numeric` as a string; expose it as a JS number. */
export const numericTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};
