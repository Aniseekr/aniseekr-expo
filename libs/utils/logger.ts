/**
 * Lightweight logger that mirrors the Swift `Logger.debug/info/warn/error`
 * API used across iOS aniseeker. Debug output is suppressed in production
 * builds so the bundle stays lean and consoles stay quiet.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function format(level: LogLevel, args: unknown[]): unknown[] {
  const tag = `[${level.toUpperCase()}]`;
  return [tag, ...args];
}

export const Logger = {
  debug(...args: unknown[]): void {
    if (isProduction()) return;
    console.debug(...format('debug', args));
  },
  info(...args: unknown[]): void {
    console.info(...format('info', args));
  },
  warn(...args: unknown[]): void {
    console.warn(...format('warn', args));
  },
  error(...args: unknown[]): void {
    console.error(...format('error', args));
  },
};

export type { LogLevel };
