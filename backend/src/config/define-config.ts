import { registerAs, type ConfigObject } from '@nestjs/config';
import {
  plainToInstance,
  Transform,
  type ClassConstructor,
} from 'class-transformer';
import { validateSync } from 'class-validator';

export type Env = Record<string, string | undefined>;

/**
 * A config namespace: reads the variables declared in `schema` from the
 * environment, validates them and builds the typed settings a module uses.
 *
 * - Default values live in `.env.defaults`, not in code; secrets in `.env`.
 * - List it in config.module.ts (worker and/or API); it is then global:
 *   inject `@Inject(storageConfig.KEY) config: StorageConfig` anywhere.
 * - `load(env)` builds the settings from a plain object, for tests and for
 *   code outside Nest (the migration CLI).
 */
export function defineConfig<TEnv extends object, TConfig extends object>(
  namespace: string,
  schema: ClassConstructor<TEnv>,
  build: (env: TEnv) => TConfig,
) {
  const load = (env: Env = process.env): TConfig =>
    build(readEnv(namespace, schema, env));
  const factory = registerAs<ConfigObject & TConfig>(
    namespace,
    () => load() as ConfigObject & TConfig,
  );
  return Object.assign(factory, { load });
}

/** The settings type of a namespace, for injection. */
export type ConfigOf<T extends { load: (...args: never[]) => object }> =
  ReturnType<T['load']>;

function readEnv<T extends object>(
  namespace: string,
  schema: ClassConstructor<T>,
  env: Env,
): T {
  // `NAME=` in an env file means "not set".
  const provided = Object.fromEntries(
    Object.entries(env).filter(
      ([, value]) => value !== undefined && value !== '',
    ),
  );
  const values = plainToInstance(schema, provided, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(values);
  if (errors.length > 0) {
    const details = errors
      .flatMap((error) => Object.values(error.constraints ?? {}))
      .join('; ');
    throw new Error(`Invalid ${namespace} configuration: ${details}`);
  }
  return values;
}

/** Fails startup with a readable message when settings contradict each other. */
export function requireThat(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Invalid configuration: ${message}`);
  }
}

/** `true`/`false` from the environment as a real boolean. */
export const ToBoolean = () =>
  Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === true || raw === 'true') return true;
    if (raw === false || raw === 'false') return false;
    return raw;
  });

/** A comma-separated list from the environment, trimmed, without empty items. */
export const ToList = () =>
  Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    return typeof raw === 'string'
      ? raw
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : raw;
  });
