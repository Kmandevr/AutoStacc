-- Two-step sign-in for admin accounts (authenticator-app codes; owner, 2026-10-15): Better Auth's twoFactor plugin
-- tables, written from Better Auth 1.7's schema (better-auth/dist/plugins/two-factor/schema.mjs and db/get-migration)
-- the way 0001_auth.sql was. Used only while the feature switch auth.adminTwoFactor is on (server/lib/features.js);
-- off (the default), nothing reads or writes them. "secret" and "backupCodes" are stored encrypted by Better Auth.
alter table "user" add column "twoFactorEnabled" integer default 0;

create table "twoFactor" ("id" text not null primary key, "secret" text not null, "backupCodes" text not null, "userId" text not null references "user" ("id") on delete cascade, "verified" integer, "failedVerificationCount" integer, "lockedUntil" date);

create index "twoFactor_secret_idx" on "twoFactor" ("secret");

create index "twoFactor_userId_idx" on "twoFactor" ("userId");
