## SPERNAKIT TECHNOLOGY STANDARDS

**When working on Spernakit-derived projects, these technologies are REQUIRED:**

This document defines the mandatory technology stack for Spernakit v2 applications. Agents must follow these standards to ensure consistency with the template architecture.

---

## Backend Technologies

### Required

| Category       | Technology      | Notes                            |
| -------------- | --------------- | -------------------------------- |
| HTTP Framework | **Elysia**      | Not Express/Fastify              |
| ORM            | **Drizzle ORM** | Not Prisma                       |
| Logging        | **pino**        | Not Winston                      |
| Validation     | **TypeBox**     | Via Elysia built-in, not Joi/Zod |
| WebSocket      | **Bun native**  | Not Socket.IO                    |
| Runtime        | **Bun**         | Not Node.js                      |

### Database

| Category           | Standard                        | Notes                          |
| ------------------ | ------------------------------- | ------------------------------ |
| Database           | **SQLite**                      | Via `bun:sqlite`               |
| Schema Location    | `backend/src/db/schema/`        | Drizzle table definitions      |
| Migrations         | `backend/drizzle/`              | Generated SQL files            |
| Development Push   | `bun run --cwd backend db:push` | Schema push (no migrations)    |
| Production Migrate | `bun run db:migrate`            | Transaction-wrapped migrations |

### Database Location (CRITICAL)

- Database MUST be in `data/` directory at **project root**
- NEVER use `backend/data/` for database files
- Default location: `data/{appname}.db`
- Configuration: `config/{appname}.json` → `database.url`

---

## Frontend Technologies

### Required

| Category     | Technology         | Notes               |
| ------------ | ------------------ | ------------------- |
| UI Framework | **React 19**       | With TypeScript     |
| Build Tool   | **Vite 7**         | Not Webpack         |
| Server State | **TanStack Query** | For API data        |
| Client State | **Zustand**        | Not React Context   |
| Routing      | **React Router**   | Client-side routing |
| Styling      | **Tailwind CSS**   | With shadcn/ui      |
| Components   | **shadcn/ui**      | Not DaisyUI         |
| Toasts       | **sonner**         | Not react-hot-toast |
| HTTP Client  | **native fetch**   | Not Axios           |

### State Management Rules

- **Server state** (API data): TanStack Query
- **Global client state**: Zustand stores
- **Local UI state**: React useState
- **NOT allowed**: React Context for state management

---

## Configuration

### Required Pattern

| Category       | Standard          | Notes                             |
| -------------- | ----------------- | --------------------------------- |
| Config Format  | **JSON-only**     | Via `config/{appname}.json`       |
| Config Loading | `configLoader.ts` | Centralized loader                |
| Environment    | **NOT USED**      | Bun configured with `env = false` |

### Configuration File Structure

```json
{
	"app": {
		"description": "Application description",
		"name": "Application Name",
		"slug": "app-slug"
	},
	"database": {
		"allowDbPush": false,
		"url": "file:./data/appname.db"
	},
	"security": {
		"cookieSecret": "...",
		"encryptionKey": "...",
		"jwtSecret": "..."
	},
	"server": {
		"backendPort": 3331,
		"backendUrl": "http://localhost:3331",
		"frontendPort": 3330,
		"frontendUrl": "http://localhost:3330"
	}
}
```

### Secret Injection (Production Only)

The ONLY approved use of environment variables is for security secrets in production/Docker deployments:

- ` {APP_SLUG}_JWT_SECRET` - JWT signing key
- ` {APP_SLUG}_COOKIE_SECRET` - Cookie signing key
- ` {APP_SLUG}_ENCRYPTION_KEY` - Data encryption key
- ` {APP_SLUG}_API_KEY` - API authentication

Handled by `configLoader.ts` via `SECRET_CONFIG_KEYS` mapping.

---

## Module Exports

### Required Pattern

| Category   | Standard               | Example                    |
| ---------- | ---------------------- | -------------------------- |
| Exports    | **Named exports only** | `export function foo() {}` |
| Prohibited | **Default exports**    | `export default foo` ❌    |

### Rationale

- Better tree-shaking
- Consistent imports
- Explicit API surfaces
- Easier refactoring

### React.lazy() Pattern

For code splitting with named exports:

```typescript
// Instead of default export:
const Component = lazy(() => import('./Component').then((m) => ({ default: m.Component })));
```

### Barrel Files

Use `index.ts` files to re-export:

```typescript
// hooks/index.ts
export { useAuth } from './useAuth';
export { useAuthorization } from './useAuthorization';
export { useWebSocket } from './useWebSocket';
```

---

## Testing

| Environment | Framework    | Notes                  |
| ----------- | ------------ | ---------------------- |
| Frontend    | **Vitest**   | React Testing Library  |
| Backend     | **bun:test** | Native Bun test runner |

### Test Commands

```bash
# Frontend tests
cd frontend && bun test

# Backend tests
cd backend && bun test

# Quality control (lint + typecheck + build)
bun run smoke:qc

# Development smoke tests
bun run smoke:dev
```

---

## Prohibited Technologies

The following are explicitly NOT allowed in Spernakit projects:

### Backend

- ❌ Express, Fastify, Koa (use Elysia)
- ❌ Prisma (use Drizzle ORM)
- ❌ Winston, Bunyan (use pino)
- ❌ Joi, Zod (use TypeBox via Elysia)
- ❌ Socket.IO (use Bun native WebSocket)
- ❌ .env files (use JSON config)

### Frontend

- ❌ Axios (use native fetch)
- ❌ React Context for state (use Zustand)
- ❌ DaisyUI (use shadcn/ui)
- ❌ react-hot-toast (use sonner)
- ❌ Default exports (use named exports)

---

## Quick Reference Commands

```bash
# Development
bun run dev                    # Start both servers
bun run dev:backend            # Backend only
bun run dev:frontend           # Frontend only

# Database
bun run --cwd backend db:push  # Push schema (dev)
bun run --cwd backend db:seed  # Seed data
bun run --cwd backend db:reset # Reset database (dev)
bun run db:migrate             # Apply migrations (prod)
bun run db:generate            # Generate migration SQL

# Quality
bun run smoke:qc               # Lint + typecheck + build
bun run lint:fix               # Fix linting issues
bun run format                 # Format with Prettier
bun run typecheck              # TypeScript check

# Testing
bun run smoke:dev              # Development smoke tests
bun run crawltest              # Page validation
```

---

## References

- [Spernakit STACK.md](../../spernakit/docs/template/STACK.md) - Full technical reference
- [Spernakit DEVELOPMENT.md](../../spernakit/docs/template/DEVELOPMENT.md) - Development guide
- [AIDD Audit: SPERNAKIT.md](../../audits/SPERNAKIT.md) - Spernakit-specific audit
