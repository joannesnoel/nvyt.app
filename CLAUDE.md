# Claude Code Project Notes

## Dev (local) database
When troubleshooting a problem, you have access to psql with creds below
- hostname: localhost
- username: nvyt
- password: nvyt
- database: nvyt

## Database Migrations

When making database schema changes:

1. Generate the migration: `pnpm db:generate`
2. Apply the migration: `pnpm db:migrate`

**Do NOT use `npx drizzle-kit generate` or `npx drizzle-kit push` or `pnpm db:push` directly.**
