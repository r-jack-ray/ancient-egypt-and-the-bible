import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";

export function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function atomicWriteText(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, "wx");
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await replaceFile(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function atomicWriteJson(path: string, value: unknown): Promise<void> {
  await atomicWriteText(path, stableJson(value));
}

export async function writeJsonIfChanged(path: string, value: unknown): Promise<boolean> {
  const text = stableJson(value);
  try {
    if (await readFile(path, "utf8") === text) {
      return false;
    }
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      throw error;
    }
  }
  await atomicWriteText(path, text);
  return true;
}

async function replaceFile(source: string, destination: string): Promise<void> {
  try {
    await rename(source, destination);
    return;
  } catch (error) {
    if (!["EEXIST", "EPERM", "EACCES"].includes(errorCode(error) ?? "")) {
      throw error;
    }
  }

  const backup = `${destination}.${process.pid}.${randomUUID()}.replace-backup`;
  let movedExisting = false;
  try {
    await rename(destination, backup);
    movedExisting = true;
    await rename(source, destination);
    await rm(backup, { force: true });
  } catch (error) {
    if (movedExisting) {
      try {
        await rename(backup, destination);
      } catch {
        // Preserve the original error; the backup remains beside the destination.
      }
    }
    throw error;
  }
}

export function errorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export function assertPathInside(root: string, candidate: string): void {
  const relativePath = relative(resolve(root), resolve(candidate));
  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Path escapes owned root ${root}: ${candidate}`);
  }
}

export async function readJsonUnknown(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export async function writeDiagnostic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, stableJson(value), "utf8");
}
