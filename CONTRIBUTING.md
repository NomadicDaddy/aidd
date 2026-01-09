# Contributing to AIDD

Thank you for your interest in contributing to AIDD (AI Development Driver)! This document provides guidelines for contributing to the project.

## Code of Conduct

This project follows a simple code of conduct: be respectful, constructive, and collaborative. We welcome contributions from everyone.

## How to Contribute

### Reporting Bugs

If you find a bug, please open an issue with:

- A clear, descriptive title
- Steps to reproduce the bug
- Expected vs actual behavior
- Your environment (OS, Bash version, CLI being used)
- Relevant log files from `.aidd/iterations/`

### Suggesting Enhancements

Enhancement suggestions are welcome! Please open an issue with:

- A clear description of the enhancement
- Why it would be useful
- Example use cases
- Any implementation ideas you have

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** following the coding style of the project
3. **Test your changes** thoroughly:
    - Test with both OpenCode and KiloCode if applicable
    - Test new project initialization
    - Test existing codebase onboarding
    - Test iteration workflows
4. **Update documentation** if needed (README.md, prompts/, etc.)
5. **Commit your changes** with clear, descriptive commit messages
6. **Push to your fork** and submit a pull request

### Pull Request Guidelines

- Keep PRs focused on a single feature or fix
- Include a clear description of what the PR does
- Reference any related issues
- Update relevant documentation
- Follow existing code style and conventions

### Development Setup

```bash
# Clone your fork
git clone https://github.com/your-username/aidd.git
cd aidd

# Make the script executable
chmod +x aidd.sh

# Test with a sample project
./aidd.sh --project-dir /path/to/test/project --spec specs/example.md
```

## Project Structure

- `aidd.sh` - Main entry point
- `lib/` - Core library modules
    - `config.sh` - Configuration constants
    - `utils.sh` - Utility functions
    - `args.sh` - Argument parsing
    - `cli-factory.sh` - CLI abstraction
    - `project.sh` - Project management
    - `iteration.sh` - Iteration handling
- `prompts/` - Prompt templates for AI agents
    - `_common/` - Shared prompt modules
    - `onboarding.md` - Existing codebase prompt
    - `initializer.md` - New project prompt
    - `coding.md` - Development iterations prompt
    - `todo.md` - TODO mode prompt
- `scaffolding/` - Template files for new projects
- `artifacts/` - Project metadata templates
- `specs/` - Example specification files

## Coding Style

- Use 4-space indentation in shell scripts
- Follow [Google Shell Style Guide](https://google.github.io/styleguide/shellguide.html) where applicable
- Add comments for complex logic
- Use descriptive variable names
- Prefer `[[ ]]` over `[ ]` for conditionals
- Use `local` for function-scoped variables
- Quote all variables to prevent word splitting

## Testing

Before submitting a PR, test your changes with:

- A new empty project
- An existing codebase
- Both OpenCode and KiloCode (if modifying CLI-related code)
- Edge cases (missing files, invalid arguments, etc.)

## Documentation

- Update README.md if adding new features
- Update prompt files if changing agent behavior
- Add comments to shell scripts for complex logic
- Update CHANGELOG if we create one

## Questions?

Feel free to open an issue with your question or reach out to the maintainers.

## License

By contributing to AIDD, you agree that your contributions will be licensed under the MIT License.
