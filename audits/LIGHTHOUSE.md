---
title: 'Lighthouse Report Processing with Business Context'
last_updated: '2026-06-28'
version: '2.2'
category: 'Performance'
priority: 'Medium'
estimated_time: '1-2 hours'
frequency: 'Monthly'
lifecycle: 'post-release'
---

# Lighthouse Report Processing with Business Context

## Executive Summary

This audit converts real Lighthouse JSON and Spernakit crawltest Web Vitals artifacts into
business-context performance guidance. It must not score, pass, or recommend remediation without
parsing at least one real measurement artifact. If artifacts cannot be acquired, the only valid
result is **SKIPPED / data-unavailable** with a concise record of what was attempted.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Core Objective with Business Impact](#core-objective-with-business-impact)
3. [Input Requirements](#input-requirements)
4. [Pre-Audit Setup](#pre-audit-setup)
5. [Processing Workflow](#processing-workflow)
6. [Example of AI Output](#example-of-ai-output)
7. [Audit Checklist](#audit-checklist)
8. [Report Template](#report-template)
9. [Deliverables](#deliverables)

## Core Objective with Business Impact

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.
>
> **Scope Boundary**: This audit is specifically for **processing Lighthouse JSON report output** into business-context narratives. General performance patterns, Core Web Vitals thresholds, and optimization decision trees live in [PERFORMANCE.md](./PERFORMANCE.md). Do not duplicate optimization guidance here.

Your primary goal is to transform raw Lighthouse JSON data (Lighthouse v11+) into a clear, concise, and actionable performance analysis that directly connects technical metrics to business outcomes. Record the actual `lighthouseVersion` from each artifact instead of assuming a current major line. You will compare desktop and mobile reports for the same URL to highlight platform-specific issues and guide optimization efforts with clear ROI justification.

**Business Context**: For a self-hosted multi-user application (spernakit-based), performance directly impacts:

- **User satisfaction and retention**: Slow pages erode trust in the tool
- **Conversion/activation**: First-run experience determines whether a user continues
- **Cost of hosting**: Heavy bundles and unoptimized assets increase bandwidth and CPU costs on self-hosted infrastructure
- **Perceived quality**: Internal tools with poor performance get replaced

**Stakeholder Value**:

- **Product owner**: Priorities for technical debt and optimization work
- **Engineering**: Clear, measurable targets tied to user experience
- **Operations / self-hosters**: Predictable resource consumption

> **Note on public-web metrics**: Industry statistics (e.g., "100ms delay costs 1% of sales") apply to consumer e-commerce and may not translate to self-hosted internal tools. Use them only when the application is actually deployed publicly with conversion funnels.

## Input Requirements

To begin, you must receive Lighthouse JSON for the URL under review. Acceptable sources:

1. **Lighthouse CLI** (`bunx lighthouse <url> --output=json --output-path=report.json`), v11+.
2. **Chrome DevTools "Lighthouse" panel**: Save as JSON.
3. **PageSpeed Insights API**: `lighthouseResult` envelope.

Each URL should be captured twice:

1. **Mobile Report:** `configSettings.formFactor === 'mobile'` (simulated throttling).
2. **Desktop Report:** `configSettings.formFactor === 'desktop'`.

The user should provide this data, clearly identifying which is which. You should also have the context of the URL that was tested (`finalUrl` in the JSON).

### Spernakit-Specific Input: crawltest Web Vitals

Spernakit applications also emit **field-mode-style** Web Vitals via `bun run crawltest` (see `scripts/crawltest.ts` and `scripts/crawltest-analyze.ts`). The crawler uses the `web-vitals` library (v5) in-page and writes results to `logs/crawltest.json`.

- **Use crawltest data** to identify pages that regress across multiple routes or build runs.
- **Use Lighthouse data** for a deep, single-page diagnostic with opportunity/diagnostic breakdowns.
- **Known measurement artifact**: Prior to 2026-04-05, crawler interactions could inflate LCP/FCP ratings because `reportAllChanges: true` was applied to all metrics. The current configuration uses `reportAllChanges: true` **only** for CLS and INP (cumulative metrics) and default behavior for LCP/FCP. When comparing trends across reports, note the measurement-configuration date.

## Pre-Audit Setup

This audit processes Lighthouse JSON. When no JSON is handed over (the common case in automated/non-interactive execution), you must acquire artifacts yourself before Step 1. Follow this acquisition path in order, and obey the data-availability rule below.

### Artifact Acquisition

1. **Detect a running instance vs. start a preview server.** Check whether the application is already serving (e.g., the project's configured preview/dev port is reachable). If it is, target that URL. If not, build and start a detached preview server (`bun run build` then serve the built output), capturing the local URL and port. Always shut down any server you started once artifacts are captured.
2. **Run Lighthouse for both form factors** against the local URL:

    ```bash
    bunx lighthouse <url> --output=json --output-path=lighthouse-mobile.json --form-factor=mobile --screenEmulation.mobile
    bunx lighthouse <url> --output=json --output-path=lighthouse-desktop.json --preset=desktop
    ```

    Requires a Chrome/Chromium binary available to Lighthouse.

3. **Crawltest fallback.** If the Lighthouse CLI or Chrome is unavailable, fall back to field-mode crawler output: run `bun run crawltest` (or `bun run crawltest:preview` against a built preview) and read the emitted `logs/crawltest.json`. This provides web-vitals field data even when Lighthouse lab capture is not possible.

### Data-Availability Rule (SKIPPED vs. PASS)

- When **at least one** real artifact (Lighthouse JSON or `logs/crawltest.json`) was parsed, proceed with the workflow and report only the scores supported by that data.
- When only `logs/crawltest.json` is available, produce a crawltest-only Web Vitals report. Leave Lighthouse category scores unavailable; do not infer Performance, Accessibility, Best Practices, or SEO scores from crawler data.
- When **neither** a Lighthouse JSON nor a crawltest JSON artifact can be produced, the report **MUST** be marked **SKIPPED / data-unavailable** and **MUST NOT** report a passing score, score-like `N/A`, issue counts, recommendations, or implied PASS. State explicitly that no measurement artifact was available and what was attempted.

## Processing Workflow

Follow these steps to analyze the provided JSON reports.

### Step 1: Ingestion and Validation

1. **Parse JSON:** Ingest the two JSON strings and parse them into structured objects.
2. **Initial Validation:** For each report, verify the presence of essential top-level keys: `categories`, `audits`, `finalUrl`, `fetchTime`, `lighthouseVersion`, `configSettings`.
3. **Version Check:** Record `lighthouseVersion`. Reports from Lighthouse <11 lack INP support; flag such reports and recommend rerunning with a current version.
4. **Identify Key Information:** From each report, extract and store:
    - **URL Tested:** `finalUrl`
    - **Timestamp:** `fetchTime`
    - **Device Type:** `configSettings.formFactor` (`mobile` or `desktop`)
    - **Throttling Profile:** `configSettings.throttling` (detect custom profiles vs defaults)

### Step 2: Extract Category Scores with Business Impact

For both the mobile and desktop reports, extract the overall scores for the main Lighthouse categories. The score is a value from 0 to 1 and should be presented as a score out of 100.

- **Performance:** `categories.performance.score`
- **Accessibility:** `categories.accessibility.score`
- **Best Practices:** `categories['best-practices'].score`
- **SEO:** `categories.seo.score`

Create a comparison table for these scores with business impact interpretation.

**Business Context for Each Category**:

| Category           | Business Impact                                     | Stakeholder Concern                                                  |
| ------------------ | --------------------------------------------------- | -------------------------------------------------------------------- |
| **Performance**    | User retention, perceived quality, hosting cost     | **Product**: User abandonment; **Ops**: Bandwidth/CPU consumption    |
| **Accessibility**  | Legal compliance, market reach, brand reputation    | **Legal**: ADA/WCAG compliance; **Product**: Inclusive design        |
| **Best Practices** | Security, maintainability, technical debt           | **Engineering**: Technical risk; **Security**: Vulnerability surface |
| **SEO**            | Discoverability (only for publicly indexed deploys) | **Growth**: Traffic acquisition (if applicable)                      |

**Score Interpretation**:

- **90-100**: Excellent
- **80-89**: Good; minor optimizations available
- **70-79**: Needs improvement; user-visible impact likely
- **Below 70**: Poor; immediate action recommended

### Step 3: Extract Key Performance Metrics with Business Impact

Dive deeper into the performance category. Extract the primary metrics that constitute the Performance score. These are found within the `audits` object.

| Metric Name                     | JSON Path                                          | Unit | Business Impact                                                                      |
| ------------------------------- | -------------------------------------------------- | ---- | ------------------------------------------------------------------------------------ |
| First Contentful Paint (FCP)    | `audits['first-contentful-paint'].numericValue`    | ms   | User perception of loading speed                                                     |
| Largest Contentful Paint (LCP)  | `audits['largest-contentful-paint'].numericValue`  | ms   | **Core Web Vital**: perceived loading                                                |
| Speed Index (SI)                | `audits['speed-index'].numericValue`               | ms   | Visual loading experience                                                            |
| Total Blocking Time (TBT)       | `audits['total-blocking-time'].numericValue`       | ms   | Lab proxy for INP / interaction responsiveness                                       |
| Interaction to Next Paint (INP) | `audits['interaction-to-next-paint'].numericValue` | ms   | **Core Web Vital**: interaction responsiveness (field; may be absent in lab reports) |
| Cumulative Layout Shift (CLS)   | `audits['cumulative-layout-shift'].numericValue`   | -    | **Core Web Vital**: visual stability                                                 |

> **Note**: INP replaced FID as a Core Web Vital in **March 2024**. Do not extract, reference, or report on FID. Lighthouse lab reports do not directly measure INP (no real user interactions); use **TBT** as the lab proxy and pull real INP from CrUX/PSI origin data or crawltest field measurements.

Create a detailed comparison table for these key metrics, showing the values for mobile and desktop side-by-side with pass/fail classification against current thresholds.

**Core Web Vitals: Current Thresholds** (source of truth: [PERFORMANCE.md](./PERFORMANCE.md)):

| Metric  | Good    | Needs Improvement | Poor    |
| ------- | ------- | ----------------- | ------- |
| **LCP** | ≤ 2.5s  | ≤ 4.0s            | > 4.0s  |
| **INP** | ≤ 200ms | ≤ 500ms           | > 500ms |
| **CLS** | ≤ 0.1   | ≤ 0.25            | > 0.25  |

**Stakeholder Translation**:

- **LCP > 4.0s**: "Users wait 4+ seconds to see main content; high abandonment risk"
- **TBT > 300ms / INP > 500ms**: "Page feels unresponsive to user interactions"
- **CLS > 0.25**: "Content jumps around while loading; frustrating user experience"

### Step 4: Identify and Prioritize Opportunities

The "Opportunities" section in Lighthouse suggests improvements with the highest potential impact.

1. **Filter for Opportunities:** Iterate through the `audits` object. Identify audits where `details.type === 'opportunity'`.
2. **Extract Savings:** For each opportunity, extract `details.overallSavingsMs` (for time) or `details.overallSavingsBytes` (for data).
3. **Apply Prioritization Framework:** Use the matrix below.
4. **Summarize Top 3:** List the top 3 opportunities for each platform with justification.

**Prioritization Framework**:

| Priority     | Criteria                                        | Typical Cadence     |
| ------------ | ----------------------------------------------- | ------------------- |
| **CRITICAL** | > 1s savings OR causes a Core Web Vital to fail | Immediate (1-2 wks) |
| **HIGH**     | 500ms-1s savings OR accessibility failure       | Next sprint         |
| **MEDIUM**   | 200-500ms savings OR best-practices failure     | Next quarter        |
| **LOW**      | < 200ms savings OR minor hygiene                | Backlog             |

**Impact Scoring Matrix**:

| Factor                     | Weight | Scoring                                                 |
| -------------------------- | ------ | ------------------------------------------------------- |
| **Time Savings**           | 40%    | >1s=10, 500ms-1s=7, 200-500ms=4, <200ms=1               |
| **Core Web Vitals Impact** | 30%    | Fixes failing CWV=10, improves CWV=7, no CWV impact=1   |
| **User Experience**        | 20%    | Critical UX=10, moderate=5, minor=1                     |
| **Implementation Effort**  | 10%    | Easy (1-2 days)=10, medium (1 week)=5, hard (>1 week)=1 |

**Total Score**: `(Time × 0.4) + (CWV × 0.3) + (UX × 0.2) + (Effort × 0.1)`

**Stakeholder Communication Template**:

```
Issue:               [Technical description]
User-Visible Impact: [What users actually experience]
Estimated Savings:   [From Lighthouse: overallSavingsMs / overallSavingsBytes]
CWV Linkage:         [Which CWV this affects, if any]
Implementation:      [Effort estimate]
Priority:            [Critical / High / Medium / Low with justification]
```

### Step 5: Analyze Diagnostics

Diagnostics provide additional information about how the page adheres to web development best practices.

1. **Filter for Diagnostics:** Identify relevant diagnostic audits.
2. **Extract Key Findings:**
    - `audits['mainthread-work-breakdown'].details.items` (time spent on script evaluation, parsing, etc.)
    - `audits['network-requests'].details.items` (large or slow requests)
    - `audits['critical-request-chains'].details` (render-blocking request chains)
    - `audits['third-party-summary'].details.items` (third-party script cost)
    - `audits['uses-long-cache-ttl'].details.items` (self-hosted caching hygiene)
3. **Translate Findings:** Do not just list the data. Translate it into plain language. For example, if "Script Evaluation" is high in the main-thread breakdown, state: "Significant time is being spent executing JavaScript, which can delay interactivity."
4. **Cross-reference first-party tooling:** When Lighthouse flags compression or unused-JS opportunities (`uses-text-compression`, `unused-javascript`), confirm against the existing spernakit measurement commands before promoting findings: `bun run verify-compression` and `bun run --cwd frontend build:analyze` (rollup-plugin-visualizer). Keep optimization decision-trees in [PERFORMANCE.md](./PERFORMANCE.md); this audit only corroborates, it does not duplicate the guidance.

### Step 6: Cross-Check with Field/Crawler Data (Spernakit)

Before finalizing recommendations, cross-reference the single-URL Lighthouse view with multi-route crawler output when available:

1. Read `logs/crawltest.json` (if present). Use `bun scripts/crawltest-analyze.ts` for a summary.
2. Identify whether the flagged page is an outlier or representative of a site-wide regression.
3. If the lab (Lighthouse) and field (crawltest) ratings disagree sharply on LCP/FCP for **reports captured before 2026-04-05**, note the known measurement-configuration change as a possible cause and recommend re-measurement.

### Step 7: Filter Inapplicable Opportunities

For self-hosted spernakit applications, suppress or de-prioritize opportunities that assume a CDN/edge topology the project does not use. Examples to verify against actual deployment before promoting:

- `uses-text-compression`: still relevant; spernakit serves via its own HTTP stack.
- `uses-http2` / `uses-http3`: relevant only if a reverse proxy is configured.
- `efficient-animated-content` (CDN-served media): often N/A for internal tools.
- `server-response-time`: relevant, but interpret against local network rather than global edge.

Call this out explicitly when recommending action so readers with non-public deployments do not chase irrelevant work.

### Step 8: Generate the Final Business-Focused Report

Synthesize all the extracted information into a single, well-structured Markdown report with the following sections:

1. **Executive Summary with Business Impact**
    - Overall performance scores for mobile and desktop
    - Biggest performance gap and its implications
    - Key stakeholder concerns and priorities
    - Tooling context (Lighthouse version, formFactor, throttling profile)

2. **Business Impact Dashboard**

    ```
    | Metric              | Current State     | Risk              | Impact                |
    | ------------------- | ----------------- | ----------------- | --------------------- |
    | Mobile Performance  | [Score]           | [High/Med/Low]    | [User-visible impact] |
    | Core Web Vitals     | [Pass/Fail]       | [Discoverability] | [Traffic impact]      |
    | User Experience     | [Assessment]      | [Abandonment]     | [Retention impact]    |
    ```

3. **Overall Score Comparison with Interpretation**
4. **Core Web Vitals & Performance Metrics with Business Translation**
5. **Priority Action Plan**: use the Step 4 framework, include CWV linkage for each item.
6. **Platform-Specific Analysis** (mobile vs desktop).
7. **Risk Assessment & Compliance**: accessibility, SEO (if applicable), security.
8. **Implementation Roadmap**: staged plan with success metrics.

---

## Example of AI Output

Here is an example of what the final report should look like after processing two hypothetical Lighthouse JSON files.

---

### Business-Focused Lighthouse Performance Analysis for `https://example.com`

Comparative analysis of Lighthouse v12 reports for desktop and mobile, run on `2026-04-22` (mobile: Moto G Power emulation, 4× CPU throttling; desktop: default Lighthouse desktop profile).

#### Executive Summary

The site scores **92** on desktop and **65** on mobile. The 27-point gap indicates mobile-specific render and execution bottlenecks.

**Key observations**:

- **Mobile LCP 3.5s** fails the Core Web Vital threshold (≤ 2.5s).
- **Mobile TBT 280ms** suggests INP will also trend poor in the field.
- **CLS 0.01** is well within the good threshold on both platforms.

#### Business Impact Dashboard

| Metric             | Current State         | Risk                             | Impact                                 |
| ------------------ | --------------------- | -------------------------------- | -------------------------------------- |
| Mobile Performance | 65/100 (Poor)         | HIGH: user abandonment           | Slow first impression on mobile users  |
| Core Web Vitals    | LCP failing on mobile | MEDIUM: discoverability (if SEO) | Public deploys: ranking signal penalty |
| User Experience    | Degraded on mobile    | HIGH: perceived tool quality     | Users may prefer alternatives          |

#### Overall Score Comparison

| Category        | Mobile | Desktop | Interpretation                      |
| --------------- | :----: | :-----: | ----------------------------------- |
| **Performance** |   65   |   92    | CRITICAL on mobile                  |
| Accessibility   |   95   |   95    | Good: legal compliance maintained   |
| Best Practices  |  100   |   100   | Excellent: no hygiene issues        |
| SEO             |  100   |   100   | Good: non-performance SEO is strong |

#### Core Web Vitals & Performance Metrics

| Metric                          |   Mobile   | Desktop | Verdict                   |
| ------------------------------- | :--------: | :-----: | ------------------------- |
| First Contentful Paint (FCP)    |    1.8s    |  0.9s   | Mobile: needs improvement |
| Largest Contentful Paint (LCP)  |  **3.5s**  |  1.4s   | **FAILING on mobile**     |
| Speed Index (SI)                |    2.9s    |  1.2s   | Mobile: needs improvement |
| Total Blocking Time (TBT)       | **280 ms** |  45 ms  | Mobile: needs improvement |
| INP (field, via CrUX/crawltest) |   240 ms   |  80 ms  | Mobile: needs improvement |
| Cumulative Layout Shift (CLS)   |    0.01    |  0.01   | Passing                   |

#### Priority Action Plan

1. **Optimize and Defer Images (Critical)**: hero banner drives LCP.
    - **Action:** Serve AVIF/WebP, set explicit width/height, `loading="lazy"` below fold.
    - **Estimated savings:** 1.2s
    - **CWV linkage:** Directly improves LCP.

2. **Eliminate Render-Blocking Resources (High)**
    - **Action:** Defer non-critical JS/CSS; inline critical CSS for above-the-fold.
    - **Estimated savings:** 650ms
    - **CWV linkage:** Improves LCP and FCP.

3. **Reduce Unused JavaScript (High)**
    - **Action:** Code-split by route; lazy-load heavy feature pages.
    - **Estimated savings:** 420ms
    - **CWV linkage:** Improves TBT / field INP.

#### Platform-Specific Opportunities

**Mobile Top 3:**

1. Properly size images (Est. Savings: 1.5s)
2. Eliminate render-blocking resources (Est. Savings: 650ms)
3. Reduce unused JavaScript (Est. Savings: 420ms)

**Desktop Top 3:**

1. Properly size images (Est. Savings: 0.4s)
2. Reduce initial server response time (Est. Savings: 0.2s)
3. Avoid chaining critical requests (Est. Savings: 0.2s)

---

## Audit Checklist

### Critical Checks

- [ ] Lighthouse version recorded; reports from < v11 flagged (no INP support)
- [ ] Core Web Vitals passing (LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1)
- [ ] Mobile Performance score ≥ 70¹
- [ ] No render-blocking resources with > 1s impact
- [ ] No references to FID (retired March 2024); INP used instead
- [ ] Critical-path JavaScript ≤ 170KB compressed¹

> ¹ **Applicability:** The mobile-performance ≥ 70 and 170KB critical-path gates are **Critical** for publicly/mobile-served deployments. For internal-only, single-team tools not served over mobile networks, treat these two checks as **High** rather than Critical. The thresholds themselves match the [PERFORMANCE.md](./PERFORMANCE.md) budget (source of truth) and do not change.

### High Priority Checks

- [ ] Both mobile AND desktop reports analyzed
- [ ] Top 3 opportunities identified per platform with CWV linkage
- [ ] Accessibility score ≥ 90
- [ ] SEO score ≥ 90 (for publicly indexed deployments)
- [ ] Crawltest field data consulted for multi-page context (if spernakit project)

### Medium Priority Checks

- [ ] Performance budget established and monitored
- [ ] Image optimization implemented (WebP/AVIF)
- [ ] Code splitting and lazy loading in place
- [ ] Caching strategies verified against actual deployment (browser + reverse proxy)
- [ ] Opportunities inapplicable to self-hosted topology explicitly filtered out

### Low Priority Checks

- [ ] Stakeholder communication template used
- [ ] Implementation roadmap documented with success metrics
- [ ] Performance trend tracked across runs (lab and field)
- [ ] Measurement-configuration changes (e.g., crawler `reportAllChanges` policy) noted when comparing historical reports

## Report Template

```markdown
# Lighthouse Audit Report - YYYY-MM-DD

## Executive Summary

**Status**: [MEASURED | CRAWLTEST-ONLY | SKIPPED / data-unavailable]
**URL**: [finalUrl]
**Artifacts parsed**: [mobile JSON, desktop JSON, logs/crawltest.json]
**Lighthouse versions**: [versions from artifacts]
**Fetch times**: [timestamps]

If status is `SKIPPED / data-unavailable`, stop here after listing attempted acquisition steps.
Do not include scores, issue counts, or recommendations.

## Overall Score Comparison

| Category       |                 Mobile |                Desktop | Interpretation           |
| -------------- | ---------------------: | ---------------------: | ------------------------ |
| Performance    | [score or unavailable] | [score or unavailable] | [impact]                 |
| Accessibility  | [score or unavailable] | [score or unavailable] | [impact]                 |
| Best Practices | [score or unavailable] | [score or unavailable] | [impact]                 |
| SEO            | [score or unavailable] | [score or unavailable] | [public-indexing caveat] |

## Core Web Vitals and Performance Metrics

| Metric |                       Mobile |                      Desktop | Crawltest field context | Verdict   |
| ------ | ---------------------------: | ---------------------------: | ----------------------- | --------- |
| LCP    |                      [value] |                      [value] | [route trend]           | [verdict] |
| INP    | [field value or unavailable] | [field value or unavailable] | [route trend]           | [verdict] |
| CLS    |                      [value] |                      [value] | [route trend]           | [verdict] |
| TBT    |                      [value] |                      [value] | Lab proxy for INP       | [verdict] |

## Priority Action Plan

| Priority                   | Issue   | User-visible impact | Evidence             | Recommended action |
| -------------------------- | ------- | ------------------- | -------------------- | ------------------ |
| [Critical/High/Medium/Low] | [issue] | [impact]            | [audit id / savings] | [action]           |
```

## Deliverables

- A Lighthouse report at `.aidd/audit-reports/LIGHTHOUSE-YYYY-MM-DD.md`.
- The mobile and desktop Lighthouse JSON artifacts when available, or a clear note that only `logs/crawltest.json` was available.
- A SKIPPED / data-unavailable report with attempted acquisition steps when no measurement artifact can be produced.
- Feature.json remediation entries only for findings supported by parsed artifacts and deduplicated against existing backlog items.
