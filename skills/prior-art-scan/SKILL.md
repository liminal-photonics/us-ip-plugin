---
name: prior-art-scan
description: Use when the user wants a first look at existing US patents and published applications near an idea, product feature or competitor, or the status and owner of a specific US patent or application.
---

# Prior-art scan

A quick landscape of USPTO records near an idea. **This is not legal advice, not a patentability opinion and not a freedom-to-operate (FTO) analysis.** Say so in every answer.

## Steps

1. Restate the idea as 2–4 short concept phrases (e.g. "spectral sensor", "ambient light sensor calibration"). Do not paste the user's confidential details into searches; use generic technical terms.
2. Run `patent_search` for each phrase (`keywords` must all appear in the title). Narrow with `cpc` when you know the area (e.g. G01J for photometry and spectrometry, H04W for wireless networks), `filedFrom` for recent work, and `grantedOnly: true` to see issued patents.
3. Search competitors by `applicant` when the user names them.
4. For the 3–8 most relevant hits, call `patent_details` for status, assignee, continuity (pending continuations mean claims can still change) and patent term adjustment.

## Output

- A table: patent or publication number, title, applicant/assignee, filed, granted or status, CPC, and one line on why it looks relevant.
- Short notes: clusters by applicant or CPC, and which records are still pending.
- The limits, always: "This scan searches USPTO titles and metadata only, not full text or claims, and covers US records only. It is not legal advice, a patentability opinion or a freedom-to-operate analysis. Relevance depends on the claims, which this tool does not read. Talk to a registered patent attorney before relying on it."
- Never say a product is "clear", "not infringing" or "patentable".
