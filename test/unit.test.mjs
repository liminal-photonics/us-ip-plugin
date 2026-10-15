import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeMark, normalizeTsdr, normalizeClasses, buildSearchQuery, trademarkSearch, trademarkStatus } from "../src/trademarks.js";
import { googlePatentsSearchUrl, googlePatentsPageUrl, buildPatentQuery, normalizeApplication, normalizeDetails, patentSearch, patentDetails, esc } from "../src/patents.js";
import { request } from "../src/http.js";
import { status } from "../src/core.js";
function mockFetch(fn) {
  const real = globalThis.fetch;
  globalThis.fetch = fn;
  return () => { globalThis.fetch = real; };
}
const ok = (body, status = 200) => ({ ok: status < 400, status, headers: new Map(), json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });


const TM_HIT = { id: "88117004", source: { id: "88117004", wordmark: "AZUKI", alive: false, statusCode: 710, statusDescription: "CANCELLED - SECTION 8", filedDate: "2018-09-14T00:00:00", registrationId: "5837950", registrationDate: "2019-08-20", internationalClass: ["IC 007"], goodsAndServices: ["(CANCELLED) IC 007: [ Electric egg beaters ]."], ownerName: ["Dongguan Xinrun Electronics Co., Ltd. (limited company (ltd.); CHINA)"], drawingCodeDescription: "(4) STANDARD CHARACTER MARK" } };
const TSDR = { trademarks: [{ status: { serialNumber: 97123456, filingDate: "2021-11-13", usRegistrationNumber: "", status: 602, statusDate: "2023-03-22", dateAbandoned: "2023-03-08", markElement: "AZUKI ZEN", markDrawDesc: "STANDARD CHARACTER MARK", extStatusDesc: "Abandoned because the applicant failed to respond.  To view all documents in this file, click on the Trademark Document Retrieval link at the top of this page.", tm5StatusDesc: "DEAD/APPLICATION/Refused/Dismissed or Invalidated", staff: { examiner: { name: "BELL, JUSTIN T" } }, lawOffAssigned: "LAW OFFICE 112" }, parties: { ownerGroups: { "11": [{ name: "CHIRU LABS, INC.", partyTypeDescription: "SUBSEQUENT OWNER BEFORE PUBLICATION", entityType: { description: "CORPORATION" } }, { name: "CHIRU LABS, INC.", partyTypeDescription: "SUBSEQUENT OWNER BEFORE PUBLICATION", entityType: { description: "CORPORATION" } }] } }, gsList: [{ internationalClasses: [{ code: "009", description: "Electrical and Scientific Apparatus" }] }], prosecutionHistory: [{ entryDate: "2023-03-22T04:00:00.000+0000", entryDesc: "ABANDONMENT NOTICE E-MAILED - FAILURE TO RESPOND" }] }] };

test("trademark search hit and TSDR status normalize", () => {
  const m = normalizeMark(TM_HIT);
  assert.equal(m.serialNumber, "88117004");
  assert.equal(m.live, false);
  assert.equal(m.filed, "2018-09-14");
  assert.match(m.owner, /Dongguan/);
  const s = normalizeTsdr(TSDR);
  assert.equal(s.mark, "AZUKI ZEN");
  assert.equal(s.status, "Abandoned because the applicant failed to respond.");
  assert.equal(s.owners.length, 1); // duplicates removed
  assert.deepEqual(s.classes, ["009 Electrical and Scientific Apparatus"]);
  assert.equal(s.recentHistory[0].date, "2023-03-22");
  assert.equal(normalizeTsdr({ trademarks: [] }), null);
});

test("trademark classes and query", () => {
  assert.deepEqual(normalizeClasses([9, "IC 042"]), ["009", "042"]);
  assert.throws(() => normalizeClasses([46]), /Nice class/);
  const q = buildSearchQuery("lumen", { liveOnly: true, classes: ["009"], limit: 5 });
  assert.deepEqual(q.query.bool.filter, [{ term: { alive: true } }, { terms: { IC: ["009"] } }]);
  assert.equal(q.size, 5);
});

