// AutoStacc's word lists (owner, 2026-10-27, #230; docs/community.md "Word levels"). Plain lowercase, accent-free whole
// words, one string each, every form listed (plurals, -ing). Kept light on purpose. How a word is graded: by how
// commonly and how harshly it is used to insult or demean someone, not by how rude it sounds. Mild words (damn, hell,
// crap, shit, piss, sick, sucks, bloody, ass) are on no list and are allowed everywhere, names and tags included.
// Reclaimed words used within their own communities (queer, dyke) are on no list either.

// STRONG: commonly used as vulgar or demeaning insults. Refused in titles, names and tags; allowed in posts, where
// readers see them softened (f***) or as written, by their own setting.
export const STRONG = [
  "fuck", "fucks", "fucked", "fucker", "fuckers", "fucking", "fuckin", "fuckhead", "fuckheads", "fuckface", "fuckwit", "fuckwits",
  "motherfucker", "motherfuckers", "motherfucking", "mofo",
  "cunt", "cunts", "twat", "twats",
  "bitch", "bitches", "bitchy",
  "whore", "whores", "slut", "sluts", "slutty",
  "asshole", "assholes", "arsehole", "arseholes", "dickhead", "dickheads", "cocksucker", "cocksuckers",
  "bastard", "bastards", "wanker", "wankers", "prick", "pricks"
];

// SLURS and the ban list: demean people for who they are (race, ethnicity, nationality, religion, sexuality, gender
// identity, disability). Refused everywhere, posts included. Forms with letters swapped for digits are caught by the
// matcher (server/lib/words.js), so only the plain spellings are listed.
export const SLURS = [
  "nigger", "niggers", "nigga", "niggas", "niggaz", "negroid", "sandnigger", "sandniggers", "jigaboo", "jigaboos", "porchmonkey", "coon", "coons", "darkie", "darkies", "sambo",
  "chink", "chinks", "gook", "gooks", "zipperhead", "zipperheads", "chingchong",
  "spic", "spics", "spick", "spicks", "wetback", "wetbacks", "beaner", "beaners",
  "kike", "kikes", "kyke", "heeb", "heebs",
  "raghead", "ragheads", "towelhead", "towelheads", "paki", "pakis",
  "faggot", "faggots", "fag", "fags", "faggy",
  "tranny", "trannies", "shemale", "shemales",
  "retard", "retards", "retarded", "spaz", "spastic", "mongoloid"
];
