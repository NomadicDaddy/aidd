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

- Assume the project uses version control (Git)
- Never generate code that depends on files outside the repository
- When creating new features, ensure they integrate with the existing codebase structure
- If creating a new project, establish a clear repository structure from the start

### Checklist:

- [ ] Does this code belong in the existing repository structure?
- [ ] Are there no hardcoded absolute paths to local files?
- [ ] Can this code be committed and deployed from a single repo?

### Example:

```ts
// Bad: Assumes files outside the repo
import config from './config.json';

// Good: Uses paths relative to the project root
import config from '../config/default.json';
```

---

## 2. Dependencies: Explicit Declaration

### What to Do:

- Always declare dependencies in the appropriate manifest file
- Never assume system packages are available
- Include version constraints to ensure reproducibility
- Document any system-level requirements in a README or setup script

### Checklist:

- [ ] Are all libraries added to `package.json`, `requirements.txt`, `Gemfile`, etc.?
- [ ] Are version ranges specified appropriately?
- [ ] Are both runtime and development dependencies properly categorized?

### Example:

```json
// package.json
{
	"dependencies": {
		"express": "^5.2.0",
		"pg": "^8.16.0"
	},
	"devDependencies": {
		"@types/express": "^5.0.0",
		"typescript": "^5.8.0"
	}
}
```

```python
# requirements.txt
flask==3.1.0
psycopg2-binary==2.9.9
redis==5.2.0
```

---

## 3. Config: Externalized Configuration

### What to Do:

- **Never hardcode credentials, API keys, or environment-specific values**
- Externalize all config that varies between environments
- Choose ONE configuration strategy per project and use it consistently:
    - **Environment variables** (`.env` files) - traditional 12-factor approach
    - **JSON configuration files** - explicit, structured configuration (e.g., Spernakit uses `config/{appname}.json`)
- Provide example configuration with dummy values
- Use config libraries appropriate to the language

### Checklist:

- [ ] Are all secrets/credentials externalized (not in source code)?
- [ ] Is there example configuration documentation?
- [ ] Are config files with real values excluded from version control?
- [ ] Are sensible defaults provided where appropriate?

### Example (Environment Variables):

```ts
// config.ts - .env approach
export const config = {
	port: process.env.PORT || 3000,
	database: {
		url: process.env.DATABASE_URL,
		poolSize: parseInt(process.env.DB_POOL_SIZE || '10'),
	},
	apiKey: process.env.API_KEY,
	nodeEnv: process.env.NODE_ENV || 'development',
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
// config.ts - JSON config approach (Spernakit pattern)
import configJson from '../config/myapp.json';

export const config = {
	port: configJson.server.backendPort,
	database: {
		url: configJson.database.url,
	},
	jwtSecret: configJson.security.jwtSecret,
};

// Validate required config on startup
if (!config.jwtSecret) {
	throw new Error('security.jwtSecret is required in config JSON');
}
```

```json
// config/myapp.example.json
{
	"database": { "url": "file:./data/myapp.db" },
	"security": { "jwtSecret": "your-secret-here" },
	"server": { "backendPort": 3331 }
}
```

**Note**: When using JSON config, disable automatic `.env` loading (e.g., `env = false` in `bunfig.toml`) to ensure explicit configuration management.

---

## 4. Backing Services: Attached Resources

### What to Do:

- Access all external services (databases, caches, queues, APIs) through URLs or connection strings from config
- Write code that can swap services without modification (e.g., local Postgres → AWS RDS)
- Use connection pooling and graceful handling of service unavailability

### Checklist:

- [ ] Can the database be swapped by changing a URL?
- [ ] Are service connections configured via environment variables?
- [ ] Is there error handling for service unavailability?

### Example:

```ts
// database.ts
import { Pool } from 'pg';

import { config } from './config';

// Service is "attached" via config - can be swapped easily
const pool = new Pool({
	connectionString: config.database.url,
	max: config.database.poolSize,
});

export const query = (text: string, params?: any[]) => {
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
// package.json scripts
{
	"scripts": {
		"build": "tsc",
		"dev": "ts-node-dev src/index.ts",
		"start": "node dist/index.js"
	}
}
```

