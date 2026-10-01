---
title: 'AI Provider Integration Audit'
last_updated: '2026-10-01'
version: '2.2'
category: 'Architecture'
priority: 'High'
estimated_time: '4-8 hours'
frequency: 'Quarterly'
lifecycle: 'specialized'
---

# AI Provider Integration Audit

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) - read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

## Table of Contents

1. [Applicability (Conditional Audit)](#applicability-conditional-audit)
2. [Pre-Audit Setup](#pre-audit-setup)
3. [Audit Objectives with Measurable Criteria](#audit-objectives-with-measurable-criteria)
4. [Audit Scope](#audit-scope)
5. [Step-by-Step Evaluation Process](#step-by-step-evaluation-process)
6. [Evaluation Criteria with Scoring](#evaluation-criteria-with-scoring)
7. [Audit Checklist](#audit-checklist)
8. [Common Issues to Identify](#common-issues-to-identify)
9. [Deliverables](#deliverables)
10. [Report Template](#report-template)

## Applicability (Conditional Audit)

This is a **specialized, conditional** audit. It applies **only to projects that directly integrate one or more LLM providers**. Before running, confirm the project has an AI surface; if it does not, mark the audit **N/A** and stop - do not generate "0 findings / 100-100" noise reports.

- **Base Spernakit template**: **N/A** - the template ships no AI provider integration. The same applies to every Spernakit app that does not call an LLM.
- **OpenAI-compatible integrations**: When a project talks to providers through the **OpenAI-compatible API standard** (one client class, providers selected by `baseUrl` / `model` / `apiKey` - e.g. aidd's `OpenAICompatibleAgentClient` serving zhipu/xai/openai/ollama/lmstudio), the shared wire protocol makes a uniform interface **likely, not proven**. Compatibility is a claim each provider makes about itself, and real endpoints differ on streaming, usage reporting, tool-call shape and reasoning controls. Do not award Objectives **#1**, **#2** or **#3** for naming the protocol: audit the **normalized contract the rest of the app consumes**, the **capability evidence per configured provider**, and every **adapter exception** in the client (see Objective #1). Then spend most of the effort on input safety, tool-calling, secrets, and operational controls.
- **Hand-rolled multi-provider integrations**: When a project maintains separate per-provider code paths, run the full methodology - interface uniformity and feature parity are the primary risks.

> **Surface boundary (in-process client vs. delegated harness)**: A project may have **both** an in-process LLM client and delegated coding CLIs - scope them separately, and decide by **where the provider request is made**, not by what the code calls the thing.
>
> - **In scope - any path where the project's own process builds the request and calls the provider.** In aidd that includes the **`native` backend**: `NativeBackend.runPrompt` (`shared/src/backends/native.ts`) calls `createDefaultNativeClient` and `runAgentLoop` in process, and `OpenAICompatibleAgentClient.complete` (`shared/src/agent/client/openai.ts`) performs the provider `fetch`. It also includes the direct-AI path (`shared/src/agent/directAi.ts` and its backend consumers). Audit these against every objective.
> - **Delegated harness internals - out of scope.** When an external coding CLI (aidd's `claude-code`, `codex`, `cline`, `grok` and similar backends) owns the model call, its prompt assembly, tool loop and provider traffic are that product's concern.
> - **The project's own boundary around a delegated harness - in scope.** How the CLI is launched (flags, including any permission or sandbox bypass, in `buildBackendCommand`), what prompt and files it is handed, which credentials reach it (`buildBackendSubprocessEnv`), how its output is parsed and trusted, and how it is timed out and cancelled are all the project's code. Audit them under Objectives #4 - #8.
>
> Do not mark the whole audit N/A as "orchestration runtime". N/A applies only to the internals of a delegated harness.

> The numeric thresholds below ("100%", "0 variations") are **targets for hand-rolled integrations**, not hard pass/fail gates. For small, self-hosted, single-team apps, treat shortfalls as graded guidance and apply the exception clauses noted per objective.

> **Evidence rule**: trace each control from its symbol in the live source and cite the `file:line` you read. Bound every conclusion to the providers, fixtures and code paths actually exercised, and name the ones that were not.

## Pre-Audit Setup

### Required Tools

- Access to AI provider API documentation (OpenAI, Anthropic, etc.)
- Application source code with provider service implementations
- Running application instance for integration testing

### Verification Commands

Derive the source roots from the repository; do not assume `backend/src`. A provider client often lives in a shared or CLI package (in aidd the client is under `shared/src/agent/`, and a `backend/src`-only search misses it).

```bash
# 1. List the source roots this repository actually has (workspaces, packages, apps)
grep -n '"workspaces"' -A8 package.json
ls -d */src packages/*/src apps/*/src 2>/dev/null

# 2. Identify AI provider implementations across ALL of those roots (file names only)
grep -rlE "AIProvider|ai-provider|openai|anthropic|gemini|OpenAICompatible|providerDefaults|directAi|chat/completions|AgentClient" \
  --include="*.ts" --include="*.tsx" --include="*.js" --exclude-dir=node_modules --exclude-dir=dist .

# 3. Find where provider requests are made and where delegated CLIs are launched
grep -rnE "fetch\(|/chat/completions|/v1/messages" --include="*.ts" --exclude-dir=node_modules --exclude-dir=dist . | grep -iE "provider|baseUrl|completions|messages"
grep -rnE "buildBackendCommand|runAgentLoop|createDefaultNativeClient" --include="*.ts" --exclude-dir=node_modules .

# 4. Locate AI-related configuration by FILE NAME and KEY NAME only - never print values
grep -rlE "\"(provider|providers|baseUrl|apiKey|model)\"" --include="*.json" --exclude-dir=node_modules .
```

**Do not print credential-valued configuration.** Config files that hold provider settings usually hold API keys beside them. List matching files (`-l`) and read key **names** through the code that loads them; never `cat` or grep the contents of a user config file (aidd's `~/.aidd/config.json`), a secret store, or an inherited environment into the report or transcript.

**Positive control before N/A.** An empty search proves nothing until the search is known to work. Before recording N/A, run the same commands against a known hit (in aidd, step 2 must list `shared/src/agent/client/openai.ts`; in another target, plant a throwaway file containing one of the patterns and confirm it is found, then remove it). Only when the control hits and the real search does not is the project without an AI surface - mark the audit N/A and stop.

## Audit Objectives with Measurable Criteria

Conduct a comprehensive audit of AI provider handling across the codebase to identify and resolve inconsistencies between multiple AI service integrations. The goal is to ensure:

### 1. **Uniform Provider Interface** (100% Compliance Required)

**Measurable Criteria**:

- ✅ **Function Signatures**: All providers implement identical method signatures (0 variations allowed)
- ✅ **Response Format**: All providers return standardized response objects with same fields
- ✅ **Error Types**: All providers throw same error classes with consistent properties
- ✅ **Type Definitions**: All providers use shared TypeScript interfaces (no provider-specific types)

**OpenAI-compatible clients: what to audit instead of signatures.** One client class gives one signature by construction, so the signature count says nothing. Audit these three things:

- **The normalized consumer contract.** Identify the single type the rest of the app reads (in aidd, `AgentClient.complete` returning `AgentLoopResponse`: text, tool calls, token usage, plus `StreamDelta` for live output). Verify no consumer reaches past it into a provider-shaped payload.
- **Capability evidence per configured provider.** For each provider the project ships a default for, find a test or recorded fixture showing that streaming, usage reporting, tool calls and error bodies normalize into that contract. A provider with no such evidence is **unverified**, not compliant.
- **Adapter exceptions.** Enumerate every provider-conditional branch in the client and judge each: is it documented, tested, and confined to the adapter? aidd has live examples in `buildChatCompletionBody` and `shouldStream` (`shared/src/agent/client/request.ts`): Ollama gets a `think` field, LM Studio has `reasoning_effort` omitted, and local servers default to non-streaming. Exceptions like these are normal and are the audit surface; an exception that leaks into callers is the finding.

**Good Pattern Example** (preferred - converge on the OpenAI-compatible standard):

```typescript
// ✅ GOOD: One OpenAI-compatible client; providers are selected by config.
// This is how aidd integrates zhipu/xai/ollama via OpenAICompatibleAgentClient.
// It makes a uniform interface cheap, not automatic: provider differences still
// exist and belong in one adapter, behind one normalized response type.
interface ProviderConfig {
	baseUrl: string;
	model: string;
	apiKey?: string;
}

const providers: Record<string, ProviderConfig> = {
	zhipu: { baseUrl: 'https://...', model: 'glm-...' },
	xai: { baseUrl: 'https://...', model: 'grok-...' },
	ollama: { baseUrl: 'http://localhost:11434/v1', model: 'llama3' },
};

const client = new OpenAICompatibleAgentClient(providers[selectedProvider]);
// Same call shape regardless of provider.
const response = await client.complete({ prompt, model });
```

```typescript
// ✅ ACCEPTABLE (hand-rolled): a single shared interface across factories.
// Only needed when a provider is NOT OpenAI-compatible. Keep signatures identical.
interface AIProvider {
	generateText(prompt: string, options: GenerationOptions): Promise<AIResponse>;
	streamText?(prompt: string, options: GenerationOptions): AsyncIterable<AIStreamChunk>; // optional: capability-detected
}
```

**Bad Pattern Example**:

```typescript
// ❌ BAD: Provider-specific interfaces with inconsistent signatures and divergent shapes.
function openaiChat(messages: OpenAIMessage[]): Promise<OpenAIResponse> {
	/* ... */
}
function anthropicComplete(prompt: string): Promise<AnthropicResult> {
	/* ... */
}
```

### 2. **Consistent Feature Support** (95%+ Feature Parity)

**Measurable Criteria**:

- ✅ **Streaming**: Streaming is **capability-detected**, not mandated. Providers/surfaces that support streaming expose it through an **identical API**; non-streaming surfaces (e.g. JSON completions) are valid and must not be flagged. _Exception: do not penalize a surface for being intentionally non-streaming._
- ✅ **Model Selection**: All providers expose models through same interface (100% parity)
- ✅ **Token Counting**: Prefer provider-reported `usage` from responses over client-side token counting. Where client-side counting exists, keep variance <5%. _Client-side `countTokens` is optional - modern providers return usage in the response._
- ✅ **Usage Tracking**: All providers track usage with identical metrics (100% parity)

**Good Pattern Example**:

```typescript
// ✅ GOOD: Consistent streaming across providers
for await (const chunk of provider.streamText(prompt, options)) {
	// Same chunk format regardless of provider
	console.log(chunk.text, chunk.finishReason, chunk.usage);
}
```

**Bad Pattern Example**:

```typescript
// ❌ BAD: Provider-specific streaming
if (provider === 'openai') {
	for await (const chunk of openaiStream) {
		console.log(chunk.choices[0].delta.content); // OpenAI-specific format
	}
} else if (provider === 'anthropic') {
	for await (const chunk of anthropicStream) {
		console.log(chunk.completion); // Anthropic-specific format
	}
}
```

### 3. **Extensible Architecture** (Zero Code Changes for New Providers)

**Measurable Criteria**:

- ✅ **Configuration-Only Addition**: New providers added via config only (0 code changes). **Measure it, do not infer it from the protocol.** Distinguish pointing an existing provider entry at a new endpoint or model (often config-only) from adding a new named provider (often code: in aidd a provider is a key of `providerDefaults` and must also be declared in `providerCredentials`, so it is a code change by design). Record which of the two the project supports and whether the docs claim more
- ✅ **Interface Compliance**: New providers implement standard interface (100% compliance)
- ✅ **Feature Detection**: Provider capabilities are detected or declared in one place, and that declaration is tested. A capability switched by a hardcoded provider-name check is a declared exception to list under Objective #1, not auto-detection
- ✅ **Registration Pattern**: Providers register through one standard mechanism (a table, a registry), not scattered conditionals

### 4. **Externalized Configuration** (0% Hardcoded Values/Secrets)

> **Stack note**: The Spernakit convention is **JSON-only configuration (no `.env` files)**; aidd stores provider config in JSON (`config.providers.*`). Do **not** flag JSON-config storage as a defect or mandate a database - the requirement is that values are **externalized and not hardcoded**, regardless of whether the store is a JSON config file or a database.

**Measurable Criteria**:

- ✅ **Provider Settings**: Provider config is externalized (JSON config _or_ database), not hardcoded in source
- ✅ **Secrets**: 0% of API keys hardcoded in source; keys live in config/secret store and are never logged
- ✅ **Model Availability**: Model lists/defaults are externalized, not hardcoded literals scattered through code
- ✅ **Rate Limits**: Limits are externalized where the app enforces them

### 5. **Error Handling Alignment** (100% Consistency)

**Measurable Criteria**:

- ✅ **Error Classes**: All providers use same error hierarchy (100% compliance)
- ✅ **Error Messages**: All providers use standardized user messages (100% compliance); provider error bodies are bounded and secret-scrubbed before they are logged or shown
- ✅ **Retry Logic**: Retries are **classified and bounded**, not merely identical. Only errors classified transient (timeout, connection reset, 429, 5xx) are retried; client errors, content-policy refusals and auth failures are not. There is a maximum attempt count and a backoff, and a provider-stated reset time is respected up to the run's remaining deadline
- ✅ **Cancellation**: A retry or fallback never outlives the caller. An aborted or timed-out request is not retried, and a pending backoff sleep ends when the run is cancelled
- ✅ **Fallback Scope**: Falling back to another provider, model or path stays inside what the operator approved: the same data-handling scope (a prompt bound for a local model must not silently go to a remote one), the configured provider set, and the remaining budget. A fallback that widens any of these without operator configuration is a finding
- ✅ **Fallback Visibility**: A fallback is recorded with both causes, so the original failure is not lost

_The objective is correct, bounded recovery. Providers may legitimately differ (a local server needs no rate-limit handling); identical retry code across all providers is not the goal._

### 6. **Input Safety / Prompt Injection** (Required where user input reaches a prompt)

**Measurable Criteria**:

- ✅ **Untrusted Input Boundaries**: User/third-party content placed into prompts is treated as untrusted and clearly delimited from instructions
- ✅ **Output Handling**: Model output that is rendered, executed, or used to drive actions is validated/escaped (no blind `eval`, no unescaped HTML, no unbounded tool execution)
- ✅ **System-Prompt Integrity**: System/developer instructions are not constructable from user input
- ✅ **Documented Decision**: If the project judges prompt-injection defenses unnecessary (e.g. trusted single-operator runtime), that judgment is **explicit and justified** against this checklist - not implied by omission

_N/A clause: skip only when no user-controlled or third-party content ever enters a prompt._

### 7. **Tool / Function-Calling Validation** (Required where tools/functions are exposed)

**Measurable Criteria**:

- ✅ **Argument Validation**: Tool-call arguments from the model are schema-validated before execution (no trusting raw model JSON)
- ✅ **Bounded Execution**: Tool side effects are bounded (allow-list of tools, no arbitrary command/file/network access beyond intent)
- ✅ **Result Markers**: A completion marker in model text (aidd's `AIDD_RESULT:` line, parsed in `shared/src/agent/result-marker.ts`) is a **claim, not proof**. The model writes it, and anything the model read (a file, a tool result, a web page) can make it write one, so text alone cannot authenticate completion. Verify three things: (1) **parsing is defensive** - only a marker in the expected position counts, malformed and truncated payloads are rejected; (2) **transport provenance** - the marker is taken only from the assistant channel of the host's own event stream, never from tool output, file content or echoed prompt text, and host-supplied metadata (exit code, stop reason, event type) is kept apart from transcript text; (3) **independent evidence** - before work is recorded as done, the host checks state it observes itself (commits, feature records, gate results, exit status). A path where the marker alone flips a feature or run to complete is a finding
- ✅ **Error Surfacing**: Tool failures return structured errors, not silent no-ops

_N/A clause: skip when the integration is completion-only with no tool/function calling._

### 8. **Operational Controls** (Timeouts, Abort, Cost)

**Measurable Criteria**:

- ✅ **Timeouts**: Every model call has a timeout and an abort path (e.g. `AbortController`); no unbounded waits. This includes a stalled stream (an idle timeout between bytes) and a runaway one (a size cap)
- ✅ **Cost/Token Budgets**: Budget behaviour matches the project's **declared policy**. First find the policy (docs, config schema, code comments): is a budget overrun meant to **warn** or to **stop**? Then verify the code does exactly that, and that the result is visible to the operator. Do not require hard enforcement where the product declares warning-only: aidd's token/cost budget is warn-only by design (`warnIfBudgetExceeded`, called from `cli/src/orchestrator/orchestrator.ts`, logs once and never alters control flow), while its wall-clock limit does end the run. Findings are a mismatch (docs or UI promise a stop the code does not perform, or the reverse), a warning nobody can see, or user-driven generation with no ceiling and no declared policy at all
- ✅ **Model Currency**: Defaults do not point at **retired or deprecated** model IDs, and the default can be changed through configuration without a code change. Distinguish that from **intentional pinning**: naming an exact model ID or version on purpose (reproducibility, benchmarks, a tested default) is not a defect. A pin is a finding only when the pinned model is retired or scheduled for retirement, or when it cannot be overridden through config

## Audit Scope

- Provider client implementations and the normalized interface their consumers read
- In-process agent loops and direct completion calls, in whichever package holds them
- The launch, prompt, credential and output-parsing boundary around any delegated coding CLI
- Streaming implementations and patterns
- Provider-specific logic (adapter exceptions) and whether it is confined to the adapter
- Configuration management and storage, including secrets
- Error handling, retry, fallback, cancellation and user feedback patterns

Out of scope: the internals of a delegated third-party harness (see the surface boundary under [Applicability](#applicability-conditional-audit)).

## Step-by-Step Evaluation Process

### **Phase 1: Interface Analysis (2-4 hours)**

1. **Inventory All Providers**
    - [ ] List every surface where the project's own process calls a provider, and every delegated CLI it launches, across all source roots
    - [ ] List all AI provider implementations
    - [ ] Document current interfaces and method signatures
    - [ ] Identify shared vs provider-specific methods

2. **Interface Comparison Matrix**
    - [ ] Create comparison table of all provider methods
    - [ ] Document parameter differences
    - [ ] Identify return type variations
    - [ ] Calculate interface consistency score (target: 100%)

3. **Type Definition Audit**
    - [ ] List all provider-specific types
    - [ ] Identify opportunities for shared interfaces
    - [ ] Document type compatibility issues

### **Phase 2: Feature Parity Assessment (3-6 hours)**

1. **Feature Matrix Creation**

    ```
    | Feature | OpenAI | Anthropic | Gemini | Consistency Score |
    |---------|--------|-----------|--------|-------------------|
    | Text Generation | ✅ | ✅ | ✅ | 100% |
    | Streaming | ✅ | ✅ | ❌ | 67% |
    | Token Counting | ✅ | ❌ | ✅ | 67% |
    | Usage Tracking | ✅ | ✅ | ✅ | 100% |
    ```

2. **Streaming Implementation Analysis**
    - [ ] Test streaming across all providers
    - [ ] Document chunk format differences
    - [ ] Measure streaming performance consistency
    - [ ] Verify error handling in streams

3. **Model Selection Audit**
    - [ ] Document how each provider exposes available models
    - [ ] Check for consistent model metadata format
    - [ ] Verify model capability detection

### **Phase 3: Architecture Evaluation (4-8 hours)**

1. **Extensibility Test**
    - [ ] Attempt to add a mock provider
    - [ ] Document required code changes
    - [ ] Measure configuration vs code ratio (target: 90% config)

2. **Configuration Analysis**
    - [ ] Audit hardcoded provider settings
    - [ ] Document database vs file-based config
    - [ ] Calculate configuration centralization score (target: 100%)

3. **Dependency Analysis**
    - [ ] Map provider-specific dependencies
    - [ ] Identify shared utility functions
    - [ ] Document abstraction layer completeness

### **Phase 4: Error Handling Assessment (2-4 hours)**

1. **Error Pattern Analysis**
    - [ ] Test rate limit handling across providers
    - [ ] Document error message consistency
    - [ ] Verify which errors are classified retryable, the attempt bound and the backoff

2. **Failure Mode Testing**
    - [ ] Test network failures
    - [ ] Test API key issues (with a synthetic invalid key, never a real one)
    - [ ] Test quota exceeded scenarios
    - [ ] Cancel mid-request and mid-backoff; confirm no retry or fallback follows
    - [ ] Document each fallback path and confirm it stays within the operator-approved provider, data and budget scope

## Evaluation Criteria with Scoring

### **Provider Consistency** (40 points total)

- [ ] **Interface Uniformity** (15 points): 100% identical signatures = 15pts, 90% = 12pts, 80% = 9pts. For a single OpenAI-compatible client, score on the normalized consumer contract and the adapter exceptions found, not on the signature count
- [ ] **Response Format Consistency** (10 points): Standardized responses across all providers
- [ ] **Error Handling Uniformity** (10 points): Same error classes and messages
- [ ] **Type Definition Sharing** (5 points): No provider-specific types

### **Architecture Quality** (30 points total)

- [ ] **Extensibility Score** (15 points): New provider requires 0 code changes = 15pts, shown by the Phase 3 extensibility test, not assumed from the protocol. A deliberate, compile-checked provider table that needs a small code change is scored on what the project documents, and is not a defect by itself
- [ ] **Configuration Externalization** (10 points): Provider config externalized (JSON config _or_ database) with 0 hardcoded secrets and model defaults overridable through config = 10pts. _Do not require a database - JSON config is the Spernakit convention (see Objective #4)._
- [ ] **Abstraction Layer Completeness** (5 points): Clear separation of concerns

### **Feature Parity** (30 points total)

- [ ] **Streaming Consistency** (10 points): Identical streaming API across providers
- [ ] **Model Selection Uniformity** (10 points): Same interface for model discovery
- [ ] **Token Counting Accuracy** (5 points): <5% variance between providers
- [ ] **Usage Tracking Completeness** (5 points): Identical metrics collection

**Total Score: \_\_\_/100 points**

**Scoring Interpretation** (these bands apply only when every item was assessed; a partial "N of M assessed points" total has no band):

- **90-100 points**: Excellent provider consistency
- **80-89 points**: Good with minor improvements needed
- **70-79 points**: Moderate inconsistencies requiring attention
- **Below 70 points**: Significant architectural improvements required

> **Scoring scope (read before scoring)**: The 100-point rubric above measures **provider-consistency and feature-parity** - the risks of **hand-rolled multi-provider** integrations. For **OpenAI-compatible integrations** (one client class, providers selected by config - aidd's pattern) those 70 points are **not earned by naming the protocol**. Award a Provider Consistency or Feature Parity item only on evidence: the normalized consumer contract traced, a capability test or fixture per configured provider, and each adapter exception listed and judged (Objective #1). An item with no such evidence is scored **not assessed**, not full marks, and the total is reported as "N of M assessed points". Even then the total is **not a meaningful discriminator** for these integrations: it says nothing about safety posture. Do **not** lead with the score in any report; lead with findings, and evaluate directly against **Objectives #4 - #8** (config externalization, error-handling alignment, input safety / prompt injection, tool-call validation, operational controls). These objectives carry no rubric points but are the substantive checks.

## Audit Checklist

### Critical Checks

- [ ] All providers implement identical interface signatures; for a single OpenAI-compatible client, consumers read one normalized response type and nothing provider-shaped
- [ ] Response formats are standardized across all providers
- [ ] Error handling uses same error classes and messages
- [ ] No provider-specific types in shared code; adapter exceptions are enumerated and confined to the adapter
- [ ] Completion is never accepted on model text alone: result markers have transport provenance and independent host-observed evidence

### High Priority Checks

- [ ] Every in-process provider path is in scope and located (source roots derived from the repository, positive control run before any N/A)
- [ ] Untrusted input into prompts is delimited/treated as untrusted (or prompt-injection N/A is explicitly justified)
- [ ] Tool/function-call arguments are schema-validated before execution; execution is bounded
- [ ] Every model call has a timeout and abort path
- [ ] Retries are classified, bounded and cancellable; fallback stays within the operator-approved provider, data and budget scope
- [ ] API keys are externalized (never hardcoded/logged), and the audit itself printed no credential-valued config
- [ ] The launch, credential and output-trust boundary around each delegated CLI is audited
- [ ] Streaming API consistent where supported (capability-detected, not mandated)
- [ ] Model selection uses unified interface
- [ ] Usage tracking metrics identical

### Medium Priority Checks

- [ ] Configuration is externalized (JSON config or database), not hardcoded
- [ ] The config-only extensibility claim is measured: new endpoint or model vs new named provider, against what the docs promise
- [ ] Provider capabilities are detected or declared in one tested place, with per-provider capability evidence
- [ ] No retired or deprecated default model IDs; intentional pins are overridable through config and not flagged for being pins
- [ ] Token/cost budget behaviour matches the declared policy (warn or stop) and is visible to the operator

### Low Priority Checks

- [ ] Provider documentation complete
- [ ] Test coverage for all provider implementations
- [ ] Performance benchmarks documented

## Common Issues to Identify

- Hardcoded provider-specific logic
- Inconsistent error messages and handling
- Duplicate functionality across providers
- Missing abstraction layers
- Configuration scattered across files
- Provider-specific response formats
- Hardcoded API keys, or model IDs that cannot be overridden through config
- Untrusted user input concatenated directly into prompts/system instructions
- Tool-call arguments executed without schema validation or bounds
- Model calls with no timeout/abort path
- Work recorded as complete on a model-written marker alone
- Retries that ignore cancellation, retry non-transient errors, or have no bound
- A fallback that moves a prompt to a provider or model the operator did not approve
- An in-process client missed because the search covered one source root
- Parity or extensibility assumed from "OpenAI-compatible" with no per-provider evidence

## Deliverables

- Detailed analysis of current provider implementations
- Documentation of inconsistencies found
- Specific recommendations for achieving provider parity
- Prioritized action plan for improvements
- Architecture recommendations for extensibility

## Report Template

```markdown
# AI Provider Integration Audit Report - YYYY-MM-DD

## Executive Summary

**Critical Issues Found**: [Number]
**High Priority Issues Found**: [Number]
**Integration Shape**: [OpenAI-compatible single client / hand-rolled multi-provider / delegated CLI only]
**Surfaces Audited**: [in-process clients and delegated-CLI boundaries, with paths]
**Not Exercised**: [providers, surfaces or fixtures the conclusions do not cover]

### Key Findings

- [Summary of major findings, most severe first]

### Provider Score (supporting detail, not the headline)

**Assessed Points**: [Score] of [Assessed maximum] ([items not assessed, and why])
**Interface Uniformity**: [Percentage]% - [evidence basis]
**Feature Parity**: [Percentage]% - [evidence basis]

### Provider Inventory

| Provider  | Implemented | Interface Compliance | Feature Parity |
| --------- | ----------- | -------------------- | -------------- |
| OpenAI    | [Yes/No]    | [Percentage]%        | [Percentage]%  |
| Anthropic | [Yes/No]    | [Percentage]%        | [Percentage]%  |
| Gemini    | [Yes/No]    | [Percentage]%        | [Percentage]%  |

## Detailed Findings

### Critical Issues 🚨

| Issue | Provider | Description   | Impact   | Remediation | Timeline |
| ----- | -------- | ------------- | -------- | ----------- | -------- |
| [ID]  | [Name]   | [Description] | [Impact] | [Fix]       | [Days]   |

### High Priority Issues ⚠️

| Issue | Provider | Description   | Impact   | Remediation | Timeline |
| ----- | -------- | ------------- | -------- | ----------- | -------- |
| [ID]  | [Name]   | [Description] | [Impact] | [Fix]       | [Days]   |

### Medium Priority Issues 📋

| Issue | Provider | Description   | Impact   | Remediation | Timeline |
| ----- | -------- | ------------- | -------- | ----------- | -------- |
| [ID]  | [Name]   | [Description] | [Impact] | [Fix]       | [Days]   |

## Feature Parity Matrix

| Feature         | OpenAI   | Anthropic | Gemini   | Consistency   |
| --------------- | -------- | --------- | -------- | ------------- |
| Text Generation | [Status] | [Status]  | [Status] | [Percentage]% |
| Streaming       | [Status] | [Status]  | [Status] | [Percentage]% |
| Token Counting  | [Status] | [Status]  | [Status] | [Percentage]% |
| Usage Tracking  | [Status] | [Status]  | [Status] | [Percentage]% |

## Recommendations

### Immediate Actions (0-7 days)

1. [Critical fixes]

### Short-term Actions (1-4 weeks)

1. [Important improvements]

### Long-term Actions (1-3 months)

1. [Strategic enhancements]

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 3 months]
```
