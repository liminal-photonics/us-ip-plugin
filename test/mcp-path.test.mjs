// End-to-end tests through the MCP tool path (stdio server + MCP client) against a local mock USPTO API.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = fileURLToPath(new URL("../src/index.js", import.meta.url));
let mock, base;
before(async () => {
  mock = http.createServer((req, res) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ count: 0, patentFileWrapperDataBag: [] })); });
  await new Promise((r) => mock.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${mock.address().port}`;
});
after(() => mock.close());

async function client() {
  const c = new Client({ name: "t", version: "1" });
  await c.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { ...process.env, USPTO_API_KEY: "k", USPTO_ODP_API_BASE: base } }));
  return c;
}

test("MCP patent_search: the Google Patents link is labeled a convenience search, not verification", async () => {
  const c = await client();
  try {
    const t = (await c.listTools()).tools.find((x) => x.name === "patent_search");
    assert.match(t.description, /Google Patents link.*convenience.*not.*verif/i);
    const r = JSON.parse((await c.callTool({ name: "patent_search", arguments: { keywords: "light meter", cpc: "G01J" } })).content[0].text);
    assert.match(r.googlePatentsNote, /convenience/i);
    assert.match(r.googlePatentsNote, /does not verify|not a check/i);
    assert.match(r.googlePatentsSearchUrl, /cpc=G01J/);
  } finally { await c.close(); }
});

test("MCP: unknown argument names are rejected with the valid names and a likely match", async () => {
  const r = await call("patent_search", { query: "lux meter", cpc: "G01J1/42" });
  assert.equal(r.isError, true);
  assert.match(r.text, /Unknown argument "query"/);
  assert.match(r.text, /keywords/);
});
async function call(name, args) {
  const c = await client();
  try { const r = await c.callTool({ name, arguments: args }); return { isError: !!r.isError, text: r.content[0].text }; } finally { await c.close(); }
}
