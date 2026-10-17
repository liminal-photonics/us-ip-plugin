# US Trademark & Patent Research

A Grok Bot / Cursor plugin for USPTO trademark and patent research. It bundles a local MCP server and two skills. **Research aid only, not legal advice.**

<img src="assets/logo.svg" width="96" alt="logo">

## What you get

**MCP tools** (server `us-ip`, local stdio, Node 18+):

| Tool | What it does | Key |
| --- | --- | --- |
| `trademark_search` | Knockout search of USPTO trademarks by word mark (exact, fuzzy, prefix); live marks only by default; optional Nice classes | none |
| `trademark_status` | TSDR status for a serial number: status, current owner of record (latest owner role), full owner history, classes, recent history | `USPTO_TSDR_API_KEY` |
| `patent_search` | US applications and grants by title keywords, first applicant, CPC prefix and filing dates; granted-only option | `USPTO_API_KEY` |
| `patent_details` | One application or patent: status, dates, applicant, inventor names, CPC, assignments, continuity, patent term adjustment, recent events | `USPTO_API_KEY` |
| `ip_status` | Shows which keys are set, plus the plugin version and git commit | none |

**Skills**

- `trademark-knockout`: quick USPTO conflict screen for a product or company name. Every answer says it is not legal clearance.
- `prior-art-scan`: a first look at US patents and applications near an idea or competitor. Every answer says it is not legal advice, not a patentability opinion and not freedom to operate.

For regulations (eCFR, Federal Register, FCC equipment authorization), see the companion plugin [US Regulatory Research](https://github.com/liminal-photonics/us-regulatory-plugin).

## Install

Install **US Trademark & Patent Research** from the Grok Bot or Cursor plugin marketplace. To run it by hand in any MCP client:

```json
{
  "mcpServers": {
    "us-ip": {
      "command": "npx",
      "args": ["-y", "github:liminal-photonics/us-ip-plugin#v0.2.0"],
      "env": { "USPTO_API_KEY": "...", "USPTO_TSDR_API_KEY": "..." }
    }
  }
}
```

## Reliability fields (v0.2.0)

- Every tool result carries `retrievedAt` (UTC, ISO 8601) and `plugin: { name, version, gitSha }`, so a saved result can be dated and traced to the exact build. Array results are wrapped as `{ result: [...] }`.
- `ip_status` reports `pluginName`, `version`, `gitSha` and `gitShaSource` (the npm lockfile that installed the plugin, `PLUGIN_GIT_SHA`, or the git checkout).
- Pin installs to a release tag (`#v0.2.0`) or a commit SHA, not the default branch, so an update can't change answers without notice. The tag is created on the merge commit; until it exists, pin the merge commit SHA.

## API keys (free, bring your own)

`trademark_search` needs no key. The repo stores no keys, and calls go straight from your machine to USPTO.

**USPTO Open Data Portal key** (`USPTO_API_KEY`, for patent tools)
1. Create a USPTO.gov account with multi-factor authentication at https://account.uspto.gov.
2. Create an ID.me account and verify your identity.
3. Sign in at https://data.uspto.gov/apikey/key-reveal (Manage API Key), link your ID.me account, and fill in the required profile fields (job title, organization name, organization type, intended use).
4. Click **Activate API Key** and copy the key into `USPTO_API_KEY`.

**USPTO TSDR key** (`USPTO_TSDR_API_KEY`, for `trademark_status`)
1. Sign in with your USPTO.gov account at https://account.uspto.gov/api-manager/.
2. Request a TSDR API key and copy it into `USPTO_TSDR_API_KEY`.

Set the keys where your agent runs (the plugin's `mcp.json` reads `${env:...}`). A tool without its key returns a setup message instead of failing.

## Examples

- "Knockout search the name LUMEN for class 9 electronics."
- "What's the status of trademark serial 99835982?"
- "Find granted US patents with 'spectral sensor' in the title in CPC G01J since 2022."
- "Who owns US 11,000,000 and is it still in force?"

## Data notes

- **Trademark search** uses the public JSON endpoint behind USPTO's Trademark Search site (tmsearch.uspto.gov). It needs no key but isn't a documented API, so USPTO can change it without notice. If it changes, the tool says so instead of returning wrong data.
- **Patent search** uses the USPTO Open Data Portal patent file wrapper API. It searches titles and bibliographic data, not full text or claims. For full-text search use USPTO Patent Public Search (ppubs.uspto.gov).
- `patent_details` accepts `16/568,903`, `11,000,000` or `US11000000B2`. A bare 8-digit number can be both a patent number and an application number. The tool checks both, prefers the patent, and adds a note. Pass `type` to choose.
- **Google Patents links:** every `patent_search` result includes a ready-made Google Patents search URL with the same words, applicant, dates and granted filter (Google searches full text and the link doesn't carry the CPC filter, so its results differ). Each record also has its Google Patents page (`patents.google.com/patent/US11000000`). These are links only; nothing is scraped.
- Inventor results are names only; addresses are left out.
- Requests time out after 20 s (`US_IP_TIMEOUT_MS` changes this). On HTTP 429 the tool waits (up to 5 s) and retries once, then returns a clear rate-limit message.
- **Not legal advice.** Trademark results are not clearance. Patent results are not a patentability, validity or freedom-to-operate opinion.

## Development

```bash
npm install
npm test               # offline unit tests (fixtures trimmed from real API responses)
USPTO_API_KEY=... USPTO_TSDR_API_KEY=... npm run live   # live smoke test over stdio
```

## License

MIT © Liminal Photonics
