import "dotenv/config";

import nodemailer from "nodemailer";

import { resolvePublicAppUrl } from "./config.js";

type EmailConfig = {
  brevoApiKey?: string;
  brevoApiUrl: string;
  from: string;
  frontendUrl: string;
  host: string;
  mode: "brevo-api" | "smtp";
  port: number;
  secure: boolean;
  startTls: boolean;
  user?: string;
  pass?: string;
};

type MailPayload = {
  html: string;
  subject: string;
  text: string;
  to: string;
};

let transportPromise: Promise<nodemailer.Transporter> | null = null;

function loadConfig(): EmailConfig | null {
  const brevoApiKey = process.env.BREVO_API_KEY?.trim();
  const brevoApiUrl = process.env.BREVO_API_URL?.trim() || "https://api.brevo.com/v3/smtp/email";
  const host = process.env.SMTP_HOST?.trim();
  const fromEmail = process.env.EMAIL_FROM_ADDRESS?.trim();
  const frontendUrl = resolvePublicAppUrl();

  if ((!brevoApiKey && !host) || !fromEmail || !frontendUrl) {
    return null;
  }

  const fromName = process.env.EMAIL_FROM_NAME?.trim() || "RinkLink";
  const port = Number(process.env.SMTP_PORT || "587");
  const secure = ["1", "true", "yes", "on"].includes((process.env.SMTP_USE_SSL || "").trim().toLowerCase());
  const startTls = secure
    ? false
    : !["0", "false", "no", "off"].includes((process.env.SMTP_STARTTLS || "true").trim().toLowerCase());

  return {
    brevoApiKey: brevoApiKey || undefined,
    brevoApiUrl,
    from: `${fromName} <${fromEmail}>`,
    frontendUrl: frontendUrl.replace(/\/+$/, ""),
    host: host || "",
    mode: brevoApiKey ? "brevo-api" : "smtp",
    port,
    secure,
    startTls,
    user: process.env.SMTP_USERNAME?.trim() || undefined,
    pass: process.env.SMTP_PASSWORD || undefined,
  };
}

async function getTransport(): Promise<nodemailer.Transporter> {
  if (!transportPromise) {
    const config = loadConfig();
    if (!config) {
      throw new Error("SMTP email delivery is not configured");
    }
    transportPromise = Promise.resolve(
      nodemailer.createTransport({
        auth: config.user ? { pass: config.pass, user: config.user } : undefined,
        host: config.host,
        port: config.port,
        requireTLS: config.startTls,
        secure: config.secure,
      }),
    );
  }
  return transportPromise;
}

function logFallback(kind: string, to: string, subject: string, text: string) {
  console.info(`[auth-service] ${kind} email fallback for ${to}: ${subject}`);
  console.info(text);
}

async function sendMail(kind: string, payload: MailPayload): Promise<void> {
  const config = loadConfig();
  if (!config) {
    logFallback(kind, payload.to, payload.subject, payload.text);
    return;
  }

  if (config.mode === "brevo-api") {
    const response = await fetch(config.brevoApiUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": config.brevoApiKey || "",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: {
          email: process.env.EMAIL_FROM_ADDRESS?.trim(),
          name: process.env.EMAIL_FROM_NAME?.trim() || "RinkLink",
        },
        to: [{ email: payload.to }],
        subject: payload.subject,
        textContent: payload.text,
        htmlContent: payload.html,
      }),
    });
    if (!response.ok) {
      throw new Error(`Brevo API request failed with ${response.status}: ${await response.text()}`);
    }
    return;
  }

  const transport = await getTransport();
  await transport.sendMail({
    from: config.from,
    html: payload.html,
    subject: payload.subject,
    text: payload.text,
    to: payload.to,
  });
}

function appFooter(frontendUrl: string): string {
  return `If you did not expect this email, you can ignore it. Manage your account at ${frontendUrl}.`;
}

export async function sendVerificationEmail(to: string, verificationUrl: string): Promise<void> {
  const config = loadConfig();
  const frontendUrl = config?.frontendUrl || resolvePublicAppUrl();
  const subject = "Verify your RinkLink email";
  const text = [
    "Welcome to RinkLink.",
    "",
    "Verify your email address to finish setting up your account:",
    verificationUrl,
    "",
    "After verification, you can review invites, request access, and continue onboarding.",
    "",
    appFooter(frontendUrl),
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin:0 0 12px">Verify your RinkLink email</h2>
      <p style="margin:0 0 16px">Welcome to RinkLink. Verify your email address to finish setting up your account.</p>
      <p style="margin:0 0 24px">
        <a href="${verificationUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">
          Verify email
        </a>
      </p>
      <p style="margin:0 0 16px">If the button does not work, open this link directly:</p>
      <p style="margin:0 0 24px"><a href="${verificationUrl}">${verificationUrl}</a></p>
      <p style="margin:0;color:#475569">After verification, you can review invites, request access, and continue onboarding.</p>
      <p style="margin:16px 0 0;color:#64748b">${appFooter(frontendUrl)}</p>
    </div>
  `;
  console.info(`[auth-service] sending verification email to ${to}`);
  try {
    await sendMail("verification", { html, subject, text, to });
    console.info(`[auth-service] verification email queued for ${to}`);
  } catch (error) {
    console.error(`[auth-service] failed to send verification email to ${to}`, error);
    throw error;
  }
}

export async function sendResetPasswordEmail(to: string, resetUrl: string): Promise<void> {
  const config = loadConfig();
  const frontendUrl = config?.frontendUrl || resolvePublicAppUrl();
  const subject = "Reset your RinkLink password";
  const text = [
    "A password reset was requested for your RinkLink account.",
    "",
    "Use this secure link to choose a new password:",
    resetUrl,
    "",
    appFooter(frontendUrl),
  ].join("\n");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin:0 0 12px">Reset your RinkLink password</h2>
      <p style="margin:0 0 16px">A password reset was requested for your RinkLink account.</p>
      <p style="margin:0 0 24px">
        <a href="${resetUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600">
          Reset password
        </a>
      </p>
      <p style="margin:0 0 16px">If the button does not work, open this link directly:</p>
      <p style="margin:0 0 24px"><a href="${resetUrl}">${resetUrl}</a></p>
      <p style="margin:16px 0 0;color:#64748b">${appFooter(frontendUrl)}</p>
    </div>
  `;
  console.info(`[auth-service] sending reset-password email to ${to}`);
  try {
    await sendMail("password reset", { html, subject, text, to });
    console.info(`[auth-service] reset-password email queued for ${to}`);
  } catch (error) {
    console.error(`[auth-service] failed to send reset-password email to ${to}`, error);
    throw error;
  }
}
