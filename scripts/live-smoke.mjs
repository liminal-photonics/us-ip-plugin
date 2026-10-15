// Live smoke test over stdio. SPEC env var picks the server (default: local src). Never prints keys.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const spec = process.env.SPEC;
const cmd = spec ? { command: "npx", args: ["-y", spec] } : { command: "node", args: ["src/index.js"] };
async function run(env, fn) {
  const c = new Client({ name: "smoke", version: "0" });
  await c.connect(new StdioClientTransport({ ...cmd, env }));
  try { await fn(async (n, a) => { const r = await c.callTool({ name: n, arguments: a }); return r.isError ? { ERROR: r.content[0].text } : JSON.parse(r.content[0].text); }, c); } finally { await c.close(); }
}
const pause = () => new Promise((r) => setTimeout(r, 1200));
await run(process.env, async (call, c) => {
  console.log("TOOLS", (await c.listTools()).tools.map((t) => t.name).join(", "));
  console.log("STATUS", JSON.stringify(await call("ip_status", {})));
  const t = await call("trademark_search", { mark: "lumen", classes: [9], limit: 3 });
  console.log("TM_SEARCH total", t.total); for (const m of t.results) console.log("  ", m.serialNumber, m.mark, "|", m.status, "|", m.owner);
  const st = await call("trademark_status", { serialNumber: t.results[0]?.serialNumber || "97123456" });
  console.log("TM_STATUS", st.serialNumber, st.mark, "|", st.statusSummary, "| owners", (st.owners || []).map((o) => o.name).join("; "), st.error || "");
  const p = await call("patent_search", { keywords: "spectral sensor", cpc: "G01J", grantedOnly: true, filedFrom: "2022-01-01", limit: 3 });
  console.log("PAT_SEARCH total", p.total, p.ERROR || ""); for (const r of p.results || []) console.log("  ", r.patentNumber, r.applicationNumber, "|", r.title.slice(0, 70), "|", r.applicant, "| granted", r.granted);
  await pause();
  for (const n of ["US11000000B2", "16/568,903"]) {
    const d = await call("patent_details", { number: n });
    console.log("PAT_DETAILS", n, "->", d.applicationNumber, "patent", d.patentNumber, "|", d.status, "| granted", d.granted, "| assignee", d.assignments?.[0]?.assignees?.join("; "), "| parents", d.parents?.length, d.note || "", d.ERROR || d.error || "");
    await pause();
  }
  console.log("PAT_MISSING", JSON.stringify(await call("patent_details", { number: "99999999" })));
  await pause();
  const e = await call("patent_search", { keywords: "zzqxqzzqq" });
  console.log("PAT_EMPTY total", e.total, "results", e.results?.length);
  console.log("EMPTY_INPUT", JSON.stringify(await call("patent_search", {})));
});
const env2 = { ...process.env }; delete env2.USPTO_API_KEY; delete env2.USPTO_TSDR_API_KEY;
await run(env2, async (call) => {
  console.log("NOKEY STATUS", JSON.stringify(await call("ip_status", {})));
  console.log("NOKEY PAT", JSON.stringify(await call("patent_search", { keywords: "sensor" })));
  console.log("NOKEY TM_STATUS", JSON.stringify(await call("trademark_status", { serialNumber: "97123456" })).slice(0, 150));
  console.log("NOKEY TM_SEARCH still works:", (await call("trademark_search", { mark: "lumen", limit: 1 })).results.length, "result");
});
