// Environment access in one place. Secrets are read here and nowhere else, and are never logged.
// On Workers with nodejs_compat, secrets and vars appear on process.env (the database URL is read the same way).
export type Env = Record<string, string | undefined>;

export function processEnv(): Env {
  return typeof process !== "undefined" ? (process.env as Env) : {};
}

/** The HMAC key for the entitlement cookie. Shorter than 32 characters counts as not set. */
export function entitlementSecret(env: Env): string | null {
  const s = env.ENTITLEMENT_SECRET;
  return s && s.length >= 32 ? s : null;
}

/** The only hosts the dev unlock answers on, so a production deploy with the flag set by mistake still says 404. */
export const DEV_HOSTS = ["localhost", "127.0.0.1"];

/** The dev unlock exists only when asked for, only while no real payment key is set, and only on a local host. */
export function devUnlockEnabled(env: Env, hostname?: string): boolean {
  return env.ALLOW_DEV_UNLOCK === "1" && !env.STRIPE_SECRET_KEY && hostname !== undefined && DEV_HOSTS.includes(hostname);
}
