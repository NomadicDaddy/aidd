# Twelve-Factor Guidelines

## Contents

- [Codebase](#1-codebase-single-source-of-truth)
- [Dependencies](#2-dependencies-explicit-declaration)
- [Configuration](#3-config-externalized-configuration)
- [Backing services](#4-backing-services-attached-resources)
- [Build, release, and run](#5-build-release-run-separation-of-stages)
- [Processes](#6-processes-stateless-execution)
- [Port binding](#7-port-binding-self-contained-service)
- [Concurrency](#8-concurrency-process-model-scaling)
- [Disposability](#9-disposability-fast-startup-graceful-shutdown)
- [Development and production parity](#10-devprod-parity-minimize-environment-gaps)
- [Logs](#11-logs-event-streams-to-stdout)
- [Administrative processes](#12-admin-processes-one-off-tasks)
- [Quick reference](#quick-reference-checklist)
- [Anti-patterns](#common-anti-patterns-to-avoid)

## 1. Codebase: Single Source of Truth

### What to Do:

- Keep one version-controlled codebase for the application, with many deploys of that codebase
- Declare shared code as a package dependency instead of reaching into an unrelated local checkout
- Keep each independently deployable service in its own codebase
- When creating new features, integrate them with the established repository structure

### Checklist:

- [ ] Does this code belong in the existing repository structure?
- [ ] Are there no hardcoded absolute paths to local files?
- [ ] Do development, staging, and production deploy identifiable versions of the same codebase?

### Example:

```ts
// Bad: Reaches into an undeclared, machine-specific checkout
import config from 'D:/shared-config/default.json';

// Good: Uses a package declared in package.json
import { defaults } from '@example/shared-config';
```

---

## 2. Dependencies: Explicit Declaration

### What to Do:

- Always declare dependencies in the appropriate manifest file
- Never assume system packages are available
- Include version constraints to ensure reproducibility
- Commit the package-manager lockfile and use frozen installs in CI and release builds
- Document any system-level requirements in a README or setup script

### Checklist:

- [ ] Are all libraries added to `package.json`, `requirements.txt`, `Gemfile`, etc.?
- [ ] Are version ranges specified appropriately?
- [ ] Are both runtime and development dependencies properly categorized?
- [ ] Does CI install from the committed lockfile without rewriting it?

### Example:

`package.json`:

```json
{
	"dependencies": {
		"express": "5.2.1",
		"pg": "8.23.0"
	},
	"devDependencies": {
		"@types/express": "5.0.6",
		"@types/pg": "8.23.1",
		"typescript": "6.0.3"
	},
	"packageManager": "bun@1.4.0"
}
```

```python
# requirements.txt
flask==3.1.3
psycopg2-binary==2.9.12
redis==8.1.0
```

---

## 3. Config: Externalized Configuration

### What to Do:

- **Never hardcode credentials, API keys, or environment-specific values**
- Externalize all config that varies between deploys
- Use independent environment variables for strict twelve-factor compliance
- Record any deliberate deviation. Spernakit uses validated `config/{slug}.json`, optional
  `config/{slug}.secrets.json`, and an explicit environment-variable allowlist for production
  secret injection; it does not treat arbitrary environment variables as configuration
- Provide example configuration with dummy values
- Use config libraries appropriate to the language

### Checklist:

- [ ] Are all secrets/credentials externalized (not in source code)?
- [ ] Is the deploy-time configuration contract documented with safe example values?
- [ ] Are untracked config or secrets files explicitly excluded from version control?
- [ ] Are sensible defaults provided where appropriate?
- [ ] Is any non-environment configuration strategy identified as a twelve-factor deviation?

### Example (Environment Variables):

```ts
// config.ts - .env approach
export const config = {
	port: Number.parseInt(process.env.PORT ?? '3000', 10),
	database: {
		url: process.env.DATABASE_URL,
		poolSize: Number.parseInt(process.env.DB_POOL_SIZE ?? '10', 10),
	},
	apiKey: process.env.API_KEY,
	nodeEnv: process.env.NODE_ENV ?? 'development',
};

// Validate required config on startup
if (!config.apiKey) {
	throw new Error('API_KEY environment variable is required');
}
```

```bash
# .env.example
DATABASE_URL=postgresql://user:password@localhost:5432/mydb
API_KEY=your_api_key_here
PORT=3000
```

### Example (JSON Configuration):

```ts
// app.ts - Spernakit's validated JSON-config exception
import { initializeConfig } from './config/configLoader.ts';

const config = initializeConfig();
const port = config.server.backendPort;
```

`config/myapp.json` is generated locally, schema-validated at startup, and gitignored:

```json
{
	"database": { "url": "file:./data/myapp.db" },
	"server": { "backendPort": 3331 }
}
```

Spernakit disables automatic `.env` loading with `env = false` in `bunfig.toml`. Its loader owns
defaults, schema validation, optional split-secret resolution, and the narrow production-secret
environment override; application code must not import the JSON file directly.

---

## 4. Backing Services: Attached Resources

### What to Do:

- Access all external services (databases, caches, queues, APIs) through URLs or connection strings from config
- Write code that can swap services without modification (e.g., local Postgres → AWS RDS)
- Use connection pooling and graceful handling of service unavailability

### Checklist:

- [ ] Can the database be swapped by changing a URL?
- [ ] Are service connections supplied through the application's documented deploy-time config?
- [ ] Is there error handling for service unavailability?

### Example:

```ts
// database.ts
import { type QueryConfigValues, Pool } from 'pg';

import { config } from './config';

// Service is "attached" via config - can be swapped easily
const pool = new Pool({
	connectionString: config.database.url,
	max: config.database.poolSize,
});

export const query = (text: string, params?: QueryConfigValues) => {
	return pool.query(text, params);
};
```

```python
# services.py
import redis
import psycopg2
from config import REDIS_URL, DATABASE_URL

# Both services are attached via config
redis_client = redis.from_url(REDIS_URL)
db_connection = psycopg2.connect(DATABASE_URL)
```

---

## 5. Build, Release, Run: Separation of Stages

### What to Do:

- Write code assuming it will go through distinct build/release/run stages
- Keep build artifacts separate from configuration
- Make the application runnable with a single command after build

### Checklist:

- [ ] Can the code be built independently of configuration?
- [ ] Is there a clear build script/command?
- [ ] Does the app read config at runtime, not build time?

### Example:

```json
{
	"scripts": {
		"build": "bun build src/index.ts --outdir dist --target bun",
		"dev": "bun --watch src/index.ts",
		"start": "bun dist/index.js"
	}
}
```

```dockerfile
# Dockerfile showing clear stages
# BUILD STAGE
FROM oven/bun:1.4.0 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# RUN STAGE (config comes from environment at runtime)
FROM oven/bun:1.4.0-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["bun", "run", "dist/index.js"]
```

---

## 6. Processes: Stateless Execution

### What to Do:

- **Never store state in memory that needs to persist between requests**
- Use backing services (Redis, databases) for session data
- Design processes to be ephemeral - they can be killed and restarted at any time
- Avoid in-memory caching unless it's genuinely ephemeral

### Checklist:

- [ ] Is session data stored in a database/Redis, not in-memory?
- [ ] Can a process be killed mid-request without data loss?
- [ ] Are file uploads immediately persisted to external storage?

### Example:

```ts
// Bad: Stateful in-memory session
const userSessions = new Map<string, { loggedIn: boolean }>(); // Lost on restart

app.post('/login', (req, res) => {
	userSessions.set(String(req.body.userId), { loggedIn: true });
	res.sendStatus(204);
});
```

```ts
// Good: Stateless with Redis-backed sessions
// connect-redis v8+ exports RedisStore as a named export (v7 used a default export)
import { RedisStore } from 'connect-redis';
import session from 'express-session';
import { createClient } from 'redis';

const redisClient = createClient({ url: config.redis.url });
await redisClient.connect();

app.use(
	session({
		store: new RedisStore({ client: redisClient }),
		secret: config.sessionSecret,
		resave: false,
		saveUninitialized: false,
	}),
);
```

```python
# Bad: In-memory cache
cache = {}

def get_user(user_id):
    if user_id in cache:
        return cache[user_id]
    user = db.query("SELECT * FROM users WHERE id = %s", [user_id])
    cache[user_id] = user
    return user

# Good: Redis-backed cache
import redis
redis_client = redis.from_url(REDIS_URL)

def get_user(user_id):
    cached = redis_client.get(f"user:{user_id}")
    if cached:
        return json.loads(cached)
    user = db.query("SELECT * FROM users WHERE id = %s", [user_id])
    redis_client.setex(f"user:{user_id}", 3600, json.dumps(user))
    return user
```

---

## 7. Port Binding: Self-Contained Service

### What to Do:

- Make the application export HTTP (or other protocol) services by binding to a port
- Don't rely on external web servers being injected at runtime
- The app should be runnable standalone

### Checklist:

- [ ] Does the app bind to a port specified in config?
- [ ] Can it be started with a single command?
- [ ] Is the port supplied through the application's runtime configuration?

### Example:

```ts
// server.ts
import express from 'express';

import { config } from './config';

const app = express();

app.get('/', (req, res) => {
	res.json({ status: 'ok' });
});

// Self-contained - binds to port and serves itself
const PORT = config.port;
app.listen(PORT, () => {
	console.log(`Server listening on port ${PORT}`);
});
```

```python
# app.py
from flask import Flask
import os

app = Flask(__name__)

@app.route('/')
def index():
    return {'status': 'ok'}

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
```

---

## 8. Concurrency: Process Model Scaling

### What to Do:

- Design for horizontal scaling (more processes, not bigger processes)
- Separate different types of work into different process types (web, worker, scheduler)
- Use durable queues for background work that must survive restarts or run across instances

### Checklist:

- [ ] Are long-running tasks moved to background workers?
- [ ] Can the app scale by running multiple instances?
- [ ] Are different workload types separated?

### Example:

```ts
// web.ts - Handles HTTP requests
import express from 'express';

import { queue } from './queue';

const app = express();

app.post('/process', async (req, res) => {
	// Don't block - enqueue for background processing
	await queue.add('process-data', req.body);
	res.json({ status: 'queued' });
});

app.listen(3000);
```

```ts
// worker.ts - Processes background jobs
import { Worker } from 'bullmq';

import { config } from './config';

const worker = new Worker(
	'process-data',
	async (job) => {
		// Long-running work happens here
		await processData(job.data);
	},
	{ connection: { host: config.redis.host } },
);
```

```yaml
# Procfile - declares process types
web: bun dist/web.js
worker: bun dist/worker.js
scheduler: bun dist/scheduler.js
```

---

## 9. Disposability: Fast Startup, Graceful Shutdown

### What to Do:

- Minimize startup time (lazy-load when possible)
- Handle SIGTERM gracefully - finish current work before exiting
- Make processes robust against sudden termination
- Return to a ready state quickly after crashes

### Checklist:

- [ ] Does the app handle SIGTERM/SIGINT?
- [ ] Are in-flight requests completed before shutdown?
- [ ] Does startup complete in seconds, not minutes?

### Example:

```ts
// server.ts with graceful shutdown
import express from 'express';
import type { Socket } from 'node:net';

const app = express();
const server = app.listen(3000);

// Track active connections
const connections = new Set<Socket>();

server.on('connection', (conn) => {
	connections.add(conn);
	conn.on('close', () => connections.delete(conn));
});

// Graceful shutdown handler
const shutdown = async (signal: string) => {
	console.log(`${signal} received, starting graceful shutdown`);

	// Stop accepting new connections
	server.close(() => {
		console.log('Server closed');
	});

	// Give existing requests time to complete
	setTimeout(() => {
		console.log('Forcing shutdown');
		connections.forEach((connection) => connection.destroy());
		process.exit(0);
	}, 30_000).unref(); // 30 second timeout
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

```python
# app.py with graceful shutdown
import signal
import sys
from flask import Flask

app = Flask(__name__)

def shutdown_handler(signum, frame):
    print('Shutdown signal received, cleaning up...')
    # Finish current work
    cleanup()
    sys.exit(0)

signal.signal(signal.SIGTERM, shutdown_handler)
signal.signal(signal.SIGINT, shutdown_handler)

if __name__ == '__main__':
    app.run()
```

---

## 10. Dev/Prod Parity: Minimize Environment Gaps

### What to Do:

- Use the same backing services in development as production (or close equivalents)
- Use reproducible tooling such as containers where it reduces environment drift
- Minimize the time between code writing and deployment
- Keep the same technology stack across all environments

### Checklist:

- [ ] Does development use the same database type as production?
- [ ] Are runtime and backing-service versions reproducible across environments?
- [ ] Are development dependencies clearly separated?

### Example:

```yaml
# docker-compose.yml - mirrors production services locally
# (the top-level `version:` key is obsolete in current Docker Compose and is omitted)
services:
    app:
        build: .
        ports:
            - '3000:3000'
        environment:
            - DATABASE_URL=postgresql://postgres:password@db:5432/myapp
            - REDIS_URL=redis://redis:6379
        depends_on:
            - db
            - redis

    db:
        image: postgres:18
        environment:
            - POSTGRES_PASSWORD=password
            - POSTGRES_DB=myapp

    redis:
        image: redis:8-alpine
```

---

## 11. Logs: Event Streams to STDOUT

> **Known deviation**: Spernakit and its derived apps always emit to stdout/stderr, but can also
> write an application-managed rotated file for self-hosted log collectors. Treat that optional
> file target as a documented operational exception to strict twelve-factor log routing.

### What to Do:

- Write all logs to `stdout` and `stderr`
- Never manage log files, log rotation, or log storage in the app
- Use structured logging (JSON) for easier parsing
- Let the execution environment handle log collection

### Checklist:

- [ ] Does the app write logs to stdout/stderr only?
- [ ] Are logs structured (JSON format)?
- [ ] Is there no log file management in the code?

### Example:

```ts
// logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
	format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
	transports: [
		// Only stdout - let the platform handle the rest
		new winston.transports.Console(),
	],
});

// Usage
logger.info('User logged in', { userId: 123, ip: '192.168.1.1' });
logger.error('Database connection failed', { error: 'connection refused' });
```

```python
# logger.py
import logging
import json
import sys

class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            'timestamp': self.formatTime(record),
            'level': record.levelname,
            'message': record.getMessage(),
            'module': record.module,
        }
        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)
        return json.dumps(log_data)

handler = logging.StreamHandler(sys.stdout)
handler.setFormatter(JsonFormatter())

logger = logging.getLogger(__name__)
logger.addHandler(handler)
logger.setLevel(logging.INFO)

# Usage
logger.info('User logged in', extra={'user_id': 123})
```

---

## 12. Admin Processes: One-Off Tasks

### What to Do:

- Include admin/management scripts in the codebase
- Run admin tasks in the same environment as the app
- Make database migrations, data imports, etc. part of the release
- Use the same dependencies and config as the main app

### Checklist:

- [ ] Are database migrations version-controlled with the code?
- [ ] Can admin tasks be run with simple commands?
- [ ] Do admin tasks use the same config system?

### Example:

```json
{
	"scripts": {
		"console": "bun scripts/repl.ts",
		"migrate": "bun scripts/migrate.ts",
		"seed": "bun scripts/seed.ts"
	}
}
```

```ts
// scripts/migrate.ts
import { config } from '../src/config';
import { query } from '../src/database';

// Uses the same config and database connection as the app
async function migrate() {
	console.log('Running migrations...');
	await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
	console.log('Migrations complete');
}

migrate()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
```

```python
# manage.py
import sys
from app import db, config

def migrate():
    """Run database migrations"""
    # Uses same db connection as app
    db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    print("Migrations complete")

def seed():
    """Seed database with test data"""
    db.execute(
        "INSERT INTO users (email) VALUES (%s) ON CONFLICT DO NOTHING",
        ['example@example.com'],
    )
    print("Seed complete")

if __name__ == '__main__':
    command = sys.argv[1] if len(sys.argv) > 1 else 'help'

    if command == 'migrate':
        migrate()
    elif command == 'seed':
        seed()
    else:
        print("Available commands: migrate, seed")
```

---

## Quick Reference Checklist

When writing code, verify:

- [ ] **Codebase:** One version-controlled codebase, with shared code declared as dependencies
- [ ] **Dependencies:** All in manifest file with versions
- [ ] **Config:** Deploy-varying config is externalized; deliberate deviations are documented
- [ ] **Backing Services:** Services accessed via config URLs
- [ ] **Build/Release/Run:** Config separate from build artifacts
- [ ] **Processes:** No in-memory state that must persist
- [ ] **Port Binding:** App binds to a runtime-configured port
- [ ] **Concurrency:** Durable background work uses a cross-process queue
- [ ] **Disposability:** SIGTERM handler implemented
- [ ] **Dev/Prod Parity:** Runtime and backing-service versions remain reproducible
- [ ] **Logs:** Event streams go to stdout/stderr; any extra file target is a documented exception
- [ ] **Admin:** Management scripts in repo, use same config

---

## Common Anti-Patterns to Avoid

❌ Hardcoded credentials or config
❌ In-memory session storage
❌ Relying on process-local files for state that must survive restart or scale-out
❌ Assuming specific system packages installed
❌ Managing log files in the application without an explicit operational exception
❌ Relying only on in-process threads for work that must scale across instances
❌ Direct filesystem dependency sharing between processes
❌ Config files committed with secrets

---

## References

External sources behind the methodology and version examples:

- The Twelve-Factor App methodology: <https://12factor.net/>
- Express 5 documentation: <https://expressjs.com/en/5x/api.html>
- connect-redis (v8+ named-export API): <https://www.npmjs.com/package/connect-redis>
- node-postgres (`pg`): <https://node-postgres.com/>
- PostgreSQL release/EOL tracker: <https://endoflife.date/postgresql>
- Redis licensing (AGPLv3 tri-license): <https://redis.io/blog/agplv3/> · Valkey: <https://valkey.io/>
- Node.js release/EOL tracker: <https://endoflife.date/nodejs>
- Bun (container base image): <https://bun.com/guides/ecosystem/docker>
