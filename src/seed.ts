import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ROOT, config, developmentExists } from "./config.ts";

const exec = promisify(execFile);

export { developmentExists };

export async function seedFixturesIfNeeded(): Promise<boolean> {
  if (process.env.SEED_FIXTURES !== "1") return false;
  if (developmentExists()) return false;
  const source = path.join(ROOT, "fixtures", "development");
  await copyDir(source, config.developmentRoot);
  const repos = await fs.readdir(config.developmentRoot, { withFileTypes: true });
  for (const entry of repos) {
    if (!entry.isDirectory()) continue;
    const repo = path.join(config.developmentRoot, entry.name);
    await exec("git", ["init"], { cwd: repo });
    await exec("git", ["config", "user.email", "dev-archive@local"], { cwd: repo });
    await exec("git", ["config", "user.name", "Dev Archive"], { cwd: repo });
    await exec("git", ["add", "."], { cwd: repo });
    await exec("git", ["commit", "-m", "seed fixture"], { cwd: repo });
  }
  return true;
}

async function copyDir(from: string, to: string): Promise<void> {
  await fs.mkdir(to, { recursive: true });
  const entries = await fs.readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDir(src, dest);
    } else {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
    }
  }
}
