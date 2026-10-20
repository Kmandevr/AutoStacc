// Trust pages: /privacy, /terms, /refunds, /security, /contact, /copyright and /community-rules. scripts/build.js turns each document into its page
// (scripts/lib/trust-pages.js); change the words here, rebuild, commit. Plain language, and only what the site really
// does today (docs/production.md): when the code changes what's collected or kept, change the privacy policy with it.
// Fields: id (the page address, permanent), title (heading), description (search), summary (the lede), updated
// (YYYY-MM-DD, shown as "Last updated"), review: a notice shown at the top until the owner has confirmed the text
// ("" once confirmed; scripts/seo-test.js warns while any is set), sections: [{ id, heading, body }]. A body is a list
// of paragraphs (strings) and lists ({ list: [strings] }). Text may use [label](/path), **bold** and {contact}, which
// becomes the support address from data/site.js, or says plainly that none is set up yet. No other markup.
window.LEGAL = [
  {
    id: "privacy",
    title: "Privacy policy",
    description: "What AutoStacc collects when you browse, buy and download, why, how long it's kept, who else sees it, and how to download or delete your data.",
    summary: "What AutoStacc collects, why, how long it keeps it, and how you can download or delete it. Written to match what the site actually does.",
    updated: "2026-10-20",
    review: "",
    sections: [
      { id: "who", heading: "Who runs AutoStacc", body: [
        "AutoStacc is run by an individual based in Utah County, Utah, United States, who decides how the information below is used. Questions about your data: {contact}"
      ] },
      { id: "short", heading: "The short version", body: [
        { list: [
          "AutoStacc keeps what it needs to run your account, sell you things and deliver your files. Nothing is sold to anyone.",
          "Card details never reach AutoStacc: payments happen on Stripe's own page.",
          "There are no advertising or tracking cookies. Visits are counted as anonymous daily totals.",
          "The store's picks for you come from history kept in your own browser; AutoStacc uses it for that one answer and keeps none of it.",
          "You can [download everything held about you](/settings/privacy) or [delete your account](/settings/privacy) at any time."
        ] }
      ] },
      { id: "account", heading: "Your account", body: [
        "When you create an account: your name, your email address, and your password, which is stored only as a one-way hash (nobody, including AutoStacc, can read it back). Whether you've confirmed your email, and when the account was made.",
        "When you sign in: a session, so you stay signed in until 30 days after you last use the site (or until you close your browser, if you untick \"Keep me logged in\"). Each session records the IP address and browser it started from; you can see them, and sign any of them out, under [Settings › Security](/settings/security).",
        "Admin accounts only, where AutoStacc has made it available: if you switch on two-step sign-in, the secret key your authenticator app uses and ten one-time backup codes are stored with your account, encrypted, along with whether it's on. Both are deleted when you switch it off or delete the account; your data download says only whether it's on, never the key or the codes. While you type the code after your password, a cookie (**gs.two_factor**) holds that sign-in for up to 10 minutes.",
        "If you follow projects, turn on Auto-Stacc, vote in polls, save products to your wishlist, organize Your Stacc with collections, tags and saved searches, or choose which emails you get, those choices are stored with your account. Collections, tags and saved searches are yours alone: nobody else, including the artists, sees them."
      ] },
      { id: "purchases", heading: "Orders and purchases", body: [
        "For every order: the email it was placed with, what was in it, the prices charged, any promo code, its status (paid, refunded and so on) and when. Stripe's reference numbers for the payment are kept so refunds and disputes can be matched to the order.",
        "What you own is recorded separately, so your library knows which files you can download.",
        "If you sell in the Studio: your products, what each sale earned you after AutoStacc's fee and refunds (never who bought), and, once you set up payouts, the reference of your Stripe payout account, the country of its bank account and whether it is ready (Stripe, not AutoStacc, collects and keeps your ID, tax and bank details; see [Stripe's privacy policy](https://stripe.com/privacy)). Each payout is recorded with its amount and Stripe's transfer reference. If payouts are still sent by hand, the payment details you type in (for example a PayPal address) are kept with the payout record, visible only to you and AutoStacc.",
        "If you make a creator space in the Studio: its name and address, the profile and pages you design there and the images and fonts you upload for them (published pages are public), and who is on its team with which role. If someone invites you to a team, AutoStacc keeps your email address with the invitation until you accept it, it is withdrawn, or it expires after 7 days. Team members see each other's names; the owner and admins also see members' email addresses. Pieces you share to the community library are public to everyone using the Studio, with your creator name; AutoStacc records which creators install them. If you report a piece, AutoStacc keeps your report and who sent it, and doesn't show it to the creator. The last 20 published versions of each page are kept, with when they were published and whether by you, a member of your creator space or a schedule you set, so you can restore one; a file a published page or a kept version still uses stays until nothing does. For each of your products the Studio keeps a history of changes (what changed, such as the price or putting it on sale, when, and which member of your creator space did it), visible to your creator space and AutoStacc. Files you upload to sell are checked automatically by AutoStacc's own systems (that each is what its name says, undamaged and safe; for audio, its tempo and key are estimated and a waveform drawn), and a checksum of each is kept so it can be delivered byte for byte. Nothing you upload is sent to anyone else for this. Files you remove are deleted from storage a day later.",
        "Storage: what your creator space stores is measured once a day (how much in all, split into paid files, Pac files, uploads in progress, preview clips and site files; a file several products or versions use counts once). If you take paid storage, AutoStacc keeps the limit you chose, each day's measurement, the most you chose to spend a month, a monthly statement worked out from those days (what was stored above your free storage, the rate, the amount, how much came from your earnings), whether and when it was paid with Stripe's reference for the payment, and a history of every change (who in your creator space or at AutoStacc made it, when). Only your creator space's owner and AutoStacc see the statements and history; your team sees the storage figures. They are kept as billing records, like orders.",
        "If you review a product you own: your stars, what you wrote, and when. It's shown publicly as \"Verified buyer\", without your name or email, and only while you still own the product (after a refund it's no longer shown). AutoStacc can hide a review that breaks the rules. Your reviews are in your data download and are deleted with your account.",
        "If you buy without an account, the order is tied to your email and a private key kept in a cookie on your device, so you can open your purchases from the receipt link for 30 days."
      ] },
      { id: "payments", heading: "Payments", body: [
        "Payments are taken by [Stripe](https://stripe.com/privacy) on its own checkout page. Your card number, expiry and security code go to Stripe, never to AutoStacc. For creators' products, Stripe also asks for the address it needs to work out sales tax. Stripe tells AutoStacc whether the payment succeeded, failed or was refunded."
      ] },
      { id: "downloads", heading: "Downloads", body: [
        "Each download link is made for you when you ask for it and stops working after a few minutes. AutoStacc records that a link was made and used (which file, for which purchase, and whether it was allowed), without your IP address."
      ] },
      { id: "picks", heading: "The store's picks for you", body: [
        "To choose \"Recommended for you\" and similar rows, your browser sends a summary of its own store history (above) with that one request. AutoStacc uses it to rank the products and keeps none of it: it isn't stored, logged or linked to your account. When you're signed in, the ranking also uses your wishlist and what you already own (so it never offers you something you have). Turn personal picks off on the [store](/shop) or the [home page](/) and nothing is sent; everyone then sees the same rows.",
        "\"Bestselling\" and \"bought recently\" come from completed purchases counted together, never from who bought what."
      ] },
      { id: "analytics", heading: "Visit counts", body: [
        "To know what people look at, the site counts events per day: a page kind or a product, release or news id and a number. No cookie, IP address, account, browser or device is attached to a count, so a count can't be traced back to anyone.",
        "If your browser sends Global Privacy Control or Do Not Track, nothing is counted at all."
      ] },
      { id: "cookies", heading: "Cookies and storage on your device", body: [
        "Only what the site needs to work:",
        { list: [
          "**gs.session_token** (named **__Secure-gs.session_token** on autostacc.com, which marks it as sent only over a secure connection): keeps you signed in (only after you sign in).",
          "**gs.dont_remember**: only if you untick \"Keep me logged in\", so you're signed out when you close the browser.",
          "**gs_guest**: lets a guest open their own orders (only after a guest checkout; 30 days).",
          "In your browser's storage, never sent anywhere: your cart, light or dark theme, whether the sidebar is open, whether sounds are on, a note that this browser was signed in (not who), and, until you close the tab, the email and promo code you typed at checkout.",
          "**The store's history**, also only in your browser: which products you open, preview, add to your cart, save or mark \"not interested\", which filters you use and what you search for (in the store, on [Projects](/projects) and on [Explore](/explore)), which picks you were shown, plus the genres and kinds you choose, for at most 90 days. The home page also reads it, without sending it, to suggest projects whose genres match. Forget it or turn it off on the [store](/shop) or the [home page](/)."
        ] },
        "No advertising, analytics or cross-site tracking cookies are used."
      ] },
      { id: "emails", heading: "Emails", body: [
        "AutoStacc sends the emails an account and a purchase need: confirming your email, resetting your password, receipts and download links. A record of each (what kind, to whom, when) is kept so a receipt can be resent.",
        "Anything else (news about releases from projects you follow, AutoStacc news) is only sent if you switch it on under [Settings › Emails](/settings/email), and you can switch it off there at any time.",
        "Project mailing lists: if you sign up on a project's page, AutoStacc emails you a link to confirm. Only once you click it is your address added to that project's list at Brevo, which sends the newsletter; every newsletter has an unsubscribe link. AutoStacc doesn't keep the sign-up itself."
      ] },
      { id: "support", heading: "When AutoStacc helps you", body: [
        "To solve a problem you report, AutoStacc's staff can view the store as your account sees it. Every time that happens it is recorded in an audit log, it can't make real purchases or change your password, and it ends on its own."
      ] },
      { id: "others", heading: "Who else is involved", body: [
        { list: [
          "**Stripe**: payments.",
          "**Brevo**: sending emails, and keeping the project mailing lists you confirmed and, if you switch on AutoStacc news, the AutoStacc news list.",
          "**Cloudflare**: hosts the site, the database and the files.",
          "**Google Fonts**: the site's fonts load from Google, which sees your IP address when they do.",
          "**Music players** (YouTube, Spotify, Deezer and others) on release pages and creators' pages are loaded from those services and follow their own privacy policies."
        ] },
        "Nothing about you is sold or shared for advertising."
      ] },
      { id: "abuse", heading: "Protection against abuse", body: [
        "To slow down password guessing and other abuse, the site counts requests per IP address for each kind of request (only the count and the time of the latest one), and newsletter sign-ups also per email address, stored only as a scrambled code (a hash). These counters aren't linked to your account or used for anything else, and are deleted within a day of the latest request."
      ] },
      { id: "keeping", heading: "How long things are kept", body: [
        { list: [
          "Your account and its choices (including your wishlist, collections, tags and saved searches): until you delete it.",
          "The store's history in your browser: at most 90 days, or until you forget it.",
          "Sessions: until you sign out, sign them out, or 30 days pass without you using the site.",
          "Download links: a few minutes. The record that a link was made and used is kept with the order's history; when an account is deleted, it no longer names the account.",
          "Guest access to an order: 30 days, from the receipt link or the cookie.",
          "Records of emails sent: kept so receipts can be resent; when an account is deleted, the address in them is removed.",
          "The audit log of what AutoStacc's staff did (including viewing the store as your account): kept and never changed.",
          "Orders: kept as sales records even after an account is deleted (tax, refunds and disputes need them), but no longer linked to you.",
          "Reviews: until you delete them or your account.",
          "Storage measurements, statements and their history (creators with paid storage): kept as billing records, like orders.",
          "Visit counts: kept as anonymous totals.",
          "Project mailing lists: at Brevo until you unsubscribe.",
          "Abuse counters: only the latest count for each IP address and kind of request, deleted within a day of it."
        ] }
      ] },
      { id: "community", heading: "The community (when it opens)", body: [
        "The [community](/community) isn't open yet. When it is, and you take part, AutoStacc keeps: the community name you choose and when you confirmed you're 16 or older; what you post (takes and replies, as you wrote them, with earlier versions of edited posts); your boosts and Helpful votes; and the time of your posts, which is used to pace posting and stop spam. Everything you post is public under your community name, never your email. If you report a post, AutoStacc keeps your report (the reason and your note) and who sent it; the space's team sees the report but not who made it. If you appeal a decision, the team sees your appeal and your community name. What a space's team does (hiding, removing, banning, with the reason) is kept in that space's log, which names the team member and the person by community name. Reports and appeals are kept for 12 months, then deleted; deleting your account removes your appeals and your name from your reports.",
        "Your posts stay until you delete them. A post you delete, or one a space's team removes, is kept privately for 12 months and then its text is deleted. If you block someone, AutoStacc keeps who you blocked (they aren't told) until you unblock them. Deleting your account keeps your posts as \"deleted user\" and erases your name, votes and edit history. Your community data is in your data download."
      ] },
      { id: "legal-requests", heading: "Requests from police and courts", body: [
        "AutoStacc gives information about an account only in answer to valid legal process, such as a subpoena or court order, and only what it asks for. You're told about the request unless the law forbids it or someone is in danger. Where someone's life is at risk, AutoStacc may answer an emergency request sooner. Material that exploits children is reported to the authorities as US law requires."
      ] },
      { id: "rights", heading: "Your choices", body: [
        { list: [
          "See and download your data: [Settings › Privacy and data](/settings/privacy).",
          "Correct your name or change your email: [Settings › Profile](/settings/profile). A new email is confirmed by a link sent to it, and the old address is told.",
          "Stop optional emails: [Settings › Emails](/settings/email).",
          "Delete your account: [Settings › Privacy and data](/settings/privacy). Your sign-ins, follows, wishlist, collections, tags, saved searches, votes and choices are erased, your library stops downloading, and your orders stay only as anonymous sales records.",
          "Anything else: {contact}"
        ] },
        "Depending on where you live, data-protection law may give you further rights. Ask, and AutoStacc will help."
      ] },
      { id: "changes", heading: "Changes to this policy", body: [
        "When this policy changes, the date at the top changes with it. If a change affects what is collected or who sees it, it will be announced on the site before it takes effect."
      ] }
    ]
  },
  {
    id: "terms",
    title: "Terms of service",
    description: "The general rules for using AutoStacc: accounts, buying and downloading digital products, licences, acceptable use, and what happens when things go wrong.",
    summary: "The general rules for using AutoStacc, in plain words. What you can buy, what you can do with it, and what AutoStacc promises.",
    updated: "2026-10-16",
    review: "",
    sections: [
      { id: "about", heading: "About these terms", body: [
        "AutoStacc is run by an individual based in Utah County, Utah, United States. These are general terms written in plain language for the site as it works today; they weren't drafted by a lawyer. If anything here conflicts with a right the law gives you, the law wins."
      ] },
      { id: "using", heading: "Using AutoStacc", body: [
        "AutoStacc is a store and library for digital music material (sample packs, presets, stems, music and visuals) made by independent artists and creators. By using the site you agree to these terms, the [privacy policy](/privacy), the [refund policy](/refunds) and the [licences](/license) of what you buy."
      ] },
      { id: "accounts", heading: "Accounts", body: [
        "You need a confirmed email address to create an account. Keep your password to yourself; you're responsible for what happens under your account. If you think someone else has used it, change your password and sign out your other devices in [Settings › Security](/settings/security), then tell AutoStacc: {contact}",
        "You can buy as a guest without an account. Purchases made with your email join your account when you confirm that email."
      ] },
      { id: "buying", heading: "Buying", body: [
        "Prices are shown in US dollars and are what you pay at checkout; the store, not your browser, decides the price. Payment is taken by Stripe. An order is complete once Stripe confirms the payment; until then nothing is charged and nothing is delivered.",
        "Everything sold is a digital download. You buy a licence to use the files, as set out in the [licence](/license) for that kind of product, not the copyright in them."
      ] },
      { id: "access", heading: "Downloads and access", body: [
        "What you buy stays in Your Stacc, where you can download it again whenever you're signed in. Guests open their purchases from the link in their receipt.",
        "If a creator withdraws a product from sale, people who already bought it keep their access. AutoStacc may remove a file that breaks the law or these terms; if that affects something you paid for, see the [refund policy](/refunds)."
      ] },
      { id: "use", heading: "Acceptable use", body: [
        "Don't:",
        { list: [
          "share, resell or upload the files you bought except as their licence allows;",
          "get into accounts, files or parts of the site that aren't yours, or try to break or overload the site;",
          "use stolen payment details or make purchases you intend to dispute;",
          "publish anything in the Studio that you don't have the rights to, or that is illegal, hateful or deceptive;",
          "write a review that isn't your own honest view of the product, or that is hateful, abusive or advertising. AutoStacc may hide reviews that break these rules."
        ] }
      ] },
      { id: "community", heading: "Community and copyright", body: [
        "The [community rules](/community-rules) apply to the community when it opens. The [copyright policy](/copyright) explains how to report infringement, how to answer a report, and what repeat infringement costs an account."
      ] },
      { id: "creators", heading: "Artists and creators", body: [
        "Products and pages are made by the projects and creators named on them, who keep the rights in their work. AutoStacc sells and delivers it for them.",
        "If you make a creator space in the Studio, you're responsible for what you publish there and confirm you have the rights to it.",
        "Creators can sell products in the Studio. Sales of creators' products are taken on a separate Stripe account from AutoStacc's own, which is also why a cart holding both is paid in two steps. A sale is held for 14 days (the refund window) before it can be paid out. To be paid you connect a Stripe account; Stripe verifies you and its [connected account terms](https://stripe.com/legal/connect-account) apply to it. AutoStacc sends a payout when you ask and AutoStacc approves it. If a sale is refunded after you were paid for it, that amount is taken from your next sales. Sales tax on creators' products is worked out and collected at checkout by Stripe Tax; creators are responsible for their own income taxes. AutoStacc's fee, if any, is shown in the Studio before you sell.",
        "Each creator space gets free storage (shown in the Studio). Where AutoStacc offers paid storage, you choose the most you'll spend a month; at the rate shown in the Studio that sets your storage limit, and uploads stop there. You pay only for what you actually store above your free storage, measured once a day; a day without a measurement isn't charged. Statements come after each month and are paid first from your earnings that have cleared the refund hold, then by card through Stripe for the rest; they're due 14 days after they're issued, and amounts under $0.50 are added to the next month's statement. If one isn't paid by then, or its payment is disputed, your paid limit pauses: new uploads stop while you're over your free storage, but nothing you've stored is deleted or hidden and buyers keep their downloads. If you lower your limit below what you store, or cancel, uploads stop and storage above your free storage is still charged until you're back within your limit; delete files or contact AutoStacc for help. You can see every day's measurement behind a statement in the Studio; write to AutoStacc if you think one is wrong.",
        "AutoStacc's own storage has a ceiling too. While it's full, new uploads wait for everyone, paid storage included."
      ] },
      { id: "ip", heading: "Rights in the site", body: [
        "AutoStacc's name, logo, design and code belong to AutoStacc. Artists' and creators' names, artwork and music belong to them."
      ] },
      { id: "ending", heading: "Suspending or closing accounts", body: [
        "You can delete your account at any time in [Settings › Privacy and data](/settings/privacy).",
        "AutoStacc may suspend or close an account that breaks these terms, for example by sharing paid files, fraud or abuse. Where it can, AutoStacc will tell you why first."
      ] },
      { id: "availability", heading: "Availability", body: [
        "AutoStacc aims to keep the site and your downloads available, but can't promise it will never be down. Keep your own copies of files you rely on."
      ] },
      { id: "liability", heading: "Liability", body: [
        "Files are provided as described on their product page. As far as the law allows, AutoStacc isn't liable for indirect losses, such as lost profits or lost work, from using or being unable to use the site or the files. Nothing in these terms limits rights you have under consumer law where you live."
      ] },
      { id: "changes", heading: "Changes", body: [
        "AutoStacc may change the site and these terms. The date at the top shows the latest version; a change that matters to you will be announced before it applies to new purchases. Purchases keep the licence they were bought under."
      ] },
      { id: "law", heading: "Governing law", body: [
        "These terms are governed by the laws of the State of Utah and the United States. This doesn't take away consumer protections you have where you live."
      ] },
      { id: "contact", heading: "Contact", body: ["{contact}"] }
    ]
  },
  {
    id: "copyright",
    title: "Copyright policy",
    description: "How to report something on AutoStacc that infringes your copyright, how to answer a report about your own upload, and what happens to accounts that infringe repeatedly.",
    summary: "Found your work on AutoStacc without your permission? Here's how to report it, how creators can answer a report, and what repeat infringement costs an account.",
    updated: "2026-10-16",
    review: "",
    sections: [
      { id: "scope", heading: "What this covers", body: [
        "Anything people upload or publish on AutoStacc: creators' products and packs, preview clips, creator pages and their images and fonts, shared site templates and reviews. AutoStacc respects copyright and expects everyone who uploads to have the rights to what they share ([terms](/terms#use))."
      ] },
      { id: "report", heading: "Reporting infringement", body: [
        "If you own the copyright in something on AutoStacc (or act for the owner), write to {contact} with:",
        { list: [
          "your name, postal address, phone number and email;",
          "the work you own, and the AutoStacc address (link) of each thing you say infringes it;",
          "a statement that you believe in good faith the use isn't authorised by the owner, its agent or the law;",
          "a statement that the information in your notice is accurate and, under penalty of perjury, that you are the owner or authorised to act for them;",
          "your physical or electronic signature (typing your full name is enough)."
        ] },
        "AutoStacc removes or disables what a complete notice points to promptly and tells the person who uploaded it, with a copy of the notice. Sending a notice you know is false can make you liable for damages."
      ] },
      { id: "counter", heading: "If your upload was removed", body: [
        "If you believe it was removed by mistake or you have the rights to it, you can send a counter-notice to {contact} with:",
        { list: [
          "your name, address, phone number and email;",
          "what was removed and where it was;",
          "a statement, under penalty of perjury, that you believe in good faith it was removed by mistake or misidentification;",
          "your consent to the jurisdiction of the federal court for your address (or, outside the United States, any court where AutoStacc may be found), and that you'll accept service from the person who sent the notice;",
          "your signature."
        ] },
        "AutoStacc passes the counter-notice to the person who sent the notice. Unless they tell AutoStacc within 10 to 14 business days that they've gone to court, the content is put back."
      ] },
      { id: "strikes", heading: "Repeat infringement", body: [
        "A notice that leads to a removal and isn't successfully answered by a counter-notice is a strike against the account that uploaded it. Each strike expires 12 months after it was given.",
        { list: [
          "**1 strike:** a warning.",
          "**2 strikes:** selling is paused. You can answer a strike, or fix or remove the content and ask for selling back.",
          "**3 strikes:** the account can no longer sell, upload files or use the Studio. In serious cases AutoStacc may keep this in place after strikes expire."
        ] },
        "Strikes never take away what you bought: you can always buy, download and use your purchases."
      ] },
      { id: "buyers", heading: "If you bought something that was removed", body: [
        "If a product you paid for is removed for infringement, see the [refund policy](/refunds)."
      ] },
      { id: "contact", heading: "Contact", body: ["Copyright notices and counter-notices: {contact}"] }
    ]
  },
  {
    id: "community-rules",
    title: "Community rules",
    description: "The rules for AutoStacc's community: what it's for, the base rules that apply everywhere, how each space can add its own, who moderates, and how reports work.",
    summary: "AutoStacc's community is opening soon. These are the rules it will open with: a place for music and sound, run by the people in each space, inside a few rules that apply everywhere.",
    updated: "2026-10-16",
    review: "",
    sections: [
      { id: "status", heading: "Opening soon", body: [
        "The community isn't open yet. These rules apply from the day it opens, and this page will say so."
      ] },
      { id: "about", heading: "What it's for", body: [
        "Making, sharing and talking about music and sound: production, sound design, gear and software, the creators and projects on AutoStacc, challenges, and ideas about AutoStacc and its products. It isn't a general social site; chat that has nothing to do with that belongs in a space's off-topic channel, and off-topic spaces and threads can be removed.",
        "Be welcoming. Everyone started somewhere, and basic questions are welcome."
      ] },
      { id: "spaces", heading: "Spaces", body: [
        "The community is made of spaces: AutoStacc's own, an **official** space for each project that turns one on, and communities anyone can start. A community about a creator it doesn't belong to is marked **unofficial** and can't use the creator's name on its own, logo or artwork."
      ] },
      { id: "base", heading: "Rules for everyone", body: [
        "These apply in every space, and no space can loosen them:",
        { list: [
          "Nothing illegal.",
          "No threats, harassment or hate aimed at anyone.",
          "No doxxing: never share someone's private information.",
          "No sexual content involving anyone under 18, ever.",
          "No spam, scams or misleading links.",
          "No piracy: don't share paid packs or anyone's files without the right to.",
          "Don't pretend to be someone else, including AutoStacc or a creator."
        ] }
      ] },
      { id: "space-rules", heading: "Each space's own rules", body: [
        "A space can add its own rules, for example about its topic, self-promotion or spoilers. They're shown beside its threads. They can only add limits, never allow what the rules above forbid."
      ] },
      { id: "moderation", heading: "Who moderates", body: [
        "Each space is run by its team: the founder and the moderators they choose, or for a project's official space, the creator's team. They can pin, lock, hide or remove posts, move threads and ban people from their space, and they handle appeals of their own decisions. When a post of yours is hidden or removed, you're told why.",
        "AutoStacc steps in where the law requires it: illegal content, copyright ([copyright policy](/copyright)), material that exploits children, and impersonation of creators. It can suspend accounts from the whole community for those, and remove a space or moderator that leaves illegal content up after being told.",
        "Some help is automatic everywhere: spam filters and limits for new accounts, and a post reported by several trusted members is hidden until the space's team looks at it. A space whose team hasn't been active for 40 days, or has left reports unhandled that long, becomes read-only until its team comes back."
      ] },
      { id: "reports", heading: "Reporting", body: [
        "Anyone signed in can report a post. Rule-breaking, harassment and posts where someone may be in danger go to the space's team, danger reports first. Illegal content, copyright and impersonation go to AutoStacc. You can also block a person so you don't see their posts.",
        "Reports need a reason. Reports made in bad faith lower your standing, and repeat false reports lose you the danger option.",
        "If someone's life is at risk, contact your local emergency services first. In the United States you can call or text 988 for crisis support."
      ] },
      { id: "age", heading: "Age", body: [
        "You must be 16 or older to post, vote, start a space or connect with people in the community. You confirm this yourself, and you're responsible for confirming truthfully. Anyone can read. If AutoStacc learns an account belongs to someone under 16, it removes that account's community activity."
      ] },
      { id: "contact", heading: "Contact", body: ["Questions about these rules: {contact}"] }
    ]
  },
  {
    id: "refunds",
    title: "Refund policy",
    description: "When AutoStacc refunds digital purchases: failed and duplicate payments, files that don't work, unauthorized purchases, and how to ask.",
    summary: "Everything AutoStacc sells is a digital download you can use straight away, so refunds work a little differently from physical goods. Here's when you get your money back.",
    updated: "2026-10-15",
    review: "",
    sections: [
      { id: "default", heading: "Digital downloads", body: [
        "Because files can be downloaded and kept as soon as a purchase completes, purchases are generally final once you've downloaded them. The cases below are the exceptions, and AutoStacc will always fix or refund a purchase that doesn't work as described."
      ] },
      { id: "failed", heading: "Failed or cancelled payments", body: [
        "If a payment fails or you leave the checkout page, you aren't charged and nothing is delivered. Your cart is still there, so you can try again. If your bank shows a pending charge for a failed payment, it disappears on its own; it is never collected."
      ] },
      { id: "duplicate", heading: "Paying twice", body: [
        "The store won't let you buy something you already own, and pressing the button twice opens one order, not two. If you're still charged twice for the same thing, the extra payment is refunded in full."
      ] },
      { id: "accidental", heading: "Bought the wrong thing", body: [
        "If you haven't downloaded anything from the purchase yet, you can refund it yourself within 14 days: open [Settings › Orders](/settings/orders) and press Refund this order. The money goes back to your card and the files leave Your Stacc. Once anything from the order has been downloaded, it can't be refunded this way; see the cases below, or ask. A site template from the Studio's community library counts as downloaded once you use it on a site."
      ] },
      { id: "broken", heading: "Missing, broken or not as described", body: [
        "If files are missing, won't open, or aren't what the product page described, tell AutoStacc. The files are fixed or replaced first; if that isn't possible, you get a refund."
      ] },
      { id: "unauthorized", heading: "A purchase you didn't make", body: [
        "Tell AutoStacc straight away, and change your password in [Settings › Security](/settings/security). Purchases you didn't make are refunded and their access is removed. You can also ask your bank, but please contact AutoStacc first so it can stop further misuse."
      ] },
      { id: "how", heading: "How refunds work", body: [
        "Refunds go back to the card or account you paid with, through Stripe, and usually show within 5 to 10 days depending on your bank. A refunded product leaves your library."
      ] },
      { id: "law", heading: "Your legal rights", body: [
        "Some countries give consumers extra rights for digital purchases. Nothing in this policy takes those rights away."
      ] },
      { id: "ask", heading: "Asking for help", body: [
        "Include your order number (it's on your receipt and in [Settings › Orders](/settings/orders)) and what went wrong. {contact}"
      ] }
    ]
  },
  {
    id: "security",
    title: "Security",
    description: "How AutoStacc protects accounts, payments and downloads, what you can do to keep your account safe, and how to report a security problem.",
    summary: "How AutoStacc keeps accounts, payments and files safe, what you can do yourself, and how to report a problem.",
    updated: "2026-10-15",
    review: "",
    sections: [
      { id: "site", heading: "The site", body: [
        "AutoStacc is only served over HTTPS, and browsers are told never to use a plain connection to it. Account pages only run AutoStacc's own code. Creators' Studio pages can't run any code a creator wrote: the only script they load is AutoStacc's own, for slideshows, tabs, countdowns and the like, and it makes no requests of its own. A creator's own styles are checked and kept inside their page, so they can't cover AutoStacc's strip or pretend to be AutoStacc."
      ] },
      { id: "accounts", heading: "Accounts and passwords", body: [
        "Passwords are at least 10 characters and are stored only as a one-way hash. You must confirm your email before an account can sign in. Repeated sign-in attempts are slowed down. Changing or resetting your password signs out your other devices, and reset links work once, for an hour."
      ] },
      { id: "payments", heading: "Payments", body: [
        "Card details are entered on Stripe's checkout page and never reach AutoStacc. Prices and payment results come from the store and Stripe, never from your browser."
      ] },
      { id: "files", heading: "Your files", body: [
        "Paid files are never public. A download link is made for your purchase when you ask for it, works only for you, and expires after a few minutes. Your library only shows what you own."
      ] },
      { id: "you", heading: "Keeping your account safe", body: [
        { list: [
          "Use a password you don't use anywhere else.",
          "Check [Settings › Security](/settings/security) for devices you don't recognise, and sign them out.",
          "AutoStacc will never ask for your password by email."
        ] }
      ] },
      { id: "report", heading: "Reporting a security problem", body: [
        "If you find a vulnerability, please report it privately before telling anyone else, with enough detail to reproduce it. Don't access other people's data, and stop as soon as you've shown the problem exists. {contact}"
      ] }
    ]
  },
  {
    id: "contact",
    title: "Contact",
    description: "How to reach AutoStacc for help with purchases, downloads, accounts, refunds or security, and where to find quick answers first.",
    summary: "Questions about a purchase, a download or your account? Most answers are in Help. For everything else, here's how to reach AutoStacc.",
    updated: "2026-10-16",
    review: "",
    sections: [
      { id: "first", heading: "Quick answers", body: [
        "The [help pages](/help) cover downloads, guest purchases, payments, refunds and accounts.",
        "The [guides](/guide) go step by step through buying, Your Stacc and refunds, and the creator manual covers the Studio, selling, packs and payouts."
      ] },
      { id: "write", heading: "Write to AutoStacc", body: [
        "{contact}",
        "For anything about an order, include its number (on your receipt and in [Settings › Orders](/settings/orders)). Never send your password."
      ] },
      { id: "self", heading: "Things you can do yourself", body: [
        { list: [
          "Download your purchases again: [Your Stacc](/library).",
          "Forgot your password: [reset it](/login#forgot).",
          "Change your name, password or emails, download your data or delete your account: [Settings](/settings)."
        ] }
      ] },
      { id: "projects", heading: "Artists and projects", body: [
        "To reach an artist, use the links on their project's page. To publish your own work, start a free creator space in the [Studio](/studio)."
      ] }
    ]
  }
];
