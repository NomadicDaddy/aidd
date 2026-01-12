## TOOL SELECTION GUIDE

**Use the right tool for each operation. This improves reliability, cross-platform compatibility, and performance.**

### Tool Selection Hierarchy

**ALWAYS PREFER (in order):**

### 1. MCP Filesystem Tools (HIGHEST PRIORITY)

**Use MCP tools for ALL file operations:**

**mcp_filesystem_read_text_file** - Reading file contents

- ✅ Reading source code files
- ✅ Reading configuration files
- ✅ Reading JSON, YAML, Markdown, etc.
- ✅ Inspecting test results
- ❌ NOT for: Binary files (use appropriate tool)

**mcp_filesystem_list_directory** - Listing directory contents

- ✅ Exploring project structure
- ✅ Finding files in a directory
- ✅ Checking if files exist
- ❌ NOT for: Recursive searches (use search instead)

**mcp_filesystem_search_files** - Searching for files and content

- ✅ Finding files by name pattern
- ✅ Searching code for specific strings
- ✅ Locating configuration files
- ✅ Counting occurrences (e.g., `"passes": false`)
- ❌ NOT for: Complex regex (use list_code_definition_names)

**mcp_filesystem_edit_file** - Editing files

- ✅ Making targeted code changes
- ✅ Updating configuration files
- ✅ Modifying JSON (with verification)
- ⚠️ ALWAYS verify after editing (see file-integrity.md)

**list_code_definition_names** - Analyzing code structure

- ✅ Mapping codebase architecture
- ✅ Finding classes, functions, interfaces
- ✅ Understanding module exports
- ⚠️ **IMPORTANT:** Only processes files at the top level of specified directory
- ⚠️ To explore subdirectories, call on each subdirectory path individually

**Why prefer MCP tools:**

- Cross-platform compatibility (Windows, Mac, Linux)
- No shell syntax differences
- More reliable than shell commands
- Better error handling
- Consistent behavior

### 2. execute_command (USE ONLY FOR SHELL OPERATIONS)

**Use execute_command for operations requiring shell execution:**

**Git operations:**

```bash
git status
git diff
git log --oneline -20
git add .
git commit -m "message"
git checkout -- file
```

**Package managers:**

```bash
npm install
npm run build
npm run test
bun install
bun run dev
pip install -r requirements.txt
```

**Test runners:**

```bash
npm test
pytest
jest
cargo test
```

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

**Why use execute_command:**

- Operations that require shell features (pipes, redirection)
- Tools that don't have MCP equivalents
- Git and package manager operations
- Process management

### 3. browser_action (FOR UI VERIFICATION)

**Use browser_action for all UI testing:**

**browser_action.launch** - Open browser

```
browser_action.launch http://localhost:3000
```

**browser_action.click** - Click elements

```
browser_action.click "Login Button"
browser_action.click "#submit-btn"
```

**browser_action.type** - Type text

```
browser_action.type "email" "test@example.com"
browser_action.type "password" "secret123"
```

**browser_action.screenshot** - Capture screen

```
browser_action.screenshot "login-page"
```

**Why use browser_action:**

- Only way to verify actual UI
- Tests real user experience
- Catches visual bugs
- Validates end-to-end flows

### NEVER Use These Commands

**DON'T use execute_command for these operations:**

❌ `cat`, `type`, `more`, `less` → Use `mcp_filesystem_read_text_file`
❌ `ls`, `dir` → Use `mcp_filesystem_list_directory`
❌ `find`, `grep`, `rg` → Use `mcp_filesystem_search_files`
❌ `echo ... > file` → Use `mcp_filesystem_edit_file` or `execute_command` with verification
❌ `sed`, `awk` → Use `mcp_filesystem_edit_file`
❌ `head`, `tail` → Use `mcp_filesystem_read_text_file` with limit/offset

**Why avoid these:**

- Shell command syntax differs (Windows vs Unix)
- Less reliable error handling
- Permission issues more common
- Output parsing complexity

### Decision Tree

```
Need to operate on files?
├─ Reading file contents?
│  └─ Use: mcp_filesystem_read_text_file
├─ Listing directory?
│  └─ Use: mcp_filesystem_list_directory
├─ Searching for files/content?
│  └─ Use: mcp_filesystem_search_files
├─ Editing file?
│  └─ Use: mcp_filesystem_edit_file (+ verify after!)
└─ Analyzing code structure?
   └─ Use: list_code_definition_names

Need to run shell operations?
├─ Git operation?
│  └─ Use: execute_command (git ...)
├─ Package manager?
│  └─ Use: execute_command (npm/bun/pip ...)
├─ Test runner?
│  └─ Use: execute_command (npm test/pytest ...)
└─ Build tool?
   └─ Use: execute_command (npm run build ...)

Need to verify UI?
├─ Launch browser?
│  └─ Use: browser_action.launch
├─ Interact with UI?
│  └─ Use: browser_action.click / .type / .scroll_*
└─ Capture screenshot?
   └─ Use: browser_action.screenshot
```

### Common Tool Selection Mistakes

**MISTAKE 1: Using cat instead of MCP**

```bash
# ❌ WRONG
execute_command: cat src/App.tsx

# ✅ CORRECT
mcp_filesystem_read_text_file: src/App.tsx
```

**MISTAKE 2: Using grep instead of MCP**

```bash
# ❌ WRONG
execute_command: grep -r "TODO" src/

# ✅ CORRECT
mcp_filesystem_search_files: pattern="TODO", path="src/"
```

**MISTAKE 3: Using curl instead of browser_action**

```bash
# ❌ WRONG (for UI testing)
execute_command: curl http://localhost:3000

# ✅ CORRECT
browser_action.launch http://localhost:3000
```

**MISTAKE 4: Using echo for file editing**

```bash
# ❌ WRONG
execute_command: echo '{"key": "value"}' > config.json

# ✅ CORRECT
mcp_filesystem_edit_file: old_string="...", new_string='{"key": "value"}'
# Then: mcp_filesystem_read_text_file to verify
```

### Shell Adaptation Guidelines

**If you must use execute_command for file operations:**

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
# Use MCP tools with specific queries
```

### Tool Selection Checklist

Before using execute_command, ask:

- [ ] Can this be done with mcp*filesystem*\*? (If yes, use MCP)
- [ ] Is this a git/npm/build operation? (If yes, execute_command is OK)
- [ ] Am I testing UI? (If yes, use browser_action)
- [ ] Will this work cross-platform? (Consider shell differences)
- [ ] Is there a simpler MCP alternative? (Prefer simpler)

### Performance Considerations

**Fast operations (prefer):**

- mcp_filesystem_read_text_file (< 100ms)
- mcp_filesystem_list_directory (< 50ms)
- mcp_filesystem_search_files (< 500ms for small projects)

**Slower operations (use when necessary):**

- execute_command with complex pipelines (variable)
- list_code_definition_names on large codebases (1-5 seconds)
- browser_action operations (1-3 seconds per action)

**Optimization tips:**

- Batch MCP operations when possible
- Avoid redundant file reads
- Cache directory listings mentally
- Minimize browser_action roundtrips
