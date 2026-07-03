declare global {
  interface Env {
    LINE_CHANNEL_ACCESS_TOKEN: string;
    LINE_CHANNEL_SECRET: string;
    RESEND_API_KEY: string;
    RESEND_FROM_ADDRESS: string;
    PUSHOVER_API_TOKEN: string;
    APP_BASE_URL: string;
    ADMIN_EMAIL: string;
    LINE_INVITE_URL: string;
    DEV_HOUSEHOLD_EMAIL?: string;
  }
  namespace Cloudflare {
    interface Env {
      LINE_CHANNEL_ACCESS_TOKEN: string;
      LINE_CHANNEL_SECRET: string;
      RESEND_API_KEY: string;
      RESEND_FROM_ADDRESS: string;
      PUSHOVER_API_TOKEN: string;
      APP_BASE_URL: string;
      ADMIN_EMAIL: string;
      LINE_INVITE_URL: string;
      DEV_HOUSEHOLD_EMAIL?: string;
    }
  }
}

export {};
