export type RepoRef = {
  name: string;
  slug: string;
  path: string;
  relativeFromRoot: string;
};

export type RepoCompact = {
  repo: RepoRef;
  head: string;
  branch: string;
  lastCommitAt: string;
  lastCommitSubject: string;
  languages: string[];
  purpose: string;
  stack: string[];
  howToRun: string[];
  tree: string;
  signals: Signal[];
  envKeys: string[];
  commits: Commit[];
  readmeExcerpt: string;
  fileCount: number;
  indexedAt: string;
};

export type Signal = {
  kind: "route" | "export" | "type" | "entry";
  label: string;
  file: string;
};

export type Commit = {
  sha: string;
  date: string;
  subject: string;
};

export type SearchHit = {
  path: string;
  title: string;
  repo: string;
  kind: string;
  score: number;
  snippet: string;
};

export type ContextPack = {
  query: string;
  budget: number;
  tokens: number;
  notes: ContextNote[];
  filesToOpen: string[];
};

export type ContextNote = {
  path: string;
  title: string;
  tokens: number;
  body: string;
};

export type IndexState = {
  developmentRoot: string;
  repos: Record<
    string,
    {
      head: string;
      indexedAt: string;
      path: string;
    }
  >;
};

export type IndexJob = {
  id: string;
  status: "idle" | "running" | "done" | "error";
  startedAt: string | null;
  finishedAt: string | null;
  current: string | null;
  indexed: number;
  skipped: number;
  total: number;
  error: string | null;
};
