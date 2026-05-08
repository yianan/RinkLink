import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { recordTiming } from "./timing.js";

type ScryptConfig = {
  N: number;
  r: number;
  p: number;
  dkLen: number;
};

const LEGACY_SCRYPT_CONFIG: ScryptConfig = {
  N: 16384,
  r: 16,
  p: 1,
  dkLen: 64,
};

const AGGRESSIVE_SCRYPT_CONFIG: ScryptConfig = {
  N: 4096,
  r: 8,
  p: 1,
  dkLen: 64,
};

function maxMemoryFor(config: ScryptConfig): number {
  return 128 * config.N * config.r * 2;
}

async function derivePasswordKey(password: string, salt: string, config: ScryptConfig): Promise<Buffer> {
  const startedAt = performance.now();
  return await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      config.dkLen,
      {
        N: config.N,
        r: config.r,
        p: config.p,
        maxmem: maxMemoryFor(config),
      },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(Buffer.from(key));
      },
    );
  }).finally(() => {
    recordTiming("scrypt", performance.now() - startedAt);
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const config = AGGRESSIVE_SCRYPT_CONFIG;
  const key = await derivePasswordKey(password, salt, config);
  return `scrypt$v=2$n=${config.N}$r=${config.r}$p=${config.p}$dk=${config.dkLen}$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  const parsed = parsePasswordHash(hash);
  if (!parsed) {
    return false;
  }
  const { config, key, salt } = parsed;
  const expected = Buffer.from(key, "hex");
  const actual = await derivePasswordKey(password, salt, config);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function parsePasswordHash(hash: string): { salt: string; key: string; config: ScryptConfig } | null {
  if (hash.startsWith("scrypt$")) {
    const parts = hash.split("$");
    if (parts.length !== 8) {
      return null;
    }
    const values = Object.fromEntries(parts.slice(1, 6).map((part) => part.split("=", 2)));
    const config = {
      N: Number(values.n),
      r: Number(values.r),
      p: Number(values.p),
      dkLen: Number(values.dk),
    };
    if (
      values.v !== "2" ||
      !Number.isInteger(config.N) ||
      !Number.isInteger(config.r) ||
      !Number.isInteger(config.p) ||
      !Number.isInteger(config.dkLen)
    ) {
      return null;
    }
    return { salt: parts[6] ?? "", key: parts[7] ?? "", config };
  }

  const [salt, key] = hash.split(":");
  if (!salt || !key) {
    return null;
  }
  return { salt, key, config: LEGACY_SCRYPT_CONFIG };
}
