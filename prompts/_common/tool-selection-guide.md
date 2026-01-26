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
- ⚠️ **IMPORTANT:** Only processes files at the top level of specified directory
- ⚠️ To explore subdirectories, call on each subdirectory path individually

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
git commit -m "message"
git checkout -- file
```

**Package managers:**

```bash
npm install
npm run build
bun install
bun run dev
pip install -r requirements.txt
```

**IMPORTANT: No Test Runners or Testing Frameworks**

DO NOT install or use:

- npm test
- pytest
- jest
- cargo test
- Any other test runners or frameworks

**Only use browser automation for testing.**

**Build tools:**

```bash
npm run build
webpack
vite build
tsc
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
[browser tool] launch http://localhost:3000
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

### Decision Tree

```
Need to operate on files? (See CLI reference for exact tool names)
├─ Reading file contents?
│  └─ Use: File read tool
├─ Listing directory?
│  └─ Use: Directory list tool
├─ Searching for files/content?
│  └─ Use: File/content search tool
├─ Editing file?
│  └─ Use: File edit tool (+ verify after!)
└─ Analyzing code structure?
   └─ Use: Code structure/index tool

Need to run shell operations?
├─ Git operation?
│  └─ Use: Shell execution tool (git ...)
├─ Package manager?
│  └─ Use: Shell execution tool (npm/bun/pip ...)
├─ Test runner?
│  └─ Use: Shell execution tool (npm test/pytest ...)
└─ Build tool?
   └─ Use: Shell execution tool (npm run build ...)

Need to verify UI?
├─ Launch browser?
│  └─ Use: Browser automation tool (launch)
├─ Interact with UI?
│  └─ Use: Browser automation tool (click/type/scroll)
└─ Capture screenshot?
   └─ Use: Browser automation tool (screenshot)
```

### Common Tool Selection Mistakes

**MISTAKE 1: Using cat instead of file tools**

```bash
# ❌ WRONG
[shell execution tool]: cat src/App.tsx

# ✅ CORRECT
[file read tool]: src/App.tsx
```

**MISTAKE 2: Using grep instead of file tools**

```bash
# ❌ WRONG
[shell execution tool]: grep -r "TODO" src/

# ✅ CORRECT
[file/content search tool]: pattern="TODO", path="src/"
```

**MISTAKE 3: Using curl instead of browser automation**

```bash
# ❌ WRONG (for UI testing)
[shell execution tool]: curl http://localhost:3000

# ✅ CORRECT
[browser automation tool] launch http://localhost:3000
```

**MISTAKE 4: Using echo for file editing**

```bash
# ❌ WRONG
[shell execution tool]: echo '{"key": "value"}' > config.json

# ✅ CORRECT
[file edit tool]: old_string="...", new_string='{"key": "value"}'
# Then: [file read tool] to verify
```

### Shell Adaptation Guidelines

**If you must use shell execution for file operations:**

**Know your shell:**

- Git Bash on Windows: Unix-like commands
- PowerShell on Windows: Different syntax
- Bash/Zsh on Mac/Linux: Unix commands

**Adapt commands to shell:**

```bash
# Bash/Zsh
find .automaker/features -name 'feature.json' -exec grep -l '"passes": false' {} \; | wc -l

# PowerShell
(Get-ChildItem .automaker/features -Recurse -Filter feature.json | Select-String '"passes": false').Count
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

### Performance Considerations

**Fast operations (prefer):**

- File read tool (< 100ms)
- Directory list tool (< 50ms)
- File/content search tool (< 500ms for small projects)

**Slower operations (use when necessary):**

- Shell execution with complex pipelines (variable)
- Code structure/index on large codebases (1-5 seconds)
- Browser automation operations (1-3 seconds per action)

**Optimization tips:**

- Batch file tool operations when possible
- Avoid redundant file reads
- Cache directory listings mentally
- Minimize browser automation roundtrips
