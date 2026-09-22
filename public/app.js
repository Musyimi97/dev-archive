const $ = (id) => document.getElementById(id);

const state = {
  lastHits: [],
};

async function api(path, options) {
  const res = await fetch(path, {
    cache: "no-store",
    headers: { "content-type": "application/json" },
    ...options,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function setBanner(message, isError = false) {
  const el = $("banner");
  if (!message) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.className = `status${isError ? " error" : ""}`;
  el.textContent = message;
}

function renderRepos(status) {
  $("dev-path").textContent = status.developmentRoot;
  $("vault-path").textContent = status.vaultPath;
  $("repo-count").textContent = String(status.repoCount);
  $("note-count").textContent = String(status.noteCount);
  $("server-host").textContent = status.hostname || "unknown";
  $("server-pid").textContent = status.pid != null ? String(status.pid) : "unknown";
  $("server-cwd").textContent = status.cwd || "unknown";
  const job = status.job;
  if (job.status === "running") {
    $("job-line").textContent = `Indexing ${job.current || "…"} (${job.indexed + job.skipped}/${job.total})`;
  } else if (job.status === "error") {
    $("job-line").textContent = job.error;
  } else if (job.status === "done") {
    $("job-line").textContent = `Last index: ${job.indexed} written, ${job.skipped} unchanged`;
  } else {
    $("job-line").textContent = status.developmentExists
      ? "Ready — search instead of opening the repo."
      : "Point DEVELOPMENT_ROOT at your Development folder.";
  }

  if (job.status === "error") {
    setBanner(job.error || "Index failed.", true);
  } else if (!status.developmentExists) {
    setBanner(
      `No Development folder at ${status.developmentRoot}. Index will not write notes until this path exists.`,
      true,
    );
  } else if (status.repoCount === 0) {
    setBanner(
      `Found ${status.developmentRoot}, but no project folders to index.`,
    );
  } else {
    setBanner(
      `Obsidian must open this exact folder: ${status.vaultPath}. If Graph view is empty, you are in a different vault.`,
    );
  }

  $("repo-list").innerHTML = status.repos
    .map(
      (repo) => `
      <a href="#" data-q="${escapeAttr(repo.name)}">
        <strong>${escapeHtml(repo.name)}</strong>
        <span>${escapeHtml(repo.head || "not indexed yet")}</span>
      </a>`,
    )
    .join("");
}

function renderHits(hits) {
  state.lastHits = hits;
  const root = $("hits");
  if (!hits.length) {
    root.classList.add("empty-block");
    root.innerHTML = `<p class="empty">No notes matched. Re-index if the repo is new, or try a route / symbol name.</p>`;
    return;
  }
  root.classList.remove("empty-block");
  root.innerHTML = hits
    .map(
      (hit, i) => `
      <article class="hit">
        <button type="button" data-path="${escapeAttr(hit.path)}" data-index="${i}">
          <span class="kind">${escapeHtml(hit.kind)}</span>
          <strong>${escapeHtml(hit.title)}</strong>
          <em>${escapeHtml(hit.path)}</em>
          <em>${escapeHtml(hit.snippet)}</em>
        </button>
      </article>`,
    )
    .join("");
}

function renderPack(pack, query) {
  const budget = $("budget").value || "1800";
  $("curl").textContent = `curl "http://127.0.0.1:${location.port}/api/context?q=${encodeURIComponent(query)}&budget=${budget}&format=md"`;
  $("pack-meta").textContent = `${pack.tokens} tokens used of ${pack.budget} · ${pack.notes.length} notes`;
  const files = pack.filesToOpen?.length
    ? `<div class="files">${pack.filesToOpen.map((f) => `<span>${escapeHtml(f)}</span>`).join("")}</div>`
    : "";
  const notes = pack.notes
    .map(
      (note) => `
      <section>
        <h3>${escapeHtml(note.title)}</h3>
        <p class="pack-meta-line">${escapeHtml(note.path)} · ${note.tokens} tokens</p>
        <pre class="note-chunk">${escapeHtml(clip(note.body, 1600))}</pre>
      </section>`,
    )
    .join("");
  $("pack").classList.remove("empty-block");
  $("pack").innerHTML = `${files}${notes || `<p class="empty">Nothing compact enough matched that query.</p>`}`;
}

async function openNote(rel) {
  const data = await api(`/api/notes/${rel}`);
  $("note-panel").hidden = false;
  $("note-title").textContent = rel.split("/").slice(-1)[0].replace(".md", "");
  $("note-path").textContent = rel;
  $("note-body").textContent = data.body;
  $("note-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function refreshStatus() {
  const status = await api("/api/status");
  renderRepos(status);
  $("index-btn").disabled = status.job.status === "running";
  return status;
}

async function loadContext(query) {
  const budget = Number($("budget").value || 1800);
  const [search, pack] = await Promise.all([
    api(`/api/search?q=${encodeURIComponent(query)}`),
    api(`/api/context?q=${encodeURIComponent(query)}&budget=${budget}`),
  ]);
  renderHits(search.hits);
  renderPack(pack, query);
}

$("search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = $("q").value.trim();
  if (!query) return;
  try {
    await loadContext(query);
  } catch (error) {
    setBanner(error.message, true);
  }
});

$("index-btn").addEventListener("click", async () => {
  $("index-btn").disabled = true;
  $("job-line").textContent = "Indexing Development…";
  try {
    await api("/api/index", { method: "POST", body: JSON.stringify({ force: true }) });
  } catch (error) {
    setBanner(error.message, true);
  }
  try {
    await refreshStatus();
  } catch (error) {
    setBanner(error.message, true);
    $("index-btn").disabled = false;
  }
});

$("repo-list").addEventListener("click", async (event) => {
  const link = event.target.closest("a[data-q]");
  if (!link) return;
  event.preventDefault();
  $("q").value = link.dataset.q;
  await loadContext(link.dataset.q);
});

$("hits").addEventListener("click", async (event) => {
  const btn = event.target.closest("button[data-path]");
  if (!btn) return;
  document.querySelectorAll(".hit").forEach((el) => el.classList.remove("active"));
  btn.parentElement.classList.add("active");
  await openNote(btn.dataset.path);
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function clip(text, max) {
  return text.length > max ? `${text.slice(0, max).trim()}…` : text;
}

$("curl").textContent = `curl "http://127.0.0.1:${location.port}/api/context?q=auth&budget=1800&format=md"`;

await refreshStatus();
