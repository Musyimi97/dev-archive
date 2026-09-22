import { config } from "./config.ts";
import { buildContextPack, formatPackMarkdown } from "./context.ts";
import { runIndex } from "./index-job.ts";
import { searchVault } from "./search.ts";
import { ensureVault } from "./vault.ts";

const [, , cmd, ...rest] = process.argv;

if (cmd === "vault") {
  await ensureVault();
  console.log(config.vaultPath);
  console.log("Obsidian welcome screen → Open folder as vault → choose that folder.");
  process.exit(0);
}

if (cmd === "index") {
  const force = rest.includes("--force");
  const job = await runIndex(force);
  console.log(JSON.stringify(job, null, 2));
  process.exit(job.status === "error" ? 1 : 0);
}

if (cmd === "search") {
  const q = rest.filter((a) => !a.startsWith("--")).join(" ");
  const hits = await searchVault(q, 16);
  for (const hit of hits) {
    console.log(`${hit.score.toString().padStart(3)}  ${hit.path}  ${hit.snippet}`);
  }
  process.exit(0);
}

if (cmd === "context") {
  const q = rest.filter((a) => a !== "--md" && !a.startsWith("--budget")).join(" ");
  const budgetFlag = rest.find((a) => a.startsWith("--budget="));
  const budget = budgetFlag ? Number(budgetFlag.split("=")[1]) : config.defaultBudget;
  const pack = await buildContextPack(q, budget);
  if (rest.includes("--md")) {
    console.log(formatPackMarkdown(pack));
  } else {
    console.log(JSON.stringify(pack, null, 2));
  }
  process.exit(0);
}

console.error("Usage: tsx src/cli.ts <vault|index|search|context> [query]");
process.exit(1);
