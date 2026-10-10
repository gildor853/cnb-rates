import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CnbRatesError, type ErrorCode } from "../src/index.js";

export function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

export function codeOf(fn: () => unknown): ErrorCode | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof CnbRatesError) return err.code;
    throw err;
  }
  return undefined;
}

export async function asyncCodeOf(fn: () => Promise<unknown>): Promise<CnbRatesError | undefined> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof CnbRatesError) return err;
    throw err;
  }
  return undefined;
}
