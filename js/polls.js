// Polls (generic platform feature, docs/architecture.md): fills each [data-polls-for="<project id>"] with that
// project's published polls from data/polls.js, live tallies from the store API, and vote buttons for signed-in
// customers, with a link to what the poll is about (its `about`: a published release of the poll's project, from the
// content API through js/project-content.js, or a published product, from GET /api/products/:id). The enclosing
// section stays hidden until a poll exists. Needs data/polls.js and js/util.js (and js/project-content.js for a
// release's "About" link; js/skeleton.js for placeholders and the vote spinner).
(function () {
  "use strict";

  const { escapeHTML: e, api, content, skeleton: sk } = window.GS;
  // "release:hail" (a release of the poll's project) or "product:<id>" -> { title, href }; anything else -> null.
  async function aboutLink(ref, project) {
    const [kind, id] = String(ref || "").split(":");
    if (kind === "release") {
      if (!content) return null;
      const r = (await content.project(project)).releases.find((x) => x.id === id);
      return r ? { title: r.title, href: content.href(r, "music") } : null;
    }
    if (kind === "product") {
      if (!/^[a-z0-9_-]{1,80}$/i.test(id || "")) return null;
      const res = await api(`/api/products/${encodeURIComponent(id)}`);
      const p = res.ok && res.data.product;
      return p ? { title: p.title, href: window.GS.shopItemPath(p) } : null;
    }
    return null;
  }
  const today = new Date().toISOString().slice(0, 10);
  const live = (p) => !p.draft && (!p.opens || p.opens <= today);

  function render(el, poll, about) {
    const total = poll.total || 0;
    el.innerHTML = `<h3>${e(poll.question)}</h3>${about ? `<p class="small-print">About <a href="${e(about.href)}">${e(about.title)}</a></p>` : ""}
      <ul class="poll-options">${poll.options.map((o) => {
        const pct = total ? Math.round((o.votes / total) * 100) : 0;
        const mine = poll.myVote === o.id;
        return `<li><button class="btn ghost${mine ? " picked" : ""}" type="button" data-vote="${e(o.id)}" aria-pressed="${mine}"${poll.open ? "" : " disabled"}>${e(o.label)}</button>
          <span class="poll-bar" aria-hidden="true"><span style="width:${pct}%"></span></span><span class="small-print">${pct}% · ${o.votes}</span></li>`;
      }).join("")}</ul>
      <p class="small-print" role="status">${poll.open ? `${total} vote${total === 1 ? "" : "s"} so far. ${poll.myVote ? "You can change your vote while it's open." : poll.signedIn ? "Pick one; you can change it while it's open." : '<a href="/login?next=/#votes">Log in</a> to vote.'}` : "Voting is closed."}</p>`;
  }

  // aboutP: the promise of what the poll is about, asked for beside the poll itself.
  async function mount(el, id, aboutP) {
    const [res, about] = await Promise.all([api(`/api/polls/${encodeURIComponent(id)}`), aboutP]);
    if (!res.ok) return false;
    if (sk) sk.done(el);
    render(el, res.data, about);
    el.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-vote]");
      if (!btn || btn.disabled) return;
      if (sk) sk.busy(btn, true); else btn.disabled = true;
      const vote = await api(`/api/polls/${encodeURIComponent(id)}/vote`, { method: "POST", body: { optionId: btn.dataset.vote } });
      if (vote.ok) render(el, { ...res.data, ...vote.data }, about);
      else {
        if (sk) sk.busy(btn, false); else btn.disabled = false;
        el.querySelector("[role=status]").textContent = vote.status === 401 || vote.status === 403 ? "Log in with a confirmed email to vote." : vote.error.message;
      }
    });
    return true;
  }

  document.querySelectorAll("[data-polls-for]").forEach(async (box) => {
    const polls = (window.POLLS || []).filter((p) => p.project === box.dataset.pollsFor && live(p));
    // Every poll's slot goes in now, in order; their requests run side by side.
    const mounted = await Promise.all(polls.map(async (p) => {
      const el = document.createElement("div");
      el.className = "poll panel";
      box.append(el);
      if (sk) sk.show(el, "button", (p.options || []).length || 3);
      if (await mount(el, p.id, aboutLink(p.about, p.project))) return true;
      el.remove();
      return false;
    }));
    const shown = mounted.filter(Boolean).length;
    const section = box.closest("section");
    if (shown && section) section.hidden = false;
  });
})();
