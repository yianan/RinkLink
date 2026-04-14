import test from "node:test";
import assert from "node:assert/strict";

import { clearSignInFailures, isSignInLocked, recordSignInFailure } from "./lockout.js";

type LockoutRow = {
  email: string;
  failed_attempts: number;
  first_failed_at: Date;
  locked_until: Date | null;
  updated_at: Date;
};

class FakePool {
  row: LockoutRow | null = null;

  async query<T>(sql: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    const email = String(params[0] ?? "");
    const now = new Date();

    if (sql.includes("SELECT locked_until")) {
      if (!this.row || this.row.email !== email) {
        return { rows: [] };
      }
      return { rows: [{ locked_until: this.row.locked_until } as T] };
    }

    if (sql.includes("DELETE FROM auth.sign_in_lockouts")) {
      if (this.row?.email === email) {
        this.row = null;
      }
      return { rows: [] };
    }

    if (sql.includes("INSERT INTO auth.sign_in_lockouts")) {
      if (!this.row || this.row.email !== email) {
        this.row = {
          email,
          failed_attempts: 1,
          first_failed_at: now,
          locked_until: null,
          updated_at: now,
        };
        return { rows: [] };
      }

      const windowFloor = new Date(now.getTime() - 15 * 60 * 1000);
      const outsideWindow = this.row.first_failed_at < windowFloor;
      const nextFailures = outsideWindow ? 1 : this.row.failed_attempts + 1;

      this.row = {
        email,
        failed_attempts: nextFailures,
        first_failed_at: outsideWindow ? now : this.row.first_failed_at,
        locked_until: outsideWindow
          ? null
          : nextFailures >= 5
            ? new Date(now.getTime() + 15 * 60 * 1000)
            : this.row.locked_until,
        updated_at: now,
      };
      return { rows: [] };
    }

    throw new Error(`Unexpected query: ${sql}`);
  }
}

test("lockout engages after five failures and clears on success", async () => {
  const pool = new FakePool();
  const email = "coach@example.com";

  for (let index = 0; index < 5; index += 1) {
    await recordSignInFailure(pool as never, email);
  }

  assert.equal(await isSignInLocked(pool as never, email), true);

  await clearSignInFailures(pool as never, email);
  assert.equal(await isSignInLocked(pool as never, email), false);
});