test("trademark search reports an unexpected response shape instead of empty results", async () => {
  const restore = mockFetch(async () => ok({ message: "changed" }));
  try { await assert.rejects(trademarkSearch({ mark: "x" }), /unexpected response/); } finally { restore(); }
});

test("trademark_status without a key returns a clean message and makes no call", async () => {
  const saved = process.env.USPTO_TSDR_API_KEY;
  delete process.env.USPTO_TSDR_API_KEY;
  let called = false;
  const restore = mockFetch(async () => { called = true; return ok({}); });
  try {
    const r = await trademarkStatus({ serialNumber: "97123456" });
    assert.match(r.error, /USPTO_TSDR_API_KEY/);
    assert.equal(called, false);
    await assert.rejects(trademarkStatus({ serialNumber: "123" }), /8-digit/);
  } finally { restore(); if (saved) process.env.USPTO_TSDR_API_KEY = saved; }
});

test("TSDR key is sent as a header, and a 401 gives a key message", async () => {
  const saved = process.env.USPTO_TSDR_API_KEY;
  process.env.USPTO_TSDR_API_KEY = "test-key";
  let headers;
  const restore = mockFetch(async (u, init) => { headers = init.headers; return ok(TSDR); });
  try {
    const r = await trademarkStatus({ serialNumber: "97123456" });
    assert.equal(r.mark, "AZUKI ZEN");
    assert.equal(headers["USPTO-API-KEY"], "test-key");
  } finally { restore(); }
  const restore2 = mockFetch(async () => ok("unauthorized", 401));
  try { await assert.rejects(trademarkStatus({ serialNumber: "97123456" }), /rejected the API key/); } finally { restore2(); if (saved) process.env.USPTO_TSDR_API_KEY = saved; else delete process.env.USPTO_TSDR_API_KEY; }
});

test("429 and timeouts give clear messages", async () => {
  let restore = mockFetch(async () => ({ ok: false, status: 429, headers: new Map([["retry-after", "30"]]) }));
  process.env.NO_RETRY_429 = "1";
  try { await assert.rejects(request("USPTO", "https://x"), /rate limit reached; retry after 30 s/); } finally { restore(); delete process.env.NO_RETRY_429; }
  restore = mockFetch(async () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; });
  try { await assert.rejects(request("USPTO", "https://x"), /timed out after 20 s/); } finally { restore(); }
});

// Patent fixtures trimmed from live ODP responses (Oct 2026).
const ODP_APP = { applicationNumberText: "16568903", applicationMetaData: { inventionTitle: "REPOSITIONING WIRES AND METHODS", applicationTypeLabelName: "Utility", applicationStatusDescriptionText: "Patented Case", filingDate: "2019-09-12", patentNumber: "11000000", grantDate: "2021-05-11", earliestPublicationNumber: "US20200085571A1", firstApplicantName: "4C MEDICAL TECHNOLOGIES, INC.", examinerNameText: "SCHERBEL, TODD J", groupArtUnitNumber: "3771", inventorBag: [{ inventorNameText: "A. Inventor", correspondenceAddressBag: [{ cityName: "Somewhere" }] }], cpcClassificationBag: ["A61F   2/243"] }, assignmentBag: [{ assignmentRecordedDate: "2021-02-05", conveyanceText: "ASSIGNMENT OF ASSIGNOR'S INTEREST", reelAndFrameNumber: "055164/0797", assigneeBag: [{ assigneeNameText: "4C MEDICAL TECHNOLOGIES, INC" }] }], parentContinuityBag: [{ parentApplicationNumberText: "62731230", claimParentageTypeCodeDescriptionText: "Claims priority from a provisional application", parentApplicationFilingDate: "2018-09-14", parentApplicationStatusDescriptionText: "Provisional Application Expired" }], patentTermAdjustmentData: { adjustmentTotalQuantity: 0 }, eventDataBag: [{ eventDate: "2024-10-30", eventDescriptionText: "Payment of Maintenance Fee, 4th Yr, Small Entity" }] };

