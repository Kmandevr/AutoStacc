// The /community page (docs/community.md): AutoStacc's ordinary page frame, built here like every platform page. While
// the community is closed it is the "opening soon" page. Once the community.forum switch is on, its Function
// (functions/community.js) fetches this page as a template and fills the marked parts on the server
// (server/community/page.js): the seo block, the heading area and the main area. Returns { file, page, html }.
const H = require("./head");
const { shell, suffix } = require("./pages");

const MARK = (name) => [`<!-- community:${name}:start -->`, `<!-- community:${name}:end -->`];

function communityPage(SITE) {
  const title = `Community${suffix(SITE.name)}`;
  const description = "AutoStacc's community for music and sound: ask questions, share what you make and join the spaces of the creators you follow. Opening soon.";
  const page = { path: "/community", title, description, index: true, ogType: "website",
    schema: [H.webPage(SITE, { path: "/community", title, description }, "WebPage", { breadcrumb: H.breadcrumbs(SITE, [["Home", "/"], ["Community", "/community"]]) })] };
  const [hs, he] = MARK("hero");
  const [ms, me] = MARK("main");
  const main = `    <div class="page-hero detail-hero community-hero">
      <div class="wrap">
        ${hs}
        <p class="detail-kicker">AutoStacc</p>
        <h1 class="glitch" data-text="Community">Community</h1>
        <p>A place for music and sound: ask and answer questions, share what you make, and join the spaces of the projects you follow.</p>
        ${he}
      </div>
    </div>

    <section>
      <div class="wrap community-main">
        ${ms}
        <div class="community-closed">
          <h2>Opening soon</h2>
          <p>The community isn't open yet. Its rules are already published: read the <a href="/community-rules">community rules</a>.</p>
          <p>Until then: <a href="/guide">Guides</a>, <a href="/help">Help</a> and <a href="/projects">Projects</a>.</p>
        </div>
        ${me}
      </div>
    </section>`;
  const html = shell(SITE, { page, section: "community", styles: ["community", "community-boost", "community-qa", "community-waves", "community-moderation", "community-safety", "community-embeds", "community-cards", "community-codeblocks", "community-keepup", "community-find", "community-team"], scripts: ["js/community-kit.js", "js/community.js", "js/community-boost.js", "js/community-qa.js", "js/community-moderation.js", "js/community-reports.js", "js/community-blocks.js", "js/community-upkeep.js", "js/community-cards.js", "js/community-holds.js", "js/community-linkrules.js", "js/community-wordfilter.js", "js/community-newaccount.js", "js/community-patterns.js", "js/community-follows.js", "js/community-saved.js", "js/community-joined.js", "js/community-mentions.js", "js/community-inbox.js", "js/community-search.js", "js/community-tags.js", "js/community-similar.js", "js/community-teamtools.js", "js/community-selfpromo.js", "js/community-welcome.js", "js/community-look.js", "js/community-profilecard.js"], main });
  return { file: "community.html", page, html };
}

module.exports = { communityPage, MARK };
