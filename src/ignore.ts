const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".turbo",
  ".cache",
  ".venv",
  ".obsidian",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "vendor",
  "lib",
  "cache",
  "broadcast",
  "target",
  "__pycache__",
  "out",
  "tmp",
  "temp",
  ".idea",
  ".vscode",
]);

const SKIP_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "go.sum",
  "cargo.lock",
  ".ds_store",
]);

const CODE_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".go",
  ".py",
  ".rs",
  ".java",
  ".rb",
  ".php",
  ".cs",
  ".kt",
  ".swift",
  ".sql",
  ".sol",
  ".vy",
]);

const DOC_NAMES = new Set([
  "readme.md",
  "readme",
  "contributing.md",
  "agents.md",
  "architecture.md",
]);

const MANIFEST_NAMES = new Set([
  "package.json",
  "go.mod",
  "cargo.toml",
  "pyproject.toml",
  "requirements.txt",
  "dockerfile",
  "compose.yaml",
  "docker-compose.yml",
  ".env.template",
  ".env.example",
  "makefile",
  "foundry.toml",
  "hardhat.config.ts",
  "hardhat.config.js",
]);

export function skipDir(name: string): boolean {
  return SKIP_DIRS.has(name) || name.startsWith(".");
}

export function interestingFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (SKIP_FILES.has(lower)) return false;
  if (DOC_NAMES.has(lower) || MANIFEST_NAMES.has(lower)) return true;
  const ext = extension(lower);
  return CODE_EXT.has(ext);
}

export function isManifest(name: string): boolean {
  return MANIFEST_NAMES.has(name.toLowerCase());
}

export function isReadme(name: string): boolean {
  return name.toLowerCase().startsWith("readme");
}

export function languageFromFile(name: string): string | null {
  switch (extension(name.toLowerCase())) {
    case ".ts":
    case ".tsx":
      return "TypeScript";
    case ".js":
    case ".jsx":
    case ".mjs":
    case ".cjs":
      return "JavaScript";
    case ".go":
      return "Go";
    case ".py":
      return "Python";
    case ".rs":
      return "Rust";
    case ".java":
      return "Java";
    case ".rb":
      return "Ruby";
    case ".sol":
      return "Solidity";
    case ".vy":
      return "Vyper";
    default:
      return null;
  }
}

function extension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i) : "";
}
