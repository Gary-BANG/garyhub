'use strict';

// Never guess between a username and another account's verified email.
async function findLoginIdentity(db, input) {
  if (typeof input !== 'string') return null;
  const identifier = input.trim();
  if (!identifier || identifier.length > 254) return null;
  const rows = await db.all(`SELECT * FROM users WHERE username=? OR
    (email_normalized=? AND email_verified_at IS NOT NULL) LIMIT 2`,
    [identifier, identifier.toLowerCase()]);
  return rows.length === 1 ? rows[0] : null;
}

module.exports = { findLoginIdentity };
