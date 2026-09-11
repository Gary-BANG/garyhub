# Security Policy

Do not commit production databases, task data, passwords, password hashes,
session secrets, API tokens, cookies, private keys, TLS state, environment
files, logs, or backups.

Use `.env.example` files only as templates. Real values must remain outside
Git and must be unique for each deployment.

If a secret is accidentally committed, removing it in a later commit is not
enough. Rotate the secret immediately and remove it from Git history.
