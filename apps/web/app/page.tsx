"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
type User = { id: string; email: string; demo: boolean };
type PrivateFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
};
type Share = {
  id: string;
  expiresAt: string;
  maxDownloads: number;
  downloads: number;
  revokedAt: string | null;
  passwordProtected: boolean;
};
type Audit = {
  id: string;
  action: string;
  resourceId: string | null;
  createdAt: string;
};
export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [register, setRegister] = useState(false);
  const [files, setFiles] = useState<PrivateFile[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PrivateFile | null>(null);
  const [shares, setShares] = useState<Share[]>([]);
  const [shareUrl, setShareUrl] = useState("");
  const [audit, setAudit] = useState<Audit[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  useEffect(() => {
    api<{ user: User }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  async function loadFiles() {
    const r = await api<{ files: PrivateFile[]; total: number }>(
      `/files?page=${page}&q=${encodeURIComponent(search)}`,
    );
    setFiles(r.files);
    setTotal(r.total);
  }
  async function loadAudit() {
    const r = await api<{ events: Audit[]; total: number }>(
      `/audit?page=${auditPage}`,
    );
    setAudit(r.events);
    setAuditTotal(r.total);
  }
  async function loadShares(file: PrivateFile) {
    const r = await api<{ shares: Share[] }>(`/files/${file.id}/shares`);
    setShares(r.shares);
  }
  useEffect(() => {
    if (user) loadFiles().catch((e) => setError(e.message));
  }, [user, page, search]);
  useEffect(() => {
    if (user) loadAudit().catch((e) => setError(e.message));
  }, [user, auditPage]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    await Promise.all([loadFiles(), loadAudit()]);
  }
  function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void action(async () => {
      const r = await api<{ user: User }>(
        register ? "/auth/register" : "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            email: form.get("email"),
            password: form.get("password"),
          }),
        },
      );
      setUser(r.user);
    });
  }
  function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    void action(async () => {
      await api("/files", { method: "POST", body: form });
      element.reset();
      setPage(1);
      await refresh();
      setMessage("File encrypted and uploaded.");
    });
  }
  function createShare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    void action(async () => {
      const password = String(form.get("password") || "");
      const r = await api<{ path: string }>(`/files/${selected.id}/shares`, {
        method: "POST",
        body: JSON.stringify({
          expiresInHours: Number(form.get("hours")),
          maxDownloads: Number(form.get("downloads")),
          ...(password ? { password } : {}),
        }),
      });
      setShareUrl(window.location.origin + r.path);
      await loadShares(selected);
      await loadAudit();
    });
  }
  if (loading)
    return (
      <main>
        <h1>Secure File Sharing</h1>
        <p>Loading session…</p>
      </main>
    );
  return (
    <main>
      <header>
        <h1>Secure File Sharing</h1>
        {user && (
          <div className="row">
            <span>{user.demo ? "Demo account" : user.email}</span>
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await api("/auth/logout", { method: "POST" });
                  setUser(null);
                  setFiles([]);
                  setSelected(null);
                  setShareUrl("");
                  setAudit([]);
                  setPage(1);
                  setAuditPage(1);
                  setSearch("");
                })
              }
            >
              Sign out
            </button>
          </div>
        )}
      </header>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {!user ? (
        <div className="auth">
          <h2>{register ? "Create an account" : "Sign in"}</h2>
          <p>
            Store private files and share them with an expiry and a download
            limit.
          </p>
          <form onSubmit={login}>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={12}
                maxLength={128}
                required
              />
            </label>
            <small>Use at least 12 characters.</small>
            <div className="row">
              <button disabled={busy}>
                {register ? "Create account" : "Sign in"}
              </button>
              <button type="button" onClick={() => setRegister(!register)}>
                {register ? "Use existing account" : "Register"}
              </button>
            </div>
          </form>
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const r = await api<{ user: User }>("/auth/demo", {
                  method: "POST",
                  body: "{}",
                });
                setUser(r.user);
              })
            }
          >
            Try isolated demo
          </button>
          <p className="muted">
            Demo files are removed after 24 hours. Use sample files only.
          </p>
        </div>
      ) : (
        <>
          <p className="muted">
            Files and filenames use server-side encryption. The server can
            decrypt your files. Limit: 100 files, 10 MiB each.
          </p>
          {user.demo && (
            <p className="notice">
              Isolated demo account. Your session lasts 8 hours; demo files are
              removed after 24 hours.
            </p>
          )}
          <h2>Upload a file</h2>
          <form onSubmit={upload} className="row">
            <label>
              File
              <input
                type="file"
                name="file"
                accept=".txt,.pdf,.png,.jpg,.jpeg"
                required
              />
            </label>
            <button disabled={busy}>Upload</button>
            <small>UTF-8 TXT, PDF, PNG or JPEG · up to 10 MiB</small>
          </form>
          <h2>Your files</h2>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearch(query);
            }}
          >
            <label>
              Search filename
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={100}
              />
            </label>
            <button>Search</button>
          </form>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.id}>
                    <td className="filename">
                      {file.name}
                      <br />
                      <small>{file.type}</small>
                    </td>
                    <td>{(file.size / 1024).toFixed(1)} KiB</td>
                    <td>{new Date(file.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="row">
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              const r = await api<{ url: string }>(
                                `/files/${file.id}/download`,
                                { method: "POST", body: "{}" },
                              );
                              window.location.assign(r.url);
                              await loadAudit();
                            })
                          }
                        >
                          Download
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              setShareUrl("");
                              setSelected(file);
                              await loadShares(file);
                            })
                          }
                        >
                          Share
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              await api(`/files/${file.id}`, {
                                method: "DELETE",
                              });
                              if (selected?.id === file.id) {
                                setSelected(null);
                                setShareUrl("");
                              }
                              await refresh();
                              setMessage(
                                "File deleted; associated links are revoked.",
                              );
                            })
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!files.length && (
                  <tr>
                    <td colSpan={4}>No files found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous files
            </button>
            <span>
              Page {page} · {total} files
            </span>
            <button
              disabled={page * 10 >= total}
              onClick={() => setPage(page + 1)}
            >
              Next files
            </button>
          </div>
          {selected && (
            <section>
              <h2>Share: {selected.name}</h2>
              <p>
                Downloads count when access is issued. Each download URL can be
                used once within 60 seconds.
              </p>
              <form onSubmit={createShare} className="row">
                <label>
                  Expires in hours
                  <input
                    name="hours"
                    type="number"
                    defaultValue={24}
                    min={1}
                    max={168}
                    required
                  />
                </label>
                <label>
                  Download limit
                  <input
                    name="downloads"
                    type="number"
                    defaultValue={1}
                    min={1}
                    max={100}
                    required
                  />
                </label>
                <label>
                  Link password (optional)
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                  />
                </label>
                <button disabled={busy}>Create link</button>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setShareUrl("");
                  }}
                >
                  Close
                </button>
              </form>
              {shareUrl && (
                <div className="notice">
                  <label>
                    Share link (shown only now)
                    <input
                      className="share-link"
                      readOnly
                      value={shareUrl}
                      onFocus={(e) => e.target.select()}
                    />
                  </label>
                  <small>Copy this link. Send its password separately.</small>
                </div>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Expires</th>
                      <th>Uses</th>
                      <th>Password</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shares.map((share) => (
                      <tr key={share.id}>
                        <td>{new Date(share.expiresAt).toLocaleString()}</td>
                        <td>
                          {share.downloads} / {share.maxDownloads}
                        </td>
                        <td>{share.passwordProtected ? "Yes" : "No"}</td>
                        <td>
                          {share.revokedAt
                            ? "Revoked"
                            : new Date(share.expiresAt) < new Date()
                              ? "Expired"
                              : share.downloads >= share.maxDownloads
                                ? "Exhausted"
                                : "Active"}
                        </td>
                        <td>
                          <button
                            disabled={busy || !!share.revokedAt}
                            onClick={() =>
                              void action(async () => {
                                await api(
                                  `/files/${selected.id}/shares/${share.id}`,
                                  { method: "DELETE" },
                                );
                                await loadShares(selected);
                                await loadAudit();
                              })
                            }
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <section>
            <h2>Audit log</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Event</th>
                    <th>Resource</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((event) => (
                    <tr key={event.id}>
                      <td>{new Date(event.createdAt).toLocaleString()}</td>
                      <td>{event.action}</td>
                      <td>
                        <small>{event.resourceId || "Account"}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row">
              <button
                disabled={auditPage <= 1}
                onClick={() => setAuditPage(auditPage - 1)}
              >
                Previous events
              </button>
              <span>
                Page {auditPage} · {auditTotal} events
              </span>
              <button
                disabled={auditPage * 20 >= auditTotal}
                onClick={() => setAuditPage(auditPage + 1)}
              >
                Next events
              </button>
              <button disabled={busy} onClick={() => void action(loadAudit)}>
                Refresh audit
              </button>
            </div>
          </section>
        </>
      )}
      <footer>Private storage · Expiring links · Revocable access</footer>
    </main>
  );
}
