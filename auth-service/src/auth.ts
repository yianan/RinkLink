import "dotenv/config";

import { betterAuth } from "better-auth";
import { haveIBeenPwned, jwt, twoFactor } from "better-auth/plugins";
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
    jwt({
      jwks: {
        jwksPath: "/.well-known/jwks.json",
      },
      jwt: {
        audience: [apiAudience],
        definePayload: ({ user }) => ({
          email: user.email,
          email_verified: user.emailVerified,
          name: user.name,
          mfa_verified: Boolean((user as { twoFactorEnabled?: boolean }).twoFactorEnabled),
        }),
      },
    }),
  ],
});
