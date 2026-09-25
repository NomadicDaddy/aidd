## How does this project compute its final benchmark score, and is the computation correct?

Work from the source rather than from the names. Answer each part:

1. For one result with correctness 0.8, reliability 0.6 and time 0.4, what does `weightedScore` return? Show each term.
2. Does `TASK_WEIGHTS` accurately describe how `weightedScore` combines a result? Explain any difference, and state what the declared weights add up to.
3. `compositeScore` is given four results: two `agentic` results that each score 1.0 from `weightedScore`, and two `control` results. What does it return, and does that match what the function's own comment says it does? If not, what is wrong?
