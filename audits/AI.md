---
title: 'AI Provider Integration Audit'
last_updated: '2026-06-28'
version: '2.1'
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
- **OpenAI-compatible integrations**: When a project talks to providers through the **OpenAI-compatible API standard** (a single client differentiated only by `baseUrl` / `model` / `apiKey` config - e.g. aidd's `OpenAICompatibleAgentClient` serving zhipu/xai/ollama), Objectives **#1 (uniform interface)** and **#3 (config-only extensibility)** are satisfied **by the standard itself**. Focus the audit on input safety, tool-calling, secrets, and operational controls rather than re-litigating interface uniformity.
- **Hand-rolled multi-provider integrations**: When a project maintains separate per-provider code paths, run the full methodology - interface uniformity and feature parity are the primary risks.

> **Surface boundary (orchestration runtime vs. direct client)**: A project may have **both** a delegated coding backend and a direct LLM client - scope them separately. Spawning an external coding agent as a subprocess (e.g. aidd's `claude-code` / `native` backends, where the child harness owns the LLM call) is **out of scope** - that harness is audited elsewhere, not here. But the **same project's direct OpenAI-compatible path** (e.g. aidd's `OpenAICompatibleAgentClient` for direct-AI/`directAi` calls) **is in scope** and must be audited against Objectives #4 - #8. Do not mark the whole audit N/A as "orchestration runtime" when a direct client exists - N/A applies only to the delegated-subprocess surface, not the in-process client.

> The numeric thresholds below ("100%", "0 variations") are **targets for hand-rolled integrations**, not hard pass/fail gates. For small, self-hosted, single-team apps, treat shortfalls as graded guidance and apply the exception clauses noted per objective.

## Pre-Audit Setup

### Required Tools

- Access to AI provider API documentation (OpenAI, Anthropic, etc.)
- Application source code with provider service implementations
- Running application instance for integration testing

### Verification Commands

```bash
# Identify AI provider implementations (hand-rolled and OpenAI-compatible)
grep -rE "AIProvider|ai-provider|openai|anthropic|gemini|OpenAICompatible|providerDefaults|directAi" backend/src/ --include="*.ts" -l

# Check AI-related configuration (JSON config is the Spernakit convention; some apps use a DB)
grep -rE "ai|llm|model|provider|baseUrl|apiKey" config/ --include="*.json"

# List AI-related service files
find backend/src/services/ -name "*ai*" -o -name "*provider*" -o -name "*llm*" -o -name "*directAi*"

# If the grep above returns nothing, the project has no AI surface -> mark the audit N/A and stop.
```

## Audit Objectives with Measurable Criteria

Conduct a comprehensive audit of AI provider handling across the codebase to identify and resolve inconsistencies between multiple AI service integrations. The goal is to ensure:

### 1. **Uniform Provider Interface** (100% Compliance Required)

**Measurable Criteria**:

- ✅ **Function Signatures**: All providers implement identical method signatures (0 variations allowed)
- ✅ **Response Format**: All providers return standardized response objects with same fields
- ✅ **Error Types**: All providers throw same error classes with consistent properties
- ✅ **Type Definitions**: All providers use shared TypeScript interfaces (no provider-specific types)

**Good Pattern Example** (preferred - converge on the OpenAI-compatible standard):

```typescript
// ✅ BEST: One OpenAI-compatible client; providers differ ONLY by config.
// This is how aidd integrates zhipu/xai/ollama via OpenAICompatibleAgentClient.
// Objectives #1 (uniform interface) and #3 (config-only extensibility) come
// for free — a new provider is a config entry (baseUrl + model + apiKey), not code.
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

- ✅ **Configuration-Only Addition**: New providers added via config only (0 code changes)
- ✅ **Interface Compliance**: New providers implement standard interface (100% compliance)
- ✅ **Feature Detection**: System automatically detects provider capabilities (100% automatic)
- ✅ **Registration Pattern**: Providers self-register through standard mechanism (100% automatic)

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
- ✅ **Error Messages**: All providers use standardized user messages (100% compliance)
- ✅ **Retry Logic**: All providers implement identical retry patterns (100% compliance)
- ✅ **Fallback Behavior**: All providers handle failures identically (100% compliance)

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
- ✅ **Result Markers**: Tool/agent result markers are parsed defensively and cannot be spoofed by model output
- ✅ **Error Surfacing**: Tool failures return structured errors, not silent no-ops

_N/A clause: skip when the integration is completion-only with no tool/function calling._

### 8. **Operational Controls** (Timeouts, Abort, Cost)

**Measurable Criteria**:

- ✅ **Timeouts**: Every model call has a timeout and an abort path (e.g. `AbortController`); no unbounded waits
- ✅ **Cost/Token Budgets**: Requests respect a configurable token/cost ceiling where the app exposes user-driven generation
- ✅ **Model Currency**: Integrations default to current, capable models and do not pin deprecated/retired model IDs; model identifiers are externalized, not hardcoded literals

- Provider service implementations and interfaces
- Streaming implementations and patterns
- Provider-specific logic that could be generalized
- Configuration management and storage
- Error handling and user feedback patterns

## Step-by-Step Evaluation Process

### **Phase 1: Interface Analysis (2-4 hours)**

1. **Inventory All Providers**
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
    - [ ] Verify retry logic uniformity

2. **Failure Mode Testing**
    - [ ] Test network failures
    - [ ] Test API key issues
    - [ ] Test quota exceeded scenarios
    - [ ] Document fallback behavior consistency

## Evaluation Criteria with Scoring

### **Provider Consistency** (40 points total)

- [ ] **Interface Uniformity** (15 points): 100% identical signatures = 15pts, 90% = 12pts, 80% = 9pts
- [ ] **Response Format Consistency** (10 points): Standardized responses across all providers
- [ ] **Error Handling Uniformity** (10 points): Same error classes and messages
- [ ] **Type Definition Sharing** (5 points): No provider-specific types

### **Architecture Quality** (30 points total)

- [ ] **Extensibility Score** (15 points): New provider requires 0 code changes = 15pts
- [ ] **Configuration Externalization** (10 points): Provider config externalized (JSON config _or_ database) with 0 hardcoded secrets/model IDs = 10pts. _Do not require a database - JSON config is the Spernakit convention (see Objective #4)._
- [ ] **Abstraction Layer Completeness** (5 points): Clear separation of concerns

### **Feature Parity** (30 points total)

- [ ] **Streaming Consistency** (10 points): Identical streaming API across providers
- [ ] **Model Selection Uniformity** (10 points): Same interface for model discovery
- [ ] **Token Counting Accuracy** (5 points): <5% variance between providers
- [ ] **Usage Tracking Completeness** (5 points): Identical metrics collection

**Total Score: \_\_\_/100 points**

**Scoring Interpretation**:

- **90-100 points**: Excellent provider consistency
- **80-89 points**: Good with minor improvements needed
- **70-79 points**: Moderate inconsistencies requiring attention
- **Below 70 points**: Significant architectural improvements required

> **Scoring scope (read before scoring)**: The 100-point rubric above measures **provider-consistency and feature-parity** - the risks of **hand-rolled multi-provider** integrations. For **OpenAI-compatible integrations** (a single client differentiated only by config - aidd's pattern), Provider Consistency + Feature Parity (70 pts) are **satisfied by the standard itself** (see [Applicability](#applicability-conditional-audit)), so the numeric total is **not a meaningful discriminator** - a passing OpenAI-compatible app banks those points for free regardless of its actual safety posture. For such integrations, do **not** lead with the score; evaluate directly against **Objectives #4 - #8** (config externalization, error-handling alignment, input safety / prompt injection, tool-call validation, operational controls) and report findings there. These objectives carry no rubric points but are the substantive checks for config-driven clients.

## Audit Checklist

### Critical Checks

- [ ] All providers implement identical interface signatures
- [ ] Response formats are standardized across all providers
- [ ] Error handling uses same error classes and messages
- [ ] No provider-specific types in shared code

### High Priority Checks

- [ ] Untrusted input into prompts is delimited/treated as untrusted (or prompt-injection N/A is explicitly justified)
- [ ] Tool/function-call arguments are schema-validated before execution; execution is bounded
- [ ] Every model call has a timeout and abort path
- [ ] API keys are externalized (never hardcoded/logged)
- [ ] Streaming API consistent where supported (capability-detected, not mandated)
- [ ] Model selection uses unified interface
- [ ] Usage tracking metrics identical

### Medium Priority Checks

- [ ] Configuration is externalized (JSON config or database), not hardcoded
- [ ] New provider can be added via config only (trivially true for OpenAI-compatible clients)
- [ ] Provider capabilities auto-detected
- [ ] Defaults to current capable models; no deprecated/pinned model IDs
- [ ] Token/cost budgets enforced where generation is user-driven

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
- Hardcoded API keys or model IDs in source
- Untrusted user input concatenated directly into prompts/system instructions
- Tool-call arguments executed without schema validation or bounds
- Model calls with no timeout/abort path

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

**Overall Provider Score**: [Score]/100
**Interface Uniformity**: [Percentage]%
**Feature Parity**: [Percentage]%
**Critical Issues Found**: [Number]

### Provider Inventory

| Provider  | Implemented | Interface Compliance | Feature Parity |
| --------- | ----------- | -------------------- | -------------- |
| OpenAI    | [Yes/No]    | [Percentage]%        | [Percentage]%  |
| Anthropic | [Yes/No]    | [Percentage]%        | [Percentage]%  |
| Gemini    | [Yes/No]    | [Percentage]%        | [Percentage]%  |

### Key Findings

- [Summary of major findings]

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
