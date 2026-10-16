#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { trademarkSearch, trademarkStatus } from "./trademarks.js";
import { patentSearch, patentDetails } from "./patents.js";
import { status } from "./core.js";

const TOOLS = [
  {
    name: "trademark_search",
    description: "Knockout search of USPTO trademark records by word mark (exact, fuzzy and prefix). Live marks only by default; optional Nice classes. Not legal clearance.",
    inputSchema: { type: "object", properties: { mark: { type: "string", minLength: 1 }, liveOnly: { type: "boolean", default: true }, classes: { type: "array", items: { type: "integer", minimum: 1, maximum: 45 } }, limit: { type: "integer", minimum: 1, maximum: 100, default: 20 } }, required: ["mark"] },
  },
  {
    name: "trademark_status",
    description: "USPTO TSDR case status for one trademark serial number: status, owners, classes, recent prosecution history. Needs USPTO_TSDR_API_KEY.",
    inputSchema: { type: "object", properties: { serialNumber: { type: "string", minLength: 8 } }, required: ["serialNumber"] },
  },
  {
    name: "patent_search",
    description: "Search USPTO patent applications and grants (Open Data Portal) by title keywords (all words must match), first applicant, CPC class prefix and filing-date range; optionally granted patents only. Newest filings first. Searches titles and metadata, not full text or claims. Also returns a Google Patents link as a convenience search to continue in full text; it is not verification of the USPTO results. Needs USPTO_API_KEY.",
    inputSchema: {
      type: "object",
      properties: {
        keywords: { type: "string", description: "Words that must all appear in the title" },
        applicant: { type: "string" },
        cpc: { type: "string", description: 'CPC prefix, e.g. "G01J" or "G01J3/28"' },
        filedFrom: { type: "string", description: "YYYY-MM-DD" }, filedTo: { type: "string", description: "YYYY-MM-DD" },
        grantedOnly: { type: "boolean", default: false },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10 }, offset: { type: "integer", minimum: 0, default: 0 },
      },
    },
  },
  {
    name: "patent_details",
    description: "Status and details for one US application or patent: title, status, dates, applicant, inventors (names only), CPC, assignments, continuity, patent term adjustment, recent events. Accepts 16/568,903, 11,000,000 or US11000000B2. Needs USPTO_API_KEY.",
    inputSchema: { type: "object", properties: { number: { type: "string", minLength: 1 }, type: { type: "string", enum: ["auto", "application", "patent"], default: "auto" } }, required: ["number"] },
  },
  { name: "ip_status", description: "Show which USPTO sources are available and which keys are configured.", inputSchema: { type: "object", properties: {} } },
];

const HANDLERS = { trademark_search: trademarkSearch, trademark_status: trademarkStatus, patent_search: patentSearch, patent_details: patentDetails, ip_status: status };

const server = new Server({ name: "us-ip", version: "0.1.0" }, { capabilities: { tools: {} } });
// Reject misspelled or unknown argument names instead of silently ignoring them (e.g. "query" for "keywords").
const ALIASES = { query: "keywords", q: "keywords", keyword: "keywords", text: "keywords", term: "keywords", mark: "markText", serial: "serialNumber", patent: "patentNumber", applicant: "applicantName", owner: "applicantName" };
function checkArgs(name, a) {
  if (!a || typeof a !== "object" || Array.isArray(a)) return;
  const props = Object.keys(TOOLS.find((t) => t.name === name)?.inputSchema?.properties || {});
  const bad = Object.keys(a).filter((k) => !props.includes(k));
  if (!bad.length) return;
  const lc = (x) => x.toLowerCase().replace(/[_-]/g, "");
  const hint = (k) => { const g = props.find((p) => lc(p) === lc(k)) || (props.includes(ALIASES[lc(k)]) ? ALIASES[lc(k)] : null); return g ? ` (did you mean "${g}"?)` : ""; };
  throw new Error(`${bad.slice(0, 5).map((k) => `Unknown argument "${String(k).slice(0, 40)}"${hint(k)}`).join("; ")}. ${name} accepts: ${props.join(", ")}.`);
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: a = {} } = req.params;
  try {
    const h = HANDLERS[name];
    if (!h) throw new Error(`Unknown tool ${name}`);
    checkArgs(name, a);
    return { content: [{ type: "text", text: JSON.stringify(await h(a), null, 2) }] };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: e.message }] };
  }
});
await server.connect(new StdioServerTransport());
