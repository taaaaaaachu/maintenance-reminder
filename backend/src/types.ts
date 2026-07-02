export interface AppBindings {
  DB: D1Database;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_CHANNEL_SECRET: string;
  RESEND_API_KEY: string;
  RESEND_FROM_ADDRESS: string;
  PUSHOVER_API_TOKEN: string;
}

export type HonoEnv = { Bindings: AppBindings };
