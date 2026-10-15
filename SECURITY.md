# Security

AutoStacc (autostacc.com) is a store: accounts, payments through Stripe, and downloads of paid files. If you find a way
to get around any of that, please tell us privately first.

## Reporting a vulnerability

Use **[Report a vulnerability](../../security/advisories/new)** on this repository's Security tab (GitHub's private
reporting). Only the maintainers see it. Please include what you found, how to reproduce it, and what it lets someone
do. Please don't open a public issue, pull request or discussion about it: everything there is public. The site's own page, [autostacc.com/security](https://autostacc.com/security), says the same for people who don't
use GitHub.

Please:

- don't access, change or delete other people's data, and stop as soon as you've shown the problem exists;
- don't run load tests or anything that degrades the site for others;
- give us a reasonable time to fix it before telling anyone else.

We'll answer as soon as we can and say when it's fixed. There is no paid bug bounty.

## What's in scope

The live site and its store API (autostacc.com, `server/`, `functions/`), the processing engine and its Worker
(`engine/`, `workers/engine/`), and this repository's CI (`.github/workflows/`). Stripe's checkout pages and
Cloudflare's own services are theirs to secure; report problems with them to Stripe or Cloudflare.

## How the code is meant to be safe

The rules the code follows (never trusting the browser with prices, ownership or payment status; per-product download
checks; private files; audited admin actions) are in [docs/store.md](docs/store.md) and
[docs/production.md](docs/production.md). Secrets never live in this repository: they're kept in GitHub and Cloudflare
settings. A report that one of those rules can be broken is exactly what we want to hear about.
