# Project Structure (Template)

## Overview

{1-3 paragraphs describing what this project is, who it serves, and the primary constraints.}

## Repository Layout

### Root Level

```
{repo_name}/
├── {dir}/                     # {purpose}
└── {dir}/                     # {purpose}
```

### Backend Layout ({backend_dir}/)

```
{backend_dir}/
├── src/
│   ├── {entrypoint}.{ext}     # {purpose}
│   ├── controllers/           # {purpose}
│   ├── services/              # {purpose}
│   ├── routes/                # {purpose}
│   ├── middleware/            # {purpose}
│   └── utils/                 # {purpose}
└── {orm_or_db_dir}/           # {schema/migrations}
```

### Frontend Layout ({frontend_dir}/)

```
{frontend_dir}/
├── src/
│   ├── pages/                 # {purpose}
│   ├── components/            # {purpose}
│   ├── hooks/                 # {purpose}
│   ├── services/              # {purpose}
│   └── types/                 # {purpose}
└── public/                    # {purpose}
```

## Key Concepts / Modules

### {Module Name}

- **Responsibility**: {what it owns}
- **Key files**:
    - `{path}`
- **Primary entry points**:
    - `{function/route/component}`

## Technology Stack

### Backend

- **Runtime**: {node/bun/dotnet/etc}
- **Framework**: {express/fastify/etc}
- **Database**: {sqlite/postgres/etc}
- **Auth**: {jwt/sessions/etc}

### Frontend

- **Framework**: {react/svelte/etc}
- **Routing**: {router}
- **State/Data**: {tanstack query/redux/etc}
- **Styling**: {tailwind/daisyui/etc}

## Data Model Overview

- **Entities**:
    - {Entity}: {why it exists}

## API Overview

- **Base path**: {e.g. /api}
- **Auth model**: {cookie/bearer/etc}

## Development Workflow

- **Install**: `{command}`
- **Dev**: `{command}`
- **Tests**: `{command}`
- **Build**: `{command}`

## Notes / Gotchas

- {Anything that is non-obvious and would bite a new contributor}