test("patent query builder escapes input, ANDs words and validates", () => {
  assert.equal(buildPatentQuery({ keywords: "spectral  sensor", cpc: "g01j", grantedOnly: true, filedFrom: "2022-01-01" }),
    "applicationMetaData.inventionTitle:(spectral AND sensor) AND applicationMetaData.cpcClassificationBag:G01J* AND applicationMetaData.filingDate:[2022-01-01 TO 2999-12-31] AND applicationMetaData.patentNumber:*");
  assert.equal(esc("a:b(c)"), "a\\:b\\(c\\)");
  assert.throws(() => buildPatentQuery({}), /at least one/);
  assert.throws(() => buildPatentQuery({ keywords: "x", filedFrom: "2022/01/01" }), /YYYY-MM-DD/);
  assert.throws(() => buildPatentQuery({ cpc: "not a class" }), /cpc must look like/);
});

test("patent records normalize; inventor addresses are dropped", () => {
  const a = normalizeApplication(ODP_APP);
  assert.equal(a.patentNumber, "11000000");
  assert.deepEqual(a.inventors, ["A. Inventor"]);
  assert.deepEqual(a.cpc, ["A61F 2/243"]);
  assert.ok(!JSON.stringify(a).includes("Somewhere"));
  const d = normalizeDetails(ODP_APP);
  assert.deepEqual(d.assignments[0].assignees, ["4C MEDICAL TECHNOLOGIES, INC"]);
  assert.equal(d.parents[0].application, "62731230");
  assert.equal(d.recentEvents[0].event, "Payment of Maintenance Fee, 4th Yr, Small Entity");
  assert.equal(normalizeDetails({}), null);
});

test("patent tools without USPTO_API_KEY give a setup message and make no call", async () => {
  const saved = process.env.USPTO_API_KEY;
  delete process.env.USPTO_API_KEY;
  let called = false;
  const restore = mockFetch(async () => { called = true; return ok({}); });
  try {
    await assert.rejects(patentSearch({ keywords: "x" }), /USPTO_API_KEY/);
    await assert.rejects(patentDetails({ number: "16568903" }), /USPTO_API_KEY/);
    assert.equal(called, false);
    assert.match(status().patents, /missing USPTO_API_KEY/);
  } finally { restore(); if (saved) process.env.USPTO_API_KEY = saved; }
});

test("patent_details resolves patent and application numbers; 404 means not found; key sent in header", async () => {
  const saved = process.env.USPTO_API_KEY;
  process.env.USPTO_API_KEY = "test-key";
  const calls = [];
  const restore = mockFetch(async (u, init) => {
    const url = decodeURIComponent(String(u)); calls.push(url);
    assert.equal(init.headers["X-API-KEY"], "test-key");
    if (url.includes("/search?q=applicationMetaData.patentNumber:11000000")) return ok({ count: 1, patentFileWrapperDataBag: [ODP_APP] });
    if (url.endsWith("/16568903")) return ok({ count: 1, patentFileWrapperDataBag: [ODP_APP] });
    return ok({ code: "404", message: "Not Found" }, 404);
  });
  try {
    assert.equal((await patentDetails({ number: "US11000000B2" })).applicationNumber, "16568903");
    assert.equal((await patentDetails({ number: "11,000,000" })).patentNumber, "11000000");
    assert.equal((await patentDetails({ number: "16/568,903" })).patentNumber, "11000000");
    assert.match((await patentDetails({ number: "99999999" })).error, /No USPTO application or patent/);
    const empty = await patentSearch({ keywords: "zzqx" });
    assert.equal(empty.total, 0);
    assert.deepEqual(empty.results, []);
    await assert.rejects(patentDetails({ number: "11000000", type: "both" }), /type must be/);
  } finally { restore(); if (saved) process.env.USPTO_API_KEY = saved; else delete process.env.USPTO_API_KEY; }
  const restore2 = mockFetch(async () => ok({ message: "Forbidden" }, 403));
  process.env.USPTO_API_KEY = "bad";
  try { await assert.rejects(patentSearch({ keywords: "x" }), /rejected the API key/); } finally { restore2(); if (saved) process.env.USPTO_API_KEY = saved; else delete process.env.USPTO_API_KEY; }
});

