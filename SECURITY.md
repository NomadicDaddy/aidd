# Security Policy

## Supported Versions

AIDD is currently in active development. Security updates will be applied to the latest version on the `main` branch.

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in AIDD, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email the maintainer directly (check GitHub profile for contact info)
3. Include:
    - Description of the vulnerability
    - Steps to reproduce
    - Potential impact
    - Any suggested fixes

We will acknowledge receipt within 48 hours and provide a more detailed response within 7 days.

## Security Considerations

### Prompt Injection

AIDD executes AI-generated commands and code. Users should:

- Review iteration logs in `.automaker/iterations/`
- Monitor git commits for unexpected changes
- Use in controlled environments
- Not use on production systems without review

### File System Access

AIDD has full file system access within project directories. Users should:

- Only run AIDD on projects they control
- Review the `copydirs.txt` file before using shared directory sync
- Ensure proper file permissions on sensitive directories

### API Keys and Credentials

AIDD relies on OpenCode or KiloCode CLIs for AI access. Users should:

- Follow the security guidelines of their chosen CLI
- Ensure API keys are properly secured
- Not commit API keys to version control
- Use environment variables for sensitive configuration

### Dependencies

AIDD is a shell script with minimal dependencies:

- Bash 4.0+
- OpenCode or KiloCode CLI
- jq (optional)
- rsync (optional, falls back to cp)

Users should ensure these dependencies come from trusted sources.

## Best Practices

1. **Review AI-generated code** before committing to production
2. **Use version control** to track all AIDD changes
3. **Test in isolated environments** before production use
4. **Monitor iteration logs** for unexpected behavior
5. **Keep CLIs updated** to latest secure versions
6. **Use project-specific rules** (`.automaker/project.md`) to enforce constraints

## Scope

AIDD is a development tool intended for use by developers on their own projects. It is not designed for:

- Production deployment
- Multi-tenant environments
- Untrusted code execution
- Security-critical applications without human review

## Acknowledgments

We appreciate responsible disclosure of security vulnerabilities. Contributors who report valid security issues will be acknowledged (with permission) in release notes.
