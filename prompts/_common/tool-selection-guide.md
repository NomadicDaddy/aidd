## TOOL SELECTION GUIDE

**Use the right tool for each operation. This improves reliability, cross-platform compatibility, and performance.**

### Tool Selection Hierarchy

**ALWAYS PREFER (in order):**

### 1. File Tools (HIGHEST PRIORITY)

**Use your environment's file tools for ALL file operations (see CLI reference for exact tool names and syntax):**

**File read tool** - Reading file contents

- ✅ Reading source code files
- ✅ Reading configuration files
- ✅ Reading JSON, YAML, Markdown, etc.
- ✅ Inspecting test results
- ❌ NOT for: Binary files (use appropriate tool)

**Directory list tool** - Listing directory contents

- ✅ Exploring project structure
- ✅ Finding files in a directory
- ✅ Checking if files exist
- ❌ NOT for: Recursive searches (use search instead)

**File/content search tool** - Searching for files and content

- ✅ Finding files by name pattern
- ✅ Searching code for specific strings
- ✅ Locating configuration files
- ✅ Counting occurrences (e.g., `"passes": false`)
- ❌ NOT for: Deep code-structure analysis (use a code-structure/index tool if available)

**File edit tool** - Editing files

- ✅ Making targeted code changes
- ✅ Updating configuration files
- ✅ Modifying JSON (with verification)
- ⚠️ ALWAYS verify after editing (see file-integrity.md)

**Code structure/index tool** - Analyzing code structure

- ✅ Mapping codebase architecture
- ✅ Finding classes, functions, interfaces
- ✅ Understanding module exports
- ⚠️ Directory-scope behavior varies by CLI — see your CLI reference

**Why prefer file tools:**

- Cross-platform compatibility (Windows, Mac, Linux)
- No shell syntax differences
- More reliable than shell commands
- Better error handling
- Consistent behavior

### 2. Shell Execution Tool (USE ONLY FOR SHELL OPERATIONS)

**Use your environment's shell execution tool for operations requiring shell execution (see CLI reference for exact tool name and syntax):**

**Git operations:**

```bash
git status
git diff
git log --oneline -20
git add <path/to/file1> <path/to/file2>
git diff --staged
git commit -m "type(scope): description"
git checkout -- file
```

**Package managers:**

```bash
bun install
bun run build
bun run start           # Spernakit: non-blocking detached startup (DO NOT use `bun run dev` — it blocks)
npm install             # Fallback for non-Bun projects only
```

**IMPORTANT: No Test Suite Installation**

DO NOT install or create test suites, test harnesses, or testing frameworks.

**Pre-existing test suites may be run if they already exist in the project:**

```bash
bun run test      # Only if tests already exist
npm test          # Only if tests already exist (non-Bun projects)
```

**DO NOT install or create:**

- Jest, Vitest, Mocha, or any test framework
- Testing libraries or utilities
- Test runner setups or fixture files

**Prefer browser automation for UI verification (see testing-requirements.md).**

**Build tools:**

```bash
bun run build     # npm run build for non-Bun projects
tsc
vite build
```

**Process checks:**

```bash
ps aux | grep vite
lsof -ti:3000
netstat -ano | findstr :3000
```

**Why use shell execution:**

- Operations that require shell features (pipes, redirection)
- Tools that don't have file tool equivalents
- Git and package manager operations
- Process management

### 3. Browser Automation Tool (FOR UI VERIFICATION)

**Use your environment's browser automation tool for all UI testing (see CLI reference for exact tool name and syntax):**

**Launch** - Open browser

```
[browser tool] launch <app-url>
```

**Click** - Click elements

```
[browser tool] click "Login Button"
[browser tool] click "#submit-btn"
```

**Type** - Type text

```
[browser tool] type "email" "test@example.com"
[browser tool] type "password" "secret123"
```

**Screenshot** - Capture screen

```
[browser tool] screenshot "login-page"
```

**Why use browser automation:**

- Only way to verify actual UI
- Tests real user experience
- Catches visual bugs
- Validates end-to-end flows

### NEVER Use Shell Commands for File Operations

**DON'T use your shell execution tool for these operations:**

❌ `cat`, `type`, `more`, `less` → Use your file read tool
❌ `ls`, `dir` → Use your directory list tool
❌ `find`, `grep`, `rg` → Use your file/content search tool
❌ `echo ... > file` → Use your file edit tool (or shell execution only with strict verification)
❌ `sed`, `awk` → Use your file edit tool
❌ `head`, `tail` → Use your file read tool (with limit/offset if supported)

**Why avoid these:**

- Shell command syntax differs (Windows vs Unix)
- Less reliable error handling
- Permission issues more common
- Output parsing complexity

### Shell Adaptation Guidelines

**If you must use shell execution for file operations:**

**Know your shell:**

- Run `pwd` when shell context is unclear, then choose syntax and paths from the result:
    - `C:\Users\<you>` means PowerShell; use Windows paths like `D:\workspace\...`
    - `/c/Users/<you>` means Git Bash; use drive-mounted paths like `/d/workspace/...`
    - `/home/<you>` means WSL Bash; use mounted paths like `/mnt/d/workspace/...`
- Git Bash on Windows: Unix-like commands
- PowerShell on Windows: Different syntax
- Bash/Zsh on Mac/Linux: Unix commands

**Adapt commands to shell:**

```bash
# Bash/Zsh
find .aidd/features -name 'feature.json' -exec grep -l '"passes": false' {} \; | wc -l

# PowerShell
(Get-ChildItem .aidd/features -Recurse -Filter feature.json | Select-String '"passes": false').Count
```

**Prefer shell-agnostic approaches:**

```bash
# Instead of complex shell pipelines
# Use file tools with specific queries
```

### Tool Selection Checklist

Before using shell execution, ask:

- [ ] Can this be done with file tools? (If yes, use file tools)
- [ ] Is this a git/npm/build operation? (If yes, shell execution is OK)
- [ ] Am I testing UI? (If yes, use browser automation)
- [ ] Will this work cross-platform? (Consider shell differences)
- [ ] Is there a simpler file tool alternative? (Prefer simpler)
