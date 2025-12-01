// Logging utility for consistent console output with arrow functions

const prefix = '[VideoChunkProcessor]';

export const log = (...args: any[]) => {
  console.log(prefix, ...args);
};

export const error = (...args: any[]) => {
  console.error(prefix, '[ERROR]', ...args);
};

export const warn = (...args: any[]) => {
  console.warn(prefix, '[WARN]', ...args);
};

export const info = (...args: any[]) => {
  console.info(prefix, '[INFO]', ...args);
};

export const debug = (...args: any[]) => {
  if (__DEV__) {
    console.log(prefix, '[DEBUG]', ...args);
  }
};

export const trace = (...args: any[]) => {
  if (__DEV__) {
    console.trace(prefix, '[TRACE]', ...args);
  }
};

// Export as default object for convenient importing (maintaining compatibility)
export const Logger = {
  log,
  error,
  warn,
  info,
  debug,
  trace,
};
