export interface AppBindings {
  DB: D1Database;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_CHANNEL_SECRET: string;
  RESEND_API_KEY: string;
  RESEND_FROM_ADDRESS: string;
  PUSHOVER_API_TOKEN: string;
  APP_BASE_URL: string;
  ADMIN_EMAIL: string;
  LINE_INVITE_URL: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  DEV_HOUSEHOLD_EMAIL?: string;
}

export interface AppVariables {
  householdId: string;
  actorEmail: string;
}

export type HonoEnv = { Bindings: AppBindings; Variables: AppVariables };