test("429 is retried once, then succeeds", async () => {
  let n = 0;
  const restore = mockFetch(async () => (++n === 1 ? { ok: false, status: 429, headers: new Map([["retry-after", "0"]]) } : ok({ fine: true })));
  try { const r = await request("USPTO", "https://x"); assert.equal(r.status, 200); assert.equal(n, 2); } finally { restore(); }
});

test("Google Patents links use the verified formats", () => {
  assert.equal(googlePatentsSearchUrl({ keywords: "spectral sensor", applicant: "Qualcomm", filedFrom: "2022-01-01", grantedOnly: true }),
    "https://patents.google.com/?q=(spectral)&q=(sensor)&assignee=Qualcomm&country=US&after=filing:20220101&status=GRANT");
  assert.equal(googlePatentsPageUrl("11000000"), "https://patents.google.com/patent/US11000000");
  assert.equal(googlePatentsPageUrl(null, "US20200085571A1"), "https://patents.google.com/patent/US20200085571A1");
  assert.equal(googlePatentsPageUrl(null, null), null);
  assert.equal(normalizeApplication(ODP_APP).googlePatentsUrl, "https://patents.google.com/patent/US11000000");
});

import { currentOwner } from "../src/trademarks.js";
test("TSDR current owner is the latest owner role", () => {
  assert.equal(currentOwner([{ name: "A", role: "ORIGINAL APPLICANT" }, { name: "A", role: "ORIGINAL REGISTRANT" }, { name: "B", role: "SUBSEQUENT OWNER AFTER REGISTRATION" }]), "B");
  assert.equal(currentOwner([{ name: "A", role: "ORIGINAL APPLICANT" }]), "A");
  assert.equal(currentOwner([]), null);
});

test("edge cases: operator words, kind codes, publication numbers, class strings", async () => {
  assert.equal(buildPatentQuery({ keywords: "laser AND" }), "applicationMetaData.inventionTitle:(laser)");
  assert.match(buildPatentQuery({ keywords: "a>b" }), /a\\>b/);
  assert.throws(() => buildPatentQuery({ keywords: "OR NOT" }), /at least one/);
  assert.deepEqual(normalizeClasses("9, 42"), ["009", "042"]);
  assert.deepEqual(normalizeClasses("Class 9"), ["009"]);
  const saved = process.env.USPTO_API_KEY; process.env.USPTO_API_KEY = "test";
  const urls = [];
  const restore = mockFetch(async (u) => { urls.push(decodeURIComponent(String(u))); return ok({ count: 1, patentFileWrapperDataBag: [{ applicationNumberText: "16568903", applicationMetaData: { patentNumber: "11000000" } }] }); });
  try {
    const r = await patentDetails({ number: "US 2020/0085571 A1" });
    assert.equal(r.patentNumber, "11000000");
    assert.match(urls[0], /earliestPublicationNumber:US20200085571\*/);
    urls.length = 0;
    await patentDetails({ number: "US D900,000 S" });
    assert.match(urls[0], /patentNumber:D900000(&|$)/);
    urls.length = 0;
    await patentDetails({ number: "RE48000E" });
    assert.match(urls[0], /patentNumber:RE48000(&|$)/);
  } finally { restore(); if (saved) process.env.USPTO_API_KEY = saved; else delete process.env.USPTO_API_KEY; }
});
