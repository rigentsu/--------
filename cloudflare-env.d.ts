declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    MS_FOUNDRY_ENDPOINT?: string;
    MS_FOUNDRY_DEPLOYMENT_NAME?: string;
    MS_FOUNDRY_API_VERSION?: string;
    MS_FOUNDRY_API_KEY?: string;
    GOOGLE_MAPS_API_KEY?: string;
  }
}
