// Control Center, News tab: write an AutoStacc news email and send it to every account that switched AutoStacc news on
// (Settings › Emails). "Send a test to me" first; "Send to N people" then mails in batches until none are left, each
// person once per issue (the store guarantees it, so a retry is safe). Talks to /api/admin/news.
// Starts on "gs:admin". Needs js/util.js.
(function () {
  "use strict";

  const { $, escapeHTML: e, api } = window.GS;

  async function draw(el) {
    const res = await api("/api/admin/news");
    if (!res.ok) { el.innerHTML = `<p class="msg error">${e(res.error.message)}</p>`; return; }
    const { subscribers, brevoList } = res.data;
    el.innerHTML = `<p class="small-print">${subscribers} verified account${subscribers === 1 ? "" : "s"} switched AutoStacc news on.
      ${brevoList !== null ? `They are also kept in Brevo list ${e(String(brevoList))}, so you can send from Brevo instead.` : "Set BREVO_NEWS_LIST to also keep them in a Brevo list."}
      Each email ends with a link to switch it off.</p>
      <form class="panel wide" data-news-form>
        <div class="field"><label for="news-subject">Subject</label><input id="news-subject" name="subject" maxlength="120" required></div>
        <div class="field"><label for="news-body">Message (plain text; a blank line starts a new paragraph)</label><textarea id="news-body" name="body" rows="10" maxlength="20000" required></textarea></div>
        <div class="actions"><button class="btn ghost" type="button" data-news-test>Send a test to me</button>
          <button class="btn" type="submit"${subscribers ? "" : " disabled"}>Send to ${subscribers} ${subscribers === 1 ? "person" : "people"}</button></div>
        <p class="msg" role="status"></p></form>`;
  }

  addEventListener("gs:admin", () => {
    const el = $("#admin-news");
    if (!el) return;
    draw(el);
    const body = (form) => ({ subject: form.elements.subject.value, body: form.elements.body.value });
    el.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("[data-news-test]");
      if (!btn || btn.disabled) return;
      const form = btn.closest("form"), msg = $("[role=status]", form);
      if (!form.reportValidity()) return;
      btn.disabled = true;
      const res = await api("/api/admin/news", { method: "POST", body: { ...body(form), test: true } });
      btn.disabled = false;
      msg.textContent = res.ok ? `Test sent to ${res.data.to}.` : res.error.message;
    });
    el.addEventListener("submit", async (ev) => {
      const form = ev.target.closest("[data-news-form]");
      if (!form) return;
      ev.preventDefault();
      const btn = $("button[type=submit]", form), msg = $("[role=status]", form);
      if (btn.disabled || !confirm("Send this to everyone who switched AutoStacc news on? It can't be unsent.")) return;
      btn.disabled = true;
      let total = 0;
      for (;;) {
        const res = await api("/api/admin/news", { method: "POST", body: body(form) });
        if (!res.ok) { msg.textContent = `Stopped after ${total}: ${res.error.message}`; btn.disabled = false; return; }
        total += res.data.sent;
        msg.textContent = `Sent ${total}, ${res.data.left} left…`;
        if (!res.data.left) { msg.textContent = `Sent to ${total} ${total === 1 ? "person" : "people"}.`; return; }
        if (!res.data.sent) { msg.textContent = `Sent ${total}; ${res.data.left} couldn't be sent (Brevo refused them). Press send again to retry them.`; btn.disabled = false; return; }
      }
    });
  });
})();
