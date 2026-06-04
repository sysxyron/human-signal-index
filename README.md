# Human Signal Index

Human Signal Index (HSI) is a production-grade monorepo scaffold for a public-interest signal intelligence and observability platform.

## Project structure

- `apps/web` - Next.js public site and dashboard app
- `apps/worker` - background capture and processing worker
- `packages/ui` - shared UI components and design system
- `packages/config` - environment schema and configuration helpers
- `packages/database` - Supabase/Postgres client and schema support
- `packages/shared-types` - shared TypeScript models
- `packages/ai-prompts` - prompt templates for AI-assisted workflows
- `packages/classifiers` - rhetoric taxonomy and classifier helpers
- `packages/traceability` - provenance and source-to-claim tracing helpers
- `packages/source-connectors` - ingestion connectors for RSS and public sources
- `packages/security` - security headers, RBAC helpers, and auth utilities
- `workspaces/*` - interpretable context methodology workflows with `CONTEXT.md` and `output/`
- `docs` - architecture, security, legal, deployment, methodology, and operating procedures
- `supabase` - database migrations and seed data

## Getting started

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
3. Start development apps:
   ```bash
   pnpm dev
   ```

## Local commands

- `pnpm dev` - run web and worker locally using Turbo
- `pnpm build` - build all packages and apps
- `pnpm lint` - lint all workspaces
- `pnpm format` - format all files
- `pnpm db:push` - sync database (database package)
- `pnpm seed` - seed sample data

## Deployment

See `docs/deployment/README.md` for GitHub, Supabase, Vercel, Cloudflare, and release guidance.

## Design references

Place the design reference images at:
- `docs/design/references/hsi-full-design-system-reference.png`
- `docs/design/references/hsi-marketing-homepage-reference.png`

If those files are present, the homepage and design docs should be updated to reflect the visual source of truth.
# human-signal-index
