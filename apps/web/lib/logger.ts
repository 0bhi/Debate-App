// Browser-compatible logger that mimics the server logger interface
export const logger = {
  info: (message: string, meta?: any) => {
    console.log(`[INFO] ${message}`, meta);
  },
  error: (message: string, meta?: any) => {
    console.error(`[ERROR] ${message}`, meta);
  },
  warn: (message: string, meta?: any) => {
    console.warn(`[WARN] ${message}`, meta);
  },
  debug: (message: string, meta?: any) => {
    console.debug(`[DEBUG] ${message}`, meta);
  },
};
