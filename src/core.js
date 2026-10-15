import { tsdrConfigured } from "./trademarks.js";
import { odpConfigured } from "./patents.js";

export function status() {
  return {
    trademarkSearch: "no key needed (public USPTO Trademark Search endpoint)",
    trademarkStatus: tsdrConfigured() ? "configured (USPTO_TSDR_API_KEY)" : "missing USPTO_TSDR_API_KEY; trademark_status is disabled",
    patents: odpConfigured() ? "configured (USPTO_API_KEY)" : "missing USPTO_API_KEY; patent_search and patent_details are disabled",
  };
}
