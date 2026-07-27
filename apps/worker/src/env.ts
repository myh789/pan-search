export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;
  TRANSFER_QUEUE: Queue;
  ASSETS?: Fetcher;
  APP_NAME: string;
  SYSTEM_SALT: string;
  ENCRYPT_KEY: string;
  ENCRYPT_IV: string;
  ADMIN_BOOTSTRAP_PASSWORD?: string;
}

export type AppVariables = {
  adminId?: number;
  adminGroup?: number;
  conf?: Record<string, string>;
};
