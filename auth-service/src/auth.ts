import "dotenv/config";

import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { haveIBeenPwned, jwt, twoFactor } from "better-auth/plugins";
import type { BetterAuthPlugin } from "better-auth";
import { Pool } from "pg";

import {
  requireBetterAuthSecret,
  resolveApiAudience,
  resolveBetterAuthUrl,
  resolvePublicAppUrl,
  resolveTrustedOrigins,
} from "./config.js";
import { sendResetPasswordEmail, sendVerificationEmail } from "./email.js";

const databaseUrl = process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for auth-service");
}

const baseURL = resolveBetterAuthUrl();

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL is required for auth-service");
}

const frontendUrl = resolvePublicAppUrl();
const trustedOrigins = resolveTrustedOrigins();
const betterAuthSecret = requireBetterAuthSecret();

if (!frontendUrl) {
  throw new Error("FRONTEND_URL is required for auth-service");
}

const apiAudience = resolveApiAudience();

if (!apiAudience) {
  throw new Error("API_AUDIENCE is required for auth-service");
}

export const pool = new Pool({
  connectionString: databaseUrl,
});

type AppUserAccessRow = {
  auth_state: string;
  updated_at: Date | string;
};

async function getAppUserAccessRowByAuthId(authId: string): Promise<AppUserAccessRow | null> {
  const result = await pool.query<AppUserAccessRow>(
    `
      SELECT auth_state, updated_at
      FROM public.app_users
      WHERE auth_id = $1
      LIMIT 1
    `,
    [authId],
  );
  return result.rows[0] ?? null;
}

export async function isAuthDisabledForEmail(email: string | null | undefined): Promise<boolean> {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) {
    return false;
  }
  const result = await pool.query<{ auth_state: string }>(
    `
      SELECT auth_state
      FROM public.app_users
      WHERE lower(email) = $1
      LIMIT 1
    `,
    [normalizedEmail],
  );
  return result.rows[0]?.auth_state === "disabled";
}

async function isAuthSignInAllowed(authId: string): Promise<boolean> {
  const appUser = await getAppUserAccessRowByAuthId(authId);
  return appUser?.auth_state !== "disabled";
}

const SIGN_IN_PATHS = new Set([
  "/sign-in/email",
  "/sign-in/username",
  "/sign-in/phone-number",
]);

// Marks a session as having satisfied the 2FA challenge when the sign-in
// path survived the twoFactor plugin's after-hook while the user has 2FA
// enrolled — i.e. the trust-device cookie was valid on this device.
const mfaSessionFlagPlugin: BetterAuthPlugin = {
  id: "mfa-session-flag",
  hooks: {
    after: [
      {
        matcher: (ctx) => typeof ctx.path === "string" && SIGN_IN_PATHS.has(ctx.path),
        handler: createAuthMiddleware(async (ctx) => {
          const newSession = ctx.context.newSession;
          if (!newSession?.session) {
            return;
          }
          const user = newSession.user as { twoFactorEnabled?: boolean } | undefined;
          if (!user?.twoFactorEnabled) {
            return;
          }
          await ctx.context.internalAdapter.updateSession(newSession.session.token, {
            twoFactorVerified: true,
          });
        }),
      },
    ],
  },
};

function socialProviderConfig() {
  const providers: Record<string, { clientId: string; clientSecret: string }> = {};

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }

  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
    providers.microsoft = {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    };
  }

  if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
    providers.apple = {
      clientId: process.env.APPLE_CLIENT_ID,
      clientSecret: process.env.APPLE_CLIENT_SECRET,
    };
  }

  return providers;
}

export const auth = betterAuth({
  appName: "RinkLink",
  baseURL,
  secret: betterAuthSecret,
  database: pool,
  databaseHooks: {
    session: {
      create: {
        async before(session, context) {
          if (!(await isAuthSignInAllowed(session.userId))) {
            return false;
          }
          const path = context?.path;
          if (typeof path === "string" && path.startsWith("/two-factor/verify-")) {
            return { data: { ...session, twoFactorVerified: true } };
          }
          return { data: session };
        },
      },
    },
  },
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for"],
    },
    trustedProxyHeaders: true,
  },
  trustedOrigins: [...trustedOrigins, "https://appleid.apple.com"],
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/forget-password": { window: 3600, max: 3 },
      "/reset-password": { window: 3600, max: 5 },
    },
  },
  session: {
    additionalFields: {
      twoFactorVerified: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
    },
    cookieCache: {
      async version(session, user) {
        const appUser = await getAppUserAccessRowByAuthId(user.id);
        if (!appUser) {
          return "missing";
        }
        const updatedAt = new Date(appUser.updated_at).toISOString();
        const mfa = (session as { twoFactorVerified?: boolean } | null | undefined)?.twoFactorVerified
          ? "mfa"
          : "nomfa";
        return `${appUser.auth_state}:${updatedAt}:${mfa}`;
      },
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      allowDifferentEmails: false,
      disableImplicitLinking: false,
      trustedProviders: [],
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail(user.email, url);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url);
    },
  },
  socialProviders: socialProviderConfig(),
  plugins: [
    haveIBeenPwned(),
    twoFactor({
      issuer: "RinkLink",
    }),
    mfaSessionFlagPlugin,
    jwt({
      jwks: {
        jwksPath: "/.well-known/jwks.json",
      },
      jwt: {
        audience: [apiAudience],
        definePayload: ({ user, session }) => ({
          email: user.email,
          email_verified: user.emailVerified,
          name: user.name,
          mfa_verified: Boolean(
            (session as { twoFactorVerified?: boolean } | null | undefined)?.twoFactorVerified,
          ),
        }),
      },
    }),
  ],
});