```dockerfile
# Dockerfile showing clear stages
# BUILD STAGE
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# RUN STAGE (config comes from environment at runtime)
FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["bun", "dist/index.js"]
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
// Good: Stateless with Redis-backed sessions
// Note: connect-redis v8+ exports RedisStore as a NAMED export (v7 used a default export)
import { RedisStore } from 'connect-redis';
import session from 'express-session';
import { createClient } from 'redis';

// Bad: Stateful in-memory session
let userSessions = {}; // Lost when process restarts

app.post('/login', (req, res) => {
	userSessions[req.body.userId] = { loggedIn: true };
});

const redisClient = createClient({ url: config.redis.url });

app.use(
	session({
		store: new RedisStore({ client: redisClient }),
		secret: config.sessionSecret,
		resave: false,
		saveUninitialized: false,
	})
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
- [ ] Is the port configurable via environment variable?

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
- Use job queues for background work instead of threads

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
	{ connection: { host: config.redis.host } }
);
```

```yaml
# Procfile - declares process types
web: node dist/web.js
worker: node dist/worker.js
scheduler: node dist/scheduler.js
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

const app = express();
const server = app.listen(3000);

// Track active connections
let connections = new Set();

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
		connections.forEach((conn) => conn.destroy());
		process.exit(0);
	}, 30000); // 30 second timeout
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
- Use Docker/containers to standardize the environment
- Minimize the time between code writing and deployment
- Keep the same technology stack across all environments

### Checklist:

- [ ] Does development use the same database type as production?
- [ ] Is Docker or similar containerization used?
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

> **Known deviation**: The Pode/Deeper stack intentionally deviates from this factor with file-based logging plus rotation (see `pode-guidelines`).

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
logger.error('Database connection failed', { error: err.message });
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
// package.json
{
	"scripts": {
		"console": "node scripts/repl.js",
		"migrate": "node scripts/migrate.js",
		"seed": "node scripts/seed.js"
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
    # Uses same db connection
    pass

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

- [ ] **Codebase:** No absolute paths or external dependencies
- [ ] **Dependencies:** All in manifest file with versions
- [ ] **Config:** Secrets in env vars, `.env.example` provided
- [ ] **Backing Services:** Services accessed via config URLs
- [ ] **Build/Release/Run:** Config separate from build artifacts
- [ ] **Processes:** No in-memory state that must persist
- [ ] **Port Binding:** App binds to configurable port
- [ ] **Concurrency:** Background work uses job queues
- [ ] **Disposability:** SIGTERM handler implemented
- [ ] **Dev/Prod Parity:** Docker/containers for consistency
- [ ] **Logs:** Only stdout/stderr, structured format
- [ ] **Admin:** Management scripts in repo, use same config

---

## Common Anti-Patterns to Avoid

❌ Hardcoded credentials or config
❌ In-memory session storage
❌ Writing to local filesystem (except temp)
❌ Assuming specific system packages installed
❌ Managing log files in the application
❌ Multi-threaded scaling within a single process
❌ Direct filesystem dependency sharing between processes
❌ Config files committed with secrets

---

## References

External sources behind the methodology and version examples:

- The Twelve-Factor App methodology: <https://12factor.net/>
- Express 5 release notes: <https://expressjs.com/en/blog/2025-03-31-v5-1-latest-release/>
- connect-redis (v8+ named-export API): <https://www.npmjs.com/package/connect-redis>
- node-postgres (`pg`): <https://node-postgres.com/>
- PostgreSQL release/EOL tracker: <https://endoflife.date/postgresql>
- Redis licensing (AGPLv3 tri-license): <https://redis.io/blog/agplv3/> · Valkey: <https://valkey.io/>
- Node.js release/EOL tracker: <https://endoflife.date/nodejs>
- Bun (container base image): <https://bun.com/guides/ecosystem/docker>
- Container practices: see `docker-guidelines`
