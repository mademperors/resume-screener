import { registerAs, type ConfigObject } from '@nestjs/config';
import { z } from 'zod';

export type Env = Record<string, string | undefined>;

/**
 * A config namespace: parses the variables its zod `schema` declares from
 * the environment and builds the typed settings the code uses.
 *
 * - Default values live in `.env.defaults`, not in code; secrets in `.env`.
 * - List it in config.module.ts; it is then global: inject
 *   `@Inject(storageConfig.KEY) config: StorageConfig` anywhere.
 * - `load(env)` builds the settings from a plain object, for tests and for
 *   code outside Nest (the migration CLI).
 */
export function defineConfig<TSchema extends z.ZodType, TConfig extends object>(
  namespace: string,
  schema: TSchema,
  build: (env: z.output<TSchema>) => TConfig,
) {
  const load = (env: Env = process.env): TConfig =>
    build(parseEnv(namespace, schema, env));
  const factory = registerAs<ConfigObject & TConfig>(
    namespace,
    () => load() as ConfigObject & TConfig,
  );
  return Object.assign(factory, { load });
}

/** The settings type of a namespace, for injection. */
export type ConfigOf<T extends { load: (...args: never[]) => object }> =
  ReturnType<T['load']>;

function parseEnv<TSchema extends z.ZodType>(
  namespace: string,
  schema: TSchema,
  env: Env,
): z.output<TSchema> {
  // `NAME=` in an env file means "not set".
  const provided = Object.fromEntries(
    Object.entries(env).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  );
  const result = schema.safeParse(provided);
  if (!result.success) {
    throw new Error(
      `Invalid ${namespace} configuration:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

/** Schema pieces for environment variables, which always arrive as strings. */
export const envVar = {
  /** A whole number. */
  int: () => z.coerce.number().int(),
  /** `true` or `false` (also 1/0, yes/no). */
  bool: () => z.stringbool(),
  /** A non-empty string. */
  text: () => z.string().min(1),
  /** A URL with one of the given protocols, e.g. ['http', 'https']. */
  url: (...protocols: string[]) =>
    z.url({ protocol: new RegExp(`^(${protocols.join('|')})$`) }),
  /** A comma-separated list, trimmed, without empty items. */
  list: () =>
    z.string().transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
};
