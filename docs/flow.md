# AIDD-x Execution Flow Diagram

```mermaid
graph TD
    A[Start aidd-*.sh] --> B[Parse Command Line Arguments]
    B --> C[Check Required Arguments]
    C --> D{Project Dir Provided?}
    D -->|No| E[Show Error & Exit]
    D -->|Yes| F[Get Script Directory]

    F --> G[Resolve Effective Models]
    G --> H[Build Model Args (init vs code)]

    H --> I[Check if Existing Codebase]
    I --> J{Dir Exists & Has Non-Ignored Files?}
    J -->|No| K[Set NEEDS_SPEC=true]
    J -->|Yes| L[Set NEEDS_SPEC=false]

    K --> M{NEEDS_SPEC && Spec Provided?}
    L --> M
    M -->|No (and NEEDS_SPEC)| N[Show Error & Exit]
    M -->|Yes/Not Needed| O[Ensure Project Directory Exists]

    O --> P{Project Dir Exists?}
    P -->|No| Q[Create Project Directory]
    Q --> R[Copy Scaffolding Files]
    R --> S[Copy Artifacts to .aidd]
    S --> T[Mark NEW_PROJECT_CREATED=true]
    P -->|Yes| U[Maybe Print Existing Codebase Detected]

    T --> V[If Spec File Provided, Validate It Exists]
    U --> V
    V --> W[Define Paths: .aidd/spec.txt, feature_list.json, iterations/]
    W --> X[Create Iterations Directory]
    X --> Y[Get Next Log Index]
    Y --> Z[Init Failure Counter]
    Z --> AA[Set Cleanup Trap (--no-clean disables)]

    AA --> AB{Max Iterations Set?}
    AB -->|No| AC[Run Unlimited Iterations]
    AB -->|Yes| AD[Run Limited Iterations]

    AC --> AE[Iteration Loop Start]
    AD --> AE
    AE --> AF[Create Log File]
    AF --> AG[Start Logging via tee]
    AG --> AH[Compute ONBOARDING_COMPLETE]
    AH --> AI{Have spec+feature_list AND onboarding complete?}

    AI -->|Yes| AJ[Send Coding Prompt]
    AI -->|No| AK{Existing Codebase AND not NEW_PROJECT_CREATED?}

    AK -->|Yes| AL[Copy Artifacts (no overwrite)]
    AL --> AM[Send Onboarding Prompt]

    AK -->|No| AN[Copy Artifacts (no overwrite)]
    AN --> AO[If Spec Provided, Copy to .aidd/spec.txt]
    AO --> AP[Send Initializer Prompt]

    AJ --> AQ[run_tool_prompt]
    AM --> AQ
    AP --> AQ

    AQ --> AR{tool exit code == 0?}
    AR -->|Yes| AS[Reset Failure Counter]
    AR -->|No| AT[Increment Failure Counter]
    AT --> AU{Failure Threshold Reached? (--quit-on-abort)}
    AU -->|Yes| AV[Exit With Failure]
    AU -->|No| AW[Continue Next Iteration]

    AS --> AW
    AW --> AX{More Iterations?}
    AX -->|Yes| AE
    AX -->|No| AY[Exit (cleanup trap runs)]

    style A fill:#e1f5fe
    style E fill:#ffebee
    style N fill:#ffebee
    style AV fill:#ffebee
    style AY fill:#e8f5e9
```

## Key Decision Points

1. **Project Directory Check**: Determines if we're working with an existing codebase or creating a new one
2. **Spec Requirement**: New projects require a spec file, existing projects may not
3. **Iteration Mode**: Can run unlimited iterations or a specific number
4. **Onboarding Completion**: If `feature_list.json` appears to still be a template, onboarding is considered incomplete
5. **Prompt Selection**: Based on existing codebase and required file state:
    - **Onboarding**: Existing codebases (not newly created) when `.aidd` files are missing or onboarding is incomplete
    - **Initializer**: New/empty projects (or missing `.aidd` setup) where spec is copied (if provided)
    - **Coding**: When `.aidd/spec.txt` and `feature_list.json` exist and onboarding is complete
6. **Abort / Failure Policy**: `--quit-on-abort` can stop the run after N consecutive non-zero `tool` exits

## File Operations

- **Scaffolding Copy**: Only for new projects
- **Artifacts Copy**: Copies artifacts into `.aidd` without overwriting existing files
- **Spec Copy**: If `--spec` is provided, it may be copied into `.aidd/spec.txt` during initializer flow
- **Log Management**: Automatic cleanup on exit unless `--no-clean` is set

## Error Handling

- Missing required arguments exit immediately
- If `--spec` is provided but the file does not exist, the script exits
- `run_tool_prompt` can abort early on:
    - no assistant messages
    - provider errors
    - idle timeout (`--idle-timeout`)
- Cleanup trap ensures logs are cleaned even on interruption (unless `--no-clean`)
