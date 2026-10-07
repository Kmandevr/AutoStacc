// Polls: generic community votes, usable by any project whose `features` include "polls" (data/projects.js). Synced
// into the store database (db/catalog.sql); votes are stored per verified account (one each, changeable while open).
// A page shows a poll with <div data-poll="<id>"></div> plus js/polls.js. Model: docs/architecture.md.
// Fields: id (lowercase-hyphenated, permanent), project, question (plain text),
//   options: [{ id (lowercase-hyphenated), label }], at least two. opens / closes: optional YYYY-MM-DD (UTC days).
//   about: optional "kind:id" the poll is about (see data/relationships.js). draft: true = not shown, no votes.
window.POLLS = [];
