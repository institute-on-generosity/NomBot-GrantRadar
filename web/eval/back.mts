// "← Back to results" (Oct 29): the ?back= round trip from a search to an org, a memo or another org and back, and
// the no-context fallback (lib/back.ts). No server needed.
//   npm run test:back
const { safeBack, withBack, withFocus, einOf, backTarget, contextOf, CARRY_PATHS } = await import("../lib/back");

let fail = 0, pass = 0;
const check = (name: string, ok: boolean, detail = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  (${detail})` : ""}`); };

const search = "/?question=Youth+leadership+development+nonprofits+in+Inglewood%2C+CA%2C+ideally+focused+on+girls&only=focused-on-girls&st=CA";
// 1. Search -> org: the search page is its own context; the org link gets back=<search>&focus=<org>
const ctx = contextOf("/", search.slice(1));
check("search page is the context", ctx === search, String(ctx));
check("focus from a previous visit is dropped", contextOf("/", "?question=x&focus=12-3456789") === "/?question=x");
const orgHref = withBack("/org/95-4533883", withFocus(ctx!, einOf("/org/95-4533883")));
const orgBack = new URLSearchParams(orgHref.split("?")[1]).get("back");
check("org link carries the full search (query, place, preference chip)", !!orgBack && orgBack.includes("only=focused-on-girls") && orgBack.includes("st=CA") && orgBack.includes("question="), orgHref);
check("org link carries focus", new URLSearchParams(orgBack!.slice(2)).get("focus") === "95-4533883");
// 2. Org -> memo -> another org: the context is the org page's own back=, passed on unchanged
const orgSearch = orgHref.slice(orgHref.indexOf("?"));
const ctx2 = contextOf("/org/95-4533883", orgSearch);
check("org page context is its back=", ctx2 === orgBack, String(ctx2));
const memoHref = withBack("/memo/org/954533883", ctx2);
const ctx3 = contextOf("/memo/org/954533883", memoHref.slice(memoHref.indexOf("?")));
check("memo keeps the search", ctx3 === orgBack);
const org2 = withBack("/org/12-3456789", contextOf("/org/95-4533883", orgSearch));
check("org -> another org keeps the search", contextOf("/org/12-3456789", org2.slice(org2.indexOf("?"))) === orgBack);
// The first org opened stays the focus across hops (org A -> org B -> Back scrolls to A)
const viaA = withFocus(orgBack!, "12-3456789");
check("withFocus replaces, the carrier keeps the first", new URLSearchParams(viaA.slice(2)).get("focus") === "12-3456789");
check("a link that already has back= is left alone", withBack(orgHref, "/?question=other") === orgHref);
check("hash kept after back=", withBack("/org/1#funding", "/?question=x") === "/org/1?back=%2F%3Fquestion%3Dx#funding");
// 3. Back: to the results, labeled, focused
const t = backTarget(ctx3);
check("Back goes to the results", t.href === orgBack && t.label === "← Back to results", JSON.stringify(t));
check("Starred", backTarget("/saved").label === "← Back to Starred");
// 4. No context: home search, never off the site
check("no back: home, plain label", JSON.stringify(backTarget(null)) === JSON.stringify({ href: "/", label: "← Back" }));
check("memo fallback: its org page", backTarget(undefined, "/org/95-4533883").href === "/org/95-4533883");
for (const bad of ["https://evil.example/?question=x", "//evil.example/?question=x", "/admin", "/?n=10", "javascript:alert(1)", "/org/1"]) check(`rejects ${bad}`, safeBack(bad) === null && backTarget(bad).href === "/");
check("direct link to an org has no context", contextOf("/org/95-4533883", "") === null);
// 5. Which links carry it
check("carry paths", ["/org/1", "/memo/org/1", "/compare?ein=1,2", "/source/soi/123456789?year=2023"].every((h) => CARRY_PATHS.test(h)) && !["/", "/research", "/report?question=x", "/api/memo/org/1/docx", "/organic"].some((h) => CARRY_PATHS.test(h)));
check("no semicolons or em dashes in labels", ["← Back to results", "← Back to Starred", "← Back"].every((x) => !/[;—]/.test(x)));

console.log(fail ? `\n${fail} failed, ${pass} passed` : `\nall ${pass} passed`);
process.exit(fail ? 1 : 0);
