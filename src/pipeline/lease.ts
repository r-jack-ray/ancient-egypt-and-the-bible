import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { mkdir, open, readFile, rm } from "node:fs/promises";

import { errorCode } from "./files.js";

export interface WriterLease {
  path: string;
  token: string;
  release(): Promise<void>;
}

export async function acquireWriterLease(
  purpose: string,
  path = ".tmp/transcript-store/writer.lock",
): Promise<WriterLease> {
  await mkdir(dirname(path), { recursive: true });
  const token = randomUUID();
  const record = {
    schemaVersion: 1,
    purpose,
    pid: process.pid,
    token,
    acquiredAt: new Date().toISOString(),
  };

  try {
    const handle = await open(path, "wx");
    try {
      await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (errorCode(error) === "EEXIST") {
      throw new Error(`Transcript pipeline writer lease already exists: ${path}`);
    }
    throw error;
  }

  return {
    path,
    token,
    async release(): Promise<void> {
      try {
        const value = JSON.parse(await readFile(path, "utf8")) as { token?: unknown };
        if (value.token !== token) {
          throw new Error(`Refusing to release writer lease owned by another process: ${path}`);
        }
        await rm(path);
      } catch (error) {
        if (errorCode(error) !== "ENOENT") {
          throw error;
        }
      }
    },
  };
}

export async function recoverStaleWriterLease(
  path = ".tmp/transcript-store/writer.lock",
): Promise<"none" | "removed"> {
  let record: { pid?: unknown };
  try {
    record = JSON.parse(await readFile(path, "utf8")) as { pid?: unknown };
  } catch (error) {
    if (errorCode(error) === "ENOENT") return "none";
    throw error;
  }
  if (typeof record.pid !== "number" || !Number.isInteger(record.pid) || record.pid <= 0) {
    throw new Error(`Refusing to recover malformed writer lease: ${path}`);
  }
  try {
    process.kill(record.pid, 0);
    throw new Error(`Writer lease process ${record.pid} is still active; refusing recovery.`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("refusing recovery")) throw error;
    if (errorCode(error) !== "ESRCH") {
      throw new Error(`Could not prove writer lease process ${record.pid} is absent.`);
    }
  }
  await rm(path);
  return "removed";
}
