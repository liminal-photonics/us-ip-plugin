// USPTO Open Data Portal (ODP) patent file wrapper API. Needs a free USPTO ODP API key (USPTO_API_KEY).
// Docs: https://data.uspto.gov/apis/patent-file-wrapper/search
import { request, requireText, clampLimit } from "./http.js";
const BASE = process.env.USPTO_ODP_API_BASE || "https://api.uspto.gov/api/v1/patent/applications";
const MD = "applicationMetaData";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const odpKey = () => process.env.USPTO_API_KEY || "";
export const odpConfigured = () => Boolean(odpKey());
const NO_KEY = "Patent tools need a free USPTO Open Data Portal API key: set USPTO_API_KEY (see README).";

// Escape Lucene special characters in user words.
export const esc = (s) => String(s).replace(/([+\-!(){}[\]^"~*?:\\/&|<>=])/g, "\\$1");
// Upper-case AND, OR, NOT and TO are Lucene operators; every word is already ANDed, so drop them ("laser AND" -> laser).
const words = (s) => String(s).trim().split(/\s+/).filter((w) => w && !/^(AND|OR|NOT|TO|&&|\|\|)$/.test(w)).map(esc);

export function buildPatentQuery({ keywords, applicant, cpc, filedFrom, filedTo, grantedOnly } = {}) {
  const parts = [];
  const kw = typeof keywords === "string" ? words(keywords) : [];
  if (kw.length) parts.push(`${MD}.inventionTitle:(${kw.join(" AND ")})`);
  const ap = typeof applicant === "string" ? words(applicant) : [];
  if (ap.length) parts.push(`${MD}.firstApplicantName:(${ap.join(" AND ")})`);
  if (cpc) {
    const c = String(cpc).toUpperCase().replace(/\s+/g, "");
    if (!/^[A-HY]\d{0,2}[A-Z]?(\d{1,4}(\/\d{1,6})?)?$/.test(c)) throw new Error('cpc must look like "G01J" or "G01J3/28".');
    // ODP stores CPC symbols with the main group right-aligned in 4 characters: "G01J   3/28", "G01N  21/31", "G06F2203/04107".
    const g = c.match(/^([A-HY]\d\d[A-Z])(\d{1,4})(?:\/(\d*))?$/);
    const stored = g ? `${g[1]}${g[2].padStart(4, " ")}/${g[3] || ""}` : c;
    parts.push(`${MD}.cpcClassificationBag:${esc(stored).replace(/ /g, "\\ ")}*`);
  }
  for (const d of [filedFrom, filedTo]) if (d && !DATE.test(d)) throw new Error("Dates must be YYYY-MM-DD.");
  if (filedFrom || filedTo) parts.push(`${MD}.filingDate:[${filedFrom || "1790-01-01"} TO ${filedTo || "2999-12-31"}]`);
  if (grantedOnly) parts.push(`${MD}.patentNumber:*`);
  if (!kw.length && !ap.length && !cpc) throw new Error("Give at least one of keywords, applicant or cpc.");
  return parts.join(" AND ");
}

async function odp(path, params) {
  if (!odpConfigured()) throw new Error(NO_KEY);
  const url = `${BASE}${path}${params ? `?${new URLSearchParams(params)}` : ""}`;
  const res = await request("USPTO patents", url, { headers: { "X-API-KEY": odpKey(), Accept: "application/json" } });
  if (res.status === 401 || res.status === 403) throw new Error("USPTO Open Data Portal rejected the API key (HTTP 401/403). Check USPTO_API_KEY.");
  if (res.status === 404) return null; // ODP returns 404 for "no matching records"
  if (!res.ok) throw new Error(`USPTO patents HTTP ${res.status}`);
  return res.json();
}

export function normalizeApplication(r) {
  const m = r?.[MD] || {};
  return {
    applicationNumber: r?.applicationNumberText || null,
    title: m.inventionTitle || null,
    type: m.applicationTypeLabelName || null,
    status: m.applicationStatusDescriptionText || null,
    statusDate: m.applicationStatusDate || null,
    filed: m.filingDate || null,
    effectiveFiled: m.effectiveFilingDate || null,
    patentNumber: m.patentNumber || null,
    granted: m.grantDate || null,
    publicationNumber: m.earliestPublicationNumber || null,
    published: m.earliestPublicationDate || null,
    applicant: m.firstApplicantName || null,
    inventors: (m.inventorBag || []).map((i) => i.inventorNameText).filter(Boolean), // names only, no addresses
    cpc: (m.cpcClassificationBag || []).map((c) => c.replace(/\s+/g, " ").trim()),
    url: r?.applicationNumberText ? `https://patentcenter.uspto.gov/applications/${r.applicationNumberText}` : null,
    googlePatentsUrl: googlePatentsPageUrl(m.patentNumber, m.earliestPublicationNumber),
  };
}

export function normalizeDetails(r) {
  const base = normalizeApplication(r);
  if (!base.applicationNumber) return null;
  return {
    ...base,
    examiner: r[MD]?.examinerNameText || null,
    artUnit: r[MD]?.groupArtUnitNumber || null,
    entityStatus: r[MD]?.entityStatusData?.businessEntityStatusCategory || null,
    assignments: (r.assignmentBag || []).slice(0, 10).map((a) => ({
      recorded: a.assignmentRecordedDate || null,
      conveyance: a.conveyanceText || null,
      assignees: (a.assigneeBag || []).map((x) => x.assigneeNameText).filter(Boolean),
      reelFrame: a.reelAndFrameNumber || null,
    })),
    parents: (r.parentContinuityBag || []).map((p) => ({ application: p.parentApplicationNumberText, relation: p.claimParentageTypeCodeDescriptionText, filed: p.parentApplicationFilingDate, status: p.parentApplicationStatusDescriptionText })),
    children: (r.childContinuityBag || []).map((c) => ({ application: c.childApplicationNumberText, relation: c.claimParentageTypeCodeDescriptionText })),
    patentTermAdjustmentDays: r.patentTermAdjustmentData?.adjustmentTotalQuantity ?? null,
    recentEvents: (r.eventDataBag || []).slice(0, 10).map((e) => ({ date: e.eventDate, event: e.eventDescriptionText })),
    grantXml: r.grantDocumentMetaData?.fileLocationURI || null,
  };
}

// Google Patents links (links only, nothing is fetched). Verified formats, Oct 2026:
//   https://patents.google.com/?q=(spectral)&q=(sensor)&assignee=X&country=US&after=filing:20220101&before=filing:20261231&status=GRANT
//   https://patents.google.com/patent/US11000000 (resolves to the B1/B2 page) and /patent/US20200085571A1
export function googlePatentsSearchUrl({ keywords, applicant, cpc, filedFrom, filedTo, grantedOnly } = {}) {
  const q = new URLSearchParams();
  for (const w of String(keywords || "").trim().split(/\s+/).filter(Boolean)) q.append("q", `(${w})`);
  if (applicant && String(applicant).trim()) q.set("assignee", String(applicant).trim());
  if (cpc && String(cpc).trim()) q.set("cpc", String(cpc).trim().toUpperCase().replace(/\s+/g, ""));
  q.set("country", "US");
  if (filedFrom) q.set("after", `filing:${filedFrom.replace(/-/g, "")}`);
  if (filedTo) q.set("before", `filing:${filedTo.replace(/-/g, "")}`);
  if (grantedOnly) q.set("status", "GRANT");
  return `https://patents.google.com/?${q.toString().replace(/%28/g, "(").replace(/%29/g, ")").replace(/%3A/g, ":")}`;
}

export function googlePatentsPageUrl(patentNumber, publicationNumber) {
  if (patentNumber) return `https://patents.google.com/patent/US${String(patentNumber).replace(/[^0-9A-Z]/gi, "")}`;
  if (publicationNumber) return `https://patents.google.com/patent/${String(publicationNumber).replace(/[^0-9A-Z]/gi, "")}`;
  return null;
}

const DISCLAIMER = "Search of USPTO application records (titles, applicants, classifications), not full text or claims. Not legal advice, not a patentability opinion and not a freedom-to-operate analysis.";

export async function patentSearch({ keywords, applicant, cpc, filedFrom, filedTo, grantedOnly = false, limit, offset } = {}) {
  const q = buildPatentQuery({ keywords, applicant, cpc, filedFrom, filedTo, grantedOnly });
  const d = await odp("/search", { q, limit: String(clampLimit(limit, 10, 50)), offset: String(Math.max(0, Math.floor(Number(offset)) || 0)), sort: `${MD}.filingDate desc` });
  return {
    query: q, total: d?.count ?? 0, results: (d?.patentFileWrapperDataBag || []).map(normalizeApplication),
    googlePatentsSearchUrl: googlePatentsSearchUrl({ keywords, applicant, cpc, filedFrom, filedTo, grantedOnly }),
    googlePatentsNote: "Convenience link to continue on Google Patents. Google searches full text, so its results differ from this USPTO title search; it does not verify these results. The USPTO records above are the source of record.",
    disclaimer: DISCLAIMER,
  };
}

// number: an application number (16568903, 16/568,903, PCTUS2025057318) or a patent number (11,000,000, US11000000B2).
// type: "application", "patent" or "auto" (default). In auto mode a bare 8-digit number can be either, so both are
// checked; a patent-number match wins and the note says so.
export async function patentDetails({ number, type = "auto" } = {}) {
  const raw = requireText(number, "number").toUpperCase();
  if (!["auto", "application", "patent"].includes(type)) throw new Error('type must be "auto", "application" or "patent".');
  const compact = raw.replace(/[^0-9A-Z]/g, "").replace(/^US/, "");
  // Pre-grant publication: 2020/0085571, US20200085571A1, US 2020 0085571 A1 (year + 7 digits, optional kind code)
  const pub = compact.match(/^((?:19|20)\d{2})(\d{7})(A\d|B\d)?$/);
  if (pub && type !== "application" && type !== "patent") {
    const s = await odp("/search", { q: `${MD}.earliestPublicationNumber:${esc(`US${pub[1]}${pub[2]}`)}*`, limit: "1" });
    const app = s?.patentFileWrapperDataBag?.[0]?.applicationNumberText;
    const rec = app ? (await odp(`/${encodeURIComponent(app)}`))?.patentFileWrapperDataBag?.[0] : null;
    if (!rec) return { number: raw, error: "No USPTO application found for that publication number (only the earliest publication of each application is indexed)." };
    return { ...normalizeDetails(rec), disclaimer: DISCLAIMER };
  }
  // drop a trailing kind code: B1/B2 utility, S/S1 design, E/E1 reissue, P2/P3 plant, A1/A2 publication
  const digits = compact.replace(/^((?:RE|D|PP|H)?\d{5,8})(?:A\d|B\d|S1?|E1?|P\d|H1?)$/, "$1");
  if (!digits) throw new Error("number must be an application or patent number.");
  const appStyle = /\//.test(raw) || /^PCT/.test(digits);
  const patStyle = /^US/.test(raw) || /^\d{1,2},\d{3},\d{3}$/.test(raw) || /^(RE|D|PP)\d+$/.test(digits);
  const getApp = async (n) => (await odp(`/${encodeURIComponent(n)}`))?.patentFileWrapperDataBag?.[0] || null;
  const byPatent = async () => {
    if (!/^(RE|D|PP)?\d{5,8}$/.test(digits)) return null;
    const s = await odp("/search", { q: `${MD}.patentNumber:${esc(digits)}`, limit: "1" });
    const app = s?.patentFileWrapperDataBag?.[0]?.applicationNumberText;
    return app ? getApp(app) : null;
  };
  let rec = null, note = null;
  if (type === "patent" || (type === "auto" && patStyle)) rec = await byPatent();
  else if (type === "application" || (type === "auto" && appStyle)) rec = await getApp(digits);
  else {
    const p = await byPatent(); // sequential, to stay under ODP burst limits
    const a = /^\d{8}$/.test(digits) ? await getApp(digits) : null;
    rec = p || a;
    if (p && a && p.applicationNumberText !== a.applicationNumberText) note = `"${raw}" is also application number ${digits}; showing patent ${digits}. Pass type "application" for the other record.`;
  }
  if (!rec) return { number: raw, error: "No USPTO application or patent found for that number." };
  return { ...normalizeDetails(rec), ...(note ? { note } : {}), disclaimer: DISCLAIMER };
}
