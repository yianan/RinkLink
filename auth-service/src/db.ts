import type { Pool, QueryResult, QueryResultRow } from "pg";
import { recordTiming } from "./timing.js";

const RETRYABLE_PG_CODES = new Set(["08000", "08003", "08006", "57P01", "XX000"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableDatabaseError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null;
  const message = candidate?.message?.toLowerCase() || "";
  return Boolean(
    (candidate?.code && RETRYABLE_PG_CODES.has(candidate.code)) ||
      message.includes("couldn't connect to compute node") ||
      message.includes("connection terminated") ||
      message.includes("timeout"),
  );
}

export async function queryWithRetry<T extends QueryResultRow = QueryResultRow>(
  pool: Pool,
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  let lastError: unknown;
  const delays = [250, 750, 1500, 3000];

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    const startedAt = performance.now();
    try {
      const result = await pool.query<T>(text, values);
      recordTiming("db", performance.now() - startedAt);
      return result;
    } catch (error) {
      recordTiming("db", performance.now() - startedAt);
      lastError = error;
      if (!isRetryableDatabaseError(error) || attempt === delays.length) {
        throw error;
      }
      await sleep(delays[attempt]);
    }
  }

  throw lastError;
}
