/**
 * Env files the app reads, strongest first; real environment variables win
 * over both. Tests skip .env so a developer's local secrets or overrides
 * (say SCREENING_MODEL=gemini) never leak into a test run.
 */
export function envFiles(nodeEnv = process.env.NODE_ENV): string[] {
  return nodeEnv === 'test' ? ['.env.defaults'] : ['.env', '.env.defaults'];
}
