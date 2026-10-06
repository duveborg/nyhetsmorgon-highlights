// All logs go to stderr so stdout stays usable for machine-readable output.
export const log = (...args: unknown[]) =>
  console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...args);
