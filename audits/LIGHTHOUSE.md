---
title: 'Lighthouse Report Processing with Business Context'
last_updated: '2025-09-10'
version: '1.0'
category: 'Performance'
priority: 'Medium'
estimated_time: '1-2 hours'
frequency: 'Monthly'
---

# Lighthouse Report Processing with Business Context

## Table of Contents

1. [Core Objective with Business Impact](#1-core-objective-with-business-impact)
2. [Report Analysis Framework](#2-report-analysis-framework)
3. [Performance Metrics Interpretation](#3-performance-metrics-interpretation)
4. [Business Impact Assessment](#4-business-impact-assessment)
5. [Optimization Recommendations](#5-optimization-recommendations)
6. [Stakeholder Communication](#6-stakeholder-communication)

## Core Objective with Business Impact

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

### 1. Core Objective with Business Impact

Your primary goal is to transform raw Lighthouse JSON data into a clear, concise, and actionable performance analysis that directly connects technical metrics to business outcomes. You will compare desktop and mobile reports for the same URL to highlight platform-specific issues and guide optimization efforts with clear ROI justification.

**Business Context**: Performance directly impacts:

- **User Experience**: Faster sites have higher user satisfaction and engagement
- **Conversion Rates**: 1-second delay can reduce conversions by 7%
- **SEO Rankings**: Google uses Core Web Vitals as ranking factors
- **Revenue Impact**: Amazon found 100ms delay costs 1% of sales
- **User Retention**: 53% of mobile users abandon sites that take >3 seconds to load

**Stakeholder Value**:

- **Executives**: Performance improvements translate to revenue growth
- **Marketing**: Better performance improves campaign effectiveness and ad spend ROI
- **Product**: Performance issues directly impact user satisfaction metrics
- **Engineering**: Clear priorities for technical debt and optimization work

### 2. Input Requirements

To begin, you must receive the full JSON output from two Lighthouse reports:

1. **Mobile Report:** The JSON generated from a mobile-emulated Lighthouse run.
2. **Desktop Report:** The JSON generated from a desktop-emulated Lighthouse run.

The user should provide this data, clearly identifying which is which. You should also have the context of the URL that was tested (`finalUrl` in the JSON).

### 3. Processing Workflow

Follow these steps to analyze the provided JSON reports.

#### Step 3.1: Ingestion and Validation

1. **Parse JSON:** Ingest the two JSON strings and parse them into structured objects.
2. **Initial Validation:** For each report, verify the presence of essential top-level keys like `categories`, `audits`, `finalUrl`, and `fetchTime`.
3. **Identify Key Information:** From each report, extract and store:
    - **URL Tested:** `finalUrl`
    - **Timestamp:** `fetchTime`
    - **Device Type:** `configSettings.formFactor` (should be 'mobile' or 'desktop')

#### Step 3.2: Extract Category Scores with Business Impact

For both the mobile and desktop reports, extract the overall scores for the main Lighthouse categories. The score is a value from \(0\) to \(1\), which should be presented as a score out of 100.

- **Performance:** `categories.performance.score`
- **Accessibility:** `categories.accessibility.score`
- **Best Practices:** `categories['best-practices'].score`
- **SEO:** `categories.seo.score`

Create a comparison table for these scores with business impact interpretation.

**Business Context for Each Category**:

| Category           | Business Impact                                           | Stakeholder Concern                                                    |
| ------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Performance**    | Direct revenue impact, user retention, conversion rates   | **CEO/Revenue**: Lost sales, **Marketing**: Campaign ROI               |
| **Accessibility**  | Legal compliance, market reach, brand reputation          | **Legal**: ADA compliance, **Product**: Inclusive design               |
| **Best Practices** | Security, maintainability, technical debt                 | **CTO**: Technical risk, **Security**: Vulnerability exposure          |
| **SEO**            | Organic traffic, search rankings, marketing effectiveness | **Marketing**: Traffic acquisition costs, **Growth**: User acquisition |

**Score Interpretation for Stakeholders**:

- **90-100**: Excellent - Competitive advantage
- **80-89**: Good - Minor optimizations needed
- **70-79**: Needs Improvement - Business impact likely
- **Below 70**: Poor - Immediate action required, significant business risk

#### Step 3.3: Extract Key Performance Metrics with Business Impact

Dive deeper into the performance category. Extract the primary metrics that constitute the Performance score. These are found within the `audits` object.

| Metric Name                    | JSON Path                                         | Unit | Business Impact                                |
| ------------------------------ | ------------------------------------------------- | ---- | ---------------------------------------------- |
| First Contentful Paint (FCP)   | `audits['first-contentful-paint'].displayValue`   | s    | User perception of loading speed               |
| Largest Contentful Paint (LCP) | `audits['largest-contentful-paint'].displayValue` | s    | **Core Web Vital** - SEO ranking factor        |
| Speed Index (SI)               | `audits['speed-index'].displayValue`              | s    | Visual loading experience                      |
| Total Blocking Time (TBT)      | `audits['total-blocking-time'].displayValue`      | ms   | User interaction responsiveness                |
| Cumulative Layout Shift (CLS)  | `audits['cumulative-layout-shift'].displayValue`  |      | **Core Web Vital** - User experience stability |

Create a detailed comparison table for these key metrics, showing the values for mobile and desktop side-by-side.

**Core Web Vitals Business Context**:

> **Detailed Thresholds**: See [PERFORMANCE.md](./PERFORMANCE.md) for comprehensive Core Web Vitals thresholds, Lighthouse scoring weights, and optimization decision trees.

| Metric  | Target | Business Impact                                                 |
| ------- | ------ | --------------------------------------------------------------- |
| **LCP** | ≤2.5s  | **SEO**: Google ranking factor, **UX**: Perceived loading speed |
| **INP** | ≤200ms | **Engagement**: User interaction responsiveness                 |
| **CLS** | ≤0.1   | **UX**: Visual stability, prevents accidental clicks            |

**Stakeholder Translation**:

- **LCP >4.0s**: "Users wait 4+ seconds to see main content - high abandonment risk"
- **TBT >300ms**: "Page feels unresponsive to user interactions - poor user experience"
- **CLS >0.25**: "Content jumps around while loading - frustrating user experience"

#### Step 3.4: Identify and Prioritize Opportunities with Business Impact Framework

This is the most critical step for generating actionable advice. The "Opportunities" section in Lighthouse suggests improvements with the highest potential impact.

1. **Filter for Opportunities:** Iterate through the `audits` object. Identify audits that are opportunities. These audits often have a `details.type` of `'opportunity'`.
2. **Extract Savings:** For each opportunity, extract the potential savings. This is typically found in `details.overallSavingsMs` (for time) or `details.overallSavingsBytes` (for data).
3. **Apply Business Prioritization Framework:** Use the comprehensive prioritization matrix below.
4. **Summarize Top 3:** List the top 3 opportunities for each platform with business justification.

**Comprehensive Prioritization Framework**:

| Priority Level  | Criteria                                 | Business Impact                  | Implementation            |
| --------------- | ---------------------------------------- | -------------------------------- | ------------------------- |
| **🚨 CRITICAL** | >1s savings OR Core Web Vital failure    | Revenue impact, SEO penalty risk | Immediate (1-2 weeks)     |
| **⚠️ HIGH**     | 500ms-1s savings OR accessibility issues | User experience degradation      | Next sprint (2-4 weeks)   |
| **📋 MEDIUM**   | 200-500ms savings OR best practices      | Competitive disadvantage         | Next quarter (1-3 months) |
| **📝 LOW**      | <200ms savings OR minor optimizations    | Marginal improvements            | Backlog (3+ months)       |

**Business Impact Scoring Matrix**:

| Factor                     | Weight | Scoring                                                         |
| -------------------------- | ------ | --------------------------------------------------------------- |
| **Time Savings**           | 40%    | >1s=10pts, 500ms-1s=7pts, 200-500ms=4pts, <200ms=1pt            |
| **Core Web Vitals Impact** | 30%    | Fixes failing CWV=10pts, Improves CWV=7pts, No CWV impact=1pt   |
| **User Experience**        | 20%    | Critical UX issue=10pts, Moderate UX=5pts, Minor UX=1pt         |
| **Implementation Effort**  | 10%    | Easy (1-2 days)=10pts, Medium (1 week)=5pts, Hard (>1 week)=1pt |

**Total Score Calculation**: (Time×0.4) + (CWV×0.3) + (UX×0.2) + (Effort×0.1)

**Stakeholder Communication Template**:

```
**Issue**: [Technical description]
**Business Impact**: [Revenue/UX/SEO impact in plain language]
**User Impact**: [What users experience]
**Estimated Savings**: [Time/performance improvement]
**Implementation Effort**: [Development time required]
**ROI**: [Business benefit vs implementation cost]
```

#### Step 3.5: Analyze Diagnostics

Diagnostics provide additional information about how the page adheres to web development best practices.

1. **Filter for Diagnostics:** Identify relevant diagnostic audits.
2. **Extract Key Findings:** Pull out critical information from diagnostics such as:
    - `diagnostics['mainthread-work-breakdown'].details.items` (to see time spent on script evaluation, parsing, etc.)
    - `diagnostics['network-requests'].details.items` (to identify large or slow requests)
    - `diagnostics['critical-request-chains'].details` (to find render-blocking request chains)
3. **Translate Findings:** Do not just list the data. Translate it into plain language. For example, if "Script Evaluation" is high in the main-thread breakdown, state that "Significant time is being spent executing JavaScript, which can delay interactivity."

#### Step 3.6: Generate the Final Business-Focused Report

Synthesize all the extracted information into a single, well-structured report using Markdown. The report should have the following sections with clear business context:

1. **Executive Summary with Business Impact:** A brief, high-level overview that includes:
    - Overall performance scores for mobile and desktop
    - Biggest performance gap and its business implications
    - Estimated revenue/conversion impact
    - Key stakeholder concerns and priorities

2. **Business Impact Dashboard:** Include a summary table:

    ```
    | Metric | Current State | Business Risk | Estimated Impact |
    |--------|---------------|---------------|------------------|
    | Mobile Performance | [Score] | [High/Medium/Low] | [Revenue/Conversion impact] |
    | Core Web Vitals | [Pass/Fail] | [SEO penalty risk] | [Traffic impact] |
    | User Experience | [Assessment] | [Abandonment risk] | [User retention impact] |
    ```

3. **Overall Score Comparison with Interpretation:** The table from Step 3.2 plus:
    - Business implications for each category
    - Competitive positioning context
    - Stakeholder-specific concerns

4. **Core Web Vitals & Performance Metrics with Business Translation:**
    - Technical metrics table from Step 3.3
    - Plain-language explanation of what each metric means for users
    - Business impact of poor performance in each area

5. **Priority Action Plan with ROI Analysis:** This is the most important section:
    - Use the prioritization framework from Step 3.4
    - Include business justification for each recommendation
    - Provide implementation timeline and resource requirements
    - Estimate business impact of improvements

6. **Platform-Specific Business Analysis:**
    - **Mobile Analysis:** Focus on mobile-first user experience and conversion impact
    - **Desktop Analysis:** Focus on productivity and engagement metrics
    - Include device-specific user behavior implications

7. **Risk Assessment & Compliance:**
    - Accessibility compliance risks and legal implications
    - SEO penalty risks and traffic impact
    - Security vulnerabilities and brand risk
    - Competitive disadvantage assessment

8. **Implementation Roadmap:**
    - Quarterly implementation plan
    - Resource requirements and team assignments
    - Success metrics and measurement plan
    - Expected business outcomes and timeline

---

### Example of AI Output

Here is an example of what the final report should look like after processing two hypothetical Lighthouse JSON files.

---

### Business-Focused Lighthouse Performance Analysis for `https://example.com`

Here is a comparative analysis of the Lighthouse reports for desktop and mobile, run on `8/1/2025`.

#### Executive Summary with Business Impact

The website shows strong performance on desktop with a score of **92**, but performance degrades significantly on mobile, scoring only **65**. This 27-point performance gap represents a critical business risk.

**Business Impact Assessment**:

- **Revenue Risk**: Mobile users (70% of traffic) experience 3.5s load times, potentially causing 25% abandonment rate
- **SEO Penalty**: Failing Core Web Vitals on mobile may reduce organic search rankings
- **Competitive Disadvantage**: Performance gap gives competitors significant advantage in mobile user acquisition
- **Estimated Impact**: Improving mobile performance to 85+ could increase mobile conversions by 15-20%

**Key Stakeholder Concerns**:

- **CEO/Revenue**: Mobile performance issues directly impact 70% of potential customers
- **Marketing**: Poor mobile performance reduces campaign ROI and increases acquisition costs
- **Product**: User experience degradation affects satisfaction and retention metrics

#### Business Impact Dashboard

| Metric             | Current State                 | Business Risk                       | Estimated Impact                          |
| ------------------ | ----------------------------- | ----------------------------------- | ----------------------------------------- |
| Mobile Performance | 65/100 (Poor)                 | **HIGH** - Revenue loss             | 25% user abandonment, 15% conversion loss |
| Core Web Vitals    | **FAILING** on mobile         | **CRITICAL** - SEO penalty          | 10-15% organic traffic reduction          |
| User Experience    | Significantly degraded mobile | **HIGH** - Competitive disadvantage | User acquisition cost increase            |

#### Overall Score Comparison with Business Interpretation

| Category        | Mobile Score | Desktop Score | Business Impact                              |
| --------------- | :----------: | :-----------: | -------------------------------------------- |
| **Performance** |      65      |      92       | **CRITICAL**: Mobile revenue impact          |
| Accessibility   |      95      |      95       | **GOOD**: Legal compliance maintained        |
| Best Practices  |     100      |      100      | **EXCELLENT**: No security/technical risks   |
| SEO             |     100      |      100      | **GOOD**: Non-performance SEO factors strong |

**Business Interpretation**:

- **Performance Gap**: 27-point difference represents significant competitive disadvantage on mobile
- **Risk Assessment**: Mobile performance issues affect 70% of users, creating substantial revenue risk
- **Competitive Position**: Desktop performance is competitive, but mobile lags industry standards

#### Core Web Vitals & Performance Metrics with Business Translation

| Metric                         | Mobile Value | Desktop Value | Business Impact                               |
| ------------------------------ | :----------: | :-----------: | --------------------------------------------- |
| First Contentful Paint (FCP)   |    1.8 s     |     0.9 s     | Users wait 2x longer to see content on mobile |
| Largest Contentful Paint (LCP) |  **3.5 s**   |     1.4 s     | **FAILING Core Web Vital** - SEO penalty risk |
| Speed Index (SI)               |    2.9 s     |     1.2 s     | Mobile visual loading 2.4x slower             |
| Total Blocking Time (TBT)      |  **280 ms**  |     45 ms     | Mobile interactions feel unresponsive         |
| Cumulative Layout Shift (CLS)  |     0.01     |     0.01      | **PASSING** - Good visual stability           |

**Business Translation**:

- **LCP 3.5s on mobile**: Users wait 3.5 seconds to see main content - high abandonment risk
- **TBT 280ms**: Page feels sluggish and unresponsive to user interactions
- **Core Web Vitals Status**: FAILING on mobile due to LCP, risking Google ranking penalties

#### Priority Action Plan

1. **Optimize and Defer Images:** The hero banner image is unoptimized and significantly impacts LCP.
    - **Action:** Compress the image and serve it in a next-gen format like AVIF or WebP. Use `loading="lazy"` for images that are below the fold. (Est. Savings: \(1.2\)s)
2. **Eliminate Render-Blocking Resources:** Several large JavaScript files are blocking the initial page render.
    - **Action:** Identify non-critical JavaScript and CSS. Defer their loading using the `defer` or `async` attributes on `<script>` tags. Inline critical CSS for above-the-fold content. (Est. Savings: \(650\)ms)
3. **Reduce Unused JavaScript:** A large portion of the main JavaScript bundle is not used on the initial page load.
    - **Action:** Use code-splitting to break up large JavaScript bundles and only load the code necessary for the current view. (Est. Savings: \(420\)ms)

#### Platform-Specific Opportunities

**Mobile Top 3 Opportunities:**

1. Properly size images (Est. Savings: \(1.5\)s)
2. Eliminate render-blocking resources (Est. Savings: \(650\)ms)
3. Reduce unused JavaScript (Est. Savings: \(420\)ms)

**Desktop Top 3 Opportunities:**

1. Properly size images (Est. Savings: \(0.4\)s)
2. Reduce initial server response time (Est. Savings: \(0.2\)s)
3. Avoid chaining critical requests (Est. Savings: \(0.2\)s)

---

## Audit Checklist

### Critical Checks 🚨

- [ ] Core Web Vitals passing (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1)
- [ ] Mobile Performance Score ≥70 (avoid Google ranking penalty)
- [ ] No render-blocking resources with >1s impact
- [ ] Critical path JavaScript ≤170KB compressed

### High Priority Checks ⚠️

- [ ] Desktop and mobile reports analyzed for both platforms
- [ ] Top 3 opportunities identified with business impact
- [ ] Accessibility score ≥90 (legal compliance)
- [ ] SEO score ≥90 (organic traffic impact)

### Medium Priority Checks 📋

- [ ] Performance budget established and monitored
- [ ] Image optimization implemented (WebP/AVIF formats)
- [ ] Code splitting and lazy loading in place
- [ ] Caching strategies configured (browser, CDN)

### Low Priority Checks 💡

- [ ] Stakeholder communication template used
- [ ] Implementation roadmap documented
- [ ] Performance trend analysis tracked
- [ ] A/B testing for performance improvements considered
