#!/usr/bin/env python3
"""Nightly research benchmark against the LIVE public API (runs on the Linux helper, generosity-data docs/linux-helper.md).

The same 150 questions and grading as eval/benchmark.mts, but each question goes through GET /api/v1/answer?q=
on the public site instead of the engine in-process, so the helper needs only a read API key, not the app's
secrets. Grading is a port of benchmark.mts and eval/route.mts `check`: expected route (metric, source, filters,
cause), premise, broken numbers, gap honesty, and the direct-SQL checks (run over the helper's read-only DB role;
skipped when that role isn't configured). No LLM judge.

  python nightly_benchmark.py                 # all questions, writes ~/iog-qa/benchmark.json + history
  python nightly_benchmark.py --only T01,C04  # a few, nothing saved to history

Files (all in ~/iog-qa unless set):
  benchmark-questions.json  copy of NomBot web/eval/benchmark-questions.json
  ~/.config/iog-host/benchmark-key.txt   API key named "benchmark" (read scope, chmod 600, never printed)
  benchmark.json            last run: score, statuses, newly failing vs the previous night, token cost, per question
  benchmark-history.jsonl   one line per full run (date, score, misleading, statuses, tokens, cost)
Sends X-App: nightly-benchmark, so /admin keeps these calls out of its usage charts. The router reads each new
question with one Claude call on the app's key (cached 24 h); the API returns that call's tokens to this client.
"""
import concurrent.futures as cf
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HOME = os.path.expanduser("~")
QA = os.environ.get("IOG_QA", os.path.join(HOME, "iog-qa"))
BASE = os.environ.get("BENCH_BASE", "https://thes-macbook-air.tail3090cf.ts.net")
KEY_FILE = os.path.join(HOME, ".config", "iog-host", "benchmark-key.txt")
DB_ENV = os.path.join(HOME, ".config", "iog-host", "helper-db.env")
QUESTIONS = os.path.join(QA, "benchmark-questions.json")
OUT = os.path.join(QA, "benchmark.json")
HISTORY = os.path.join(QA, "benchmark-history.jsonl")
PARALLEL = 4
# claude-sonnet-5-5 (the router's FAST_MODEL), $ per million tokens: input, output, cache read, 5-minute cache write
PRICE = {"input": 2.0, "output": 10.0, "cache_read": 0.20, "cache_write": 2.50}
STATUSES = ["ok", "partial", "unanswerable", "wrong route", "misleading"]

STATES = [("AL", "Alabama"), ("AK", "Alaska"), ("AZ", "Arizona"), ("AR", "Arkansas"), ("CA", "California"), ("CO", "Colorado"),
          ("CT", "Connecticut"), ("DE", "Delaware"), ("DC", "District of Columbia"), ("FL", "Florida"), ("GA", "Georgia"),
          ("HI", "Hawaii"), ("ID", "Idaho"), ("IL", "Illinois"), ("IN", "Indiana"), ("IA", "Iowa"), ("KS", "Kansas"),
          ("KY", "Kentucky"), ("LA", "Louisiana"), ("ME", "Maine"), ("MD", "Maryland"), ("MA", "Massachusetts"),
          ("MI", "Michigan"), ("MN", "Minnesota"), ("MS", "Mississippi"), ("MO", "Missouri"), ("MT", "Montana"),
          ("NE", "Nebraska"), ("NV", "Nevada"), ("NH", "New Hampshire"), ("NJ", "New Jersey"), ("NM", "New Mexico"),
          ("NY", "New York"), ("NC", "North Carolina"), ("ND", "North Dakota"), ("OH", "Ohio"), ("OK", "Oklahoma"),
          ("OR", "Oregon"), ("PA", "Pennsylvania"), ("RI", "Rhode Island"), ("SC", "South Carolina"), ("SD", "South Dakota"),
          ("TN", "Tennessee"), ("TX", "Texas"), ("UT", "Utah"), ("VT", "Vermont"), ("VA", "Virginia"), ("WA", "Washington"),
          ("WV", "West Virginia"), ("WI", "Wisconsin"), ("WY", "Wyoming"), ("PR", "Puerto Rico")]
STATE_BY_NAME = {n.lower(): c for c, n in STATES}


# ------------------------------------------------------------------ route check (eval/route.mts check)
def route_check(e, s):
    bad = []
    if e.get("research", True) is not True:
        return ["research true, want false"]
    c0 = (s.get("causes") or [None])[0] or {}
    if e.get("metric") and s.get("metric") not in e["metric"]:
        bad.append(f"metric {s.get('metric')}, want {'|'.join(e['metric'])}")
    if e.get("source") and s.get("source") != e["source"]:
        bad.append(f"source {s.get('source')}, want {e['source']}")
    if e.get("by") and (s.get("by") or "") not in e["by"]:
        bad.append(f"by {s.get('by')}, want {'|'.join(e['by'])}")
    for k in ["charityFunder", "funderType", "recipientKind", "condition", "area", "order", "measure", "premise",
              "perResident", "perPoverty", "yearFrom", "yearTo", "region", "topN", "streak"]:
        if k in e and s.get(k) != e[k]:
            bad.append(f"{k} {s.get(k)}, want {e[k]}")
    if e.get("label") and c0.get("label") != e["label"]:
        bad.append(f"label {c0.get('label')}, want {e['label']}")
    if e.get("ntee") and not any(n.startswith(e["ntee"]) or e["ntee"].startswith(n) for n in (c0.get("ntee") or [])):
        bad.append(f"ntee {'+'.join(c0.get('ntee') or [])}, want {e['ntee']}")
    if e.get("missing") and e["missing"] not in (s.get("missing") or []):
        bad.append(f"missing {'+'.join(s.get('missing') or [])}, want {e['missing']}")
    if e.get("states") and not all(x in (s.get("states") or []) for x in e["states"]):
        bad.append(f"states {','.join(s.get('states') or [])}, want {','.join(e['states'])}")
    if e.get("funderSizeMin") and (s.get("funderSize") or {}).get("min") != e["funderSizeMin"]:
        bad.append(f"funderSize.min {(s.get('funderSize') or {}).get('min')}, want {e['funderSizeMin']}")
    if e.get("recipientSizeMax") and (s.get("recipientSize") or {}).get("max") != e["recipientSizeMax"]:
        bad.append(f"recipientSize.max {(s.get('recipientSize') or {}).get('max')}, want {e['recipientSizeMax']}")
    return bad


# ------------------------------------------------------------------ direct SQL checks (benchmark.mts runCheck)
UNIT = {"K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}


def first_money(s):
    m = re.search(r"\$([\d,]+(?:\.(\d+))?)\s*([KMBT])?\b", s)
    if not m:
        return None
    unit, dec = UNIT.get(m.group(3) or "", 1), len(m.group(2) or "")
    v = float(m.group(1).replace(",", "")) * unit
    return v, (0.5 * 10 ** -dec * unit) / v + 0.01 if v else 0.01


def headline_years(s):
    r = re.search(r"\b(20\d\d)[–-](\d{2,4})\b", s)
    if r:
        a, b = int(r.group(1)), r.group(2)
        return a, 2000 + int(b) if len(b) == 2 else int(b)
    y = re.search(r"\bin (20\d\d)\b", s)
    return (int(y.group(1)), int(y.group(1))) if y else (2022, 2024)


def plain_spec(s, c):
    causes = s.get("causes") or []
    c0 = causes[0] if causes else {}
    return (s.get("source") == "foundation_grants" and not s.get("states") and not s.get("county") and not s.get("area")
            and not s.get("funderType") and not s.get("funderSize") and not s.get("recipientSize") and not s.get("recipientKind")
            and not s.get("perResident") and not s.get("perPoverty") and len(causes) <= 1 and not c0.get("label")
            and not c0.get("keywords") and (c0.get("ntee") or []) == (c.get("ntee") or []))


def named_state(headline):
    h = headline.lower()
    hits = sorted([n for n in STATE_BY_NAME if h.startswith(n)], key=len, reverse=True)
    return hits[0] if hits else None


def run_check(db, c, a):
    if db is None:
        return None, "check skipped: no database access on this machine"
    spec, head = a.get("spec") or {}, a.get("headline") or ""
    if c["kind"] == "hh_top_state":
        if spec.get("source") != "household_giving" or spec.get("perResident") or spec.get("states"):
            return None, "check skipped: not a plain household by-state answer"
        named = named_state(head)
        yrs = re.findall(r"\b(20\d\d)\b", head)
        yr = int(yrs[-1]) if yrs else 2023
        r = db("SELECT state, sum(charity_usd)::float8 FROM soi_individual_county WHERE level = 'state' AND tax_year = %s GROUP BY 1 ORDER BY 2 DESC LIMIT 1", [yr])
        st, usd = r[0] if r else (None, 0.0)
        m = first_money(head)
        amt_ok = bool(m) and usd and abs(m[0] - usd) / usd <= m[1]
        note = f"headline {named or '?'}{f' ${m[0] / 1e9:.1f}B' if m else ''} vs SQL {st} ${usd / 1e9:.1f}B ({yr})"
        return bool(named) and STATE_BY_NAME.get(named) == st and bool(amt_ok), note
    if not plain_spec(spec, c):
        return None, "check skipped: spec has filters beyond the check"
    ntee = c.get("ntee") or []
    where, params = ("recipient_ntee LIKE ANY(%s::text[])", [[f"{n}%" for n in ntee]]) if ntee else ("TRUE", [])
    if c["kind"] == "fdn_total":
        m = first_money(head)
        if not m:
            return None, "check skipped: no $ in headline"
        y0, y1 = headline_years(head)
        usd = db(f"SELECT coalesce(sum(amount),0)::float8 FROM grant_clean WHERE tax_year BETWEEN {y0} AND {y1} AND {where}", params)[0][0]
        d = abs(m[0] - usd) / max(1, usd)
        return d <= m[1], f"headline ${m[0] / 1e6:.1f}M vs SQL ${usd / 1e6:.1f}M ({d * 100:.1f}% off, {y0}-{y1})"
    if c["kind"] == "fdn_trend":
        t = re.search(r"\b(grew|rose|increased|fell|dropped|declined|shrank|decreased)\s+(?:by\s+)?([\d.]+)%(?:\s*\([^)]*\))?\s+from (20\d\d) to (20\d\d)", head, re.I)
        if not t:
            return None, "check skipped: no % change in headline"
        sign = 1 if re.match(r"grew|rose|increased", t.group(1), re.I) else -1
        pct, y0, y1 = sign * float(t.group(2)), int(t.group(3)), int(t.group(4))
        by = dict(db(f"SELECT tax_year, sum(amount)::float8 FROM grant_clean WHERE tax_year IN ({y0}, {y1}) AND {where} GROUP BY 1", params))
        if not by.get(y0) or y1 not in by:
            return False, f"headline {pct}% but SQL has no total for {y0} or {y1}"
        sql = (by[y1] / by[y0] - 1) * 100
        dec = len(t.group(2).split(".")[1]) if "." in t.group(2) else 0
        return abs(sql - pct) <= 0.5 * 10 ** -dec + 0.5, f"headline {pct}% vs SQL {sql:.2f}% ({y0}->{y1})"
    named = named_state(head)
    if not named:
        return None, "check skipped: headline doesn't start with a state"
    y0, y1 = headline_years(head)
    r = db(f"SELECT recipient_state, sum(amount)::float8 FROM grant_clean WHERE tax_year BETWEEN {y0} AND {y1} AND {where} AND recipient_state IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 1", params)
    st, usd = r[0] if r else (None, 0.0)
    m = first_money(head)
    amt_ok = not m or (usd and abs(m[0] - usd) / usd <= m[1])
    return STATE_BY_NAME.get(named) == st and bool(amt_ok), f"headline {named}{f' ${m[0] / 1e6:.1f}M' if m else ''} vs SQL {st} ${usd / 1e6:.1f}M"


# ------------------------------------------------------------------ gap detection (benchmark.mts gapFlagged)
GENERIC_GAP = re.compile(r"isn't in our|aren't in our|not in our (irs )?data|can't (be )?answer|cannot|don't have|no data|not loaded|aren't loaded|isn't loaded|not available", re.I)
GAP_TEXT = {
    "history_pre2022": re.compile(r"(before|prior to|earlier than) 2022|pre-2022|starts? (in )?2022|(only|just) (from |covers? )?20(22|23)|from 2022 on", re.I),
    "inflation": re.compile(r"inflation|real dollars|constant dollars|\bCPI\b|nominal", re.I),
    "household_giving": re.compile(r"individual|household|itemiz", re.I),
    "corporate_direct": re.compile(r"corporate giving outside|direct corporate|only company foundations", re.I),
    "external_benchmarks": re.compile(r"Giving USA|GDP", re.I),
    "international": re.compile(r"foreign|abroad|other countries|international", re.I),
    "service_area": re.compile(r"headquarter|where (they|it) (serve|work)|service area|mailing address|filing address", re.I),
}


def gap_flagged(cap, a):
    if a.get("status") == "unanswerable" or a.get("missing"):
        return True
    text = " ".join([a.get("headline") or "", a.get("what_counts") or "", *(a.get("caveats") or []), *(a.get("bullets") or [])])
    if GENERIC_GAP.search(a.get("headline") or ""):
        return True
    return any((a.get("basis") is not None) if c.startswith("cause_label:") else bool(GAP_TEXT.get(c) and GAP_TEXT[c].search(text)) for c in cap)


# ------------------------------------------------------------------ one question
def spec_txt(sp):
    causes = ",".join(c.get("label") or ("+".join(c.get("ntee") or []) or f"kw:{'+'.join(c.get('keywords') or [])}") for c in sp.get("causes") or []) or "all"
    parts = [f"{sp.get('metric')}/{sp.get('source')}"]
    for k, fmt in [("by", "/by {}"), ("charityFunder", "/{}"), ("funderType", "/{}"), ("recipientKind", "/{}")]:
        if sp.get(k):
            parts.append(fmt.format(sp[k]))
    parts.append(f"/{causes}")
    if sp.get("states"):
        parts.append(f"/{','.join(sp['states'])}")
    if sp.get("missing"):
        parts.append(f" missing:{','.join(sp['missing'])}")
    return "".join(parts)


def call_api(key, q):
    url = f"{BASE}/api/v1/answer?q={urllib.parse.quote(q)}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {key}", "X-App": "nightly-benchmark", "User-Agent": "iog-nightly-benchmark/1"})
    last = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            if e.code not in (429, 500, 502, 503, 504):
                break
        except Exception as e:  # network: retry
            last = type(e).__name__
        time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"API call failed: {last}")


def run_one(b, key, db):
    gap = bool(b.get("capability"))
    res = {"id": b["id"], "cat": b["cat"], "q": b["q"], "capability": b.get("capability") or [], "status": "", "notes": [],
           "review": None, "checked": None, "gap_flagged": None, "spec": "", "headline": "", "engine": "", "ms": 0, "usage": None}
    e = dict(b.get("expect") or {})
    t0 = time.time()
    try:
        a = call_api(key, b["q"])
    except Exception as err:
        return {**res, "status": "unanswerable", "engine": "error", "notes": [str(err)[:200]], "review": "API call failed"}
    res["ms"] = int((time.time() - t0) * 1000)
    res["usage"] = (a.get("router") or {}).get("usage")
    if not a.get("research"):
        return {**res, "status": "wrong route", "notes": ["sent to org search"]}
    spec = a.get("spec") or {}
    res["spec"] = spec_txt(spec)
    bad = route_check(e, spec)
    if bad and not gap:
        return {**res, "status": "wrong route", "notes": bad}
    res["notes"] += [f"route: {x}" for x in bad]
    res["headline"], res["engine"] = a.get("headline") or "", a.get("status") or ""
    if a.get("status") == "unanswerable":
        return {**res, "status": "unanswerable", "gap_flagged": True if gap else None}
    mis = []
    nums = " ".join(str(n.get("value")) for n in a.get("numbers") or [])
    if re.search(r"NaN|undefined|Infinity|\bnull\b", res["headline"] + nums):
        mis.append(f"broken number: {res['headline']}")
    if "premiseHolds" in e:
        corrected = bool(re.match(r"^[^.]* didn't (rise|fall|get more|get less)\b", res["headline"]))
        holds = (a.get("premise") or {}).get("holds")
        if holds != e["premiseHolds"] or corrected != (not e["premiseHolds"]):
            mis.append(f"premise {json.dumps(a.get('premise'))}, want holds {e['premiseHolds']}; headline {'corrects' if corrected else 'does not correct'} it")
    if b.get("check"):
        try:
            ok, note = run_check(db, b["check"], a)
        except Exception as err:
            ok, note = None, f"check skipped: SQL error {type(err).__name__}"
        res["notes"].append(note)
        res["checked"] = "skipped" if ok is None else "pass" if ok else "fail"
        if ok is False:
            mis.append(f"direct SQL disagrees: {note}")
    if gap:
        res["gap_flagged"] = gap_flagged(b["capability"], a)
        if not res["gap_flagged"]:
            mis.append(f"answered as if complete; no note that {', '.join(b['capability'])} is missing")
    if mis:
        return {**res, "status": "misleading", "notes": res["notes"] + mis, "review": "; ".join(mis)}
    if a.get("basis"):
        res["review"] = f"cause counted by {'keywords' if a['basis'] == 'keywords' else 'NTEE codes'}, not a graded label: check what the set catches"
    if gap or a.get("status") == "partial":
        if a.get("missing"):
            res["notes"].append("missing: " + ", ".join(m.get("what", "") for m in a["missing"]))
        return {**res, "status": "partial"}
    if b.get("check") and res["checked"] != "pass":
        res["review"] = res["review"] or "headline not verified by SQL"
    return {**res, "status": "ok"}


# ------------------------------------------------------------------ helpers
def read_env(path):
    out = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.removeprefix("export ").strip()] = v.strip().strip("'\"")
    return out


def connect_db():
    # Read-only helper role, for the direct-SQL checks only. Without it those checks are skipped.
    try:
        import psycopg
        e = read_env(DB_ENV)
        conn = psycopg.connect(host=e["HELPER_DB_HOST"], dbname=e["HELPER_DB_NAME"], user=e["HELPER_DB_USER"],
                               password=e["HELPER_DB_PASSWORD"], port=e.get("HELPER_DB_PORT", "5432"), connect_timeout=15,
                               application_name="nightly_benchmark", options="-c statement_timeout=120000 -c default_transaction_read_only=on", autocommit=True)
    except Exception as err:
        print(f"no DB for direct-SQL checks ({type(err).__name__}), skipping them", file=sys.stderr)
        return None, None
    import threading
    lock = threading.Lock()

    def q(sql, params=()):
        with lock:
            return conn.execute(sql, params).fetchall()
    return q, conn


def cost(usage_list):
    t = {"calls": len(usage_list), "input": 0, "output": 0, "cache_read": 0, "cache_write": 0}
    for u in usage_list:
        t["input"] += u.get("input", 0)
        t["output"] += u.get("output", 0)
        t["cache_read"] += u.get("cacheRead", 0)
        t["cache_write"] += u.get("cacheWrite", 0)
    uncached = t["input"] - t["cache_read"] - t["cache_write"]
    usd = (uncached * PRICE["input"] + t["output"] * PRICE["output"] + t["cache_read"] * PRICE["cache_read"] + t["cache_write"] * PRICE["cache_write"]) / 1e6
    return {**t, "uncached": uncached, "usd": round(usd, 4)}


def last_history():
    try:
        with open(HISTORY) as f:
            lines = [json.loads(l) for l in f if l.strip()]
    except (OSError, ValueError):
        return []
    return lines


def main():
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1].split(",")
    with open(QUESTIONS) as f:
        qs = json.load(f)
    if only:
        qs = [b for b in qs if b["id"] in only]
    with open(KEY_FILE) as f:
        key = f.read().strip()
    db, conn = connect_db()
    started = dt.datetime.now().astimezone()
    t0 = time.time()
    with cf.ThreadPoolExecutor(PARALLEL) as ex:
        res = list(ex.map(lambda b: run_one(b, key, db), qs))
    wall = time.time() - t0
    if conn:
        conn.close()

    count = lambda rs, s: sum(1 for r in rs if r["status"] == s)
    statuses = {s: count(res, s) for s in STATUSES}
    ok = statuses["ok"]
    hist = last_history()
    prev_path = os.path.join(QA, "benchmark-prev-results.json")
    prev = {}
    try:
        with open(prev_path) as f:
            prev = {r["id"]: r["status"] for r in json.load(f)}
    except (OSError, ValueError):
        pass
    newly = [{"id": r["id"], "q": r["q"][:120], "was": prev[r["id"]], "now": r["status"]}
             for r in res if prev.get(r["id"]) == "ok" and r["status"] != "ok"]
    fixed = [r["id"] for r in res if r["id"] in prev and prev[r["id"]] != "ok" and r["status"] == "ok"]
    c = cost([r["usage"] for r in res if r["usage"]])
    errors = sum(1 for r in res if r["engine"] == "error")
    misleading = [{"id": r["id"], "q": r["q"][:120], "why": (r["review"] or "")[:200]} for r in res if r["status"] == "misleading"]
    entry = {"date": started.strftime("%Y-%m-%d"), "at": started.isoformat(timespec="seconds"), "score": ok, "total": len(res),
             "misleading": statuses["misleading"], "statuses": statuses, "errors": errors, "cost_usd": c["usd"], "router_calls": c["calls"], "wall_s": round(wall)}
    trend = (hist + [entry])[-60:] if not only else hist[-60:]
    summary = {
        "at": entry["at"], "score": ok, "total": len(res), "misleading": statuses["misleading"], "statuses": statuses, "errors": errors,
        "newly_failing": newly[:25], "newly_failing_count": len(newly), "fixed": fixed[:25], "misleading_list": misleading[:10],
        "prev_score": hist[-1]["score"] if hist else None, "cost_usd": c["usd"], "router_calls": c["calls"], "wall_s": round(wall),
        "trend": [{"date": h["date"], "score": h["score"], "total": h["total"], "misleading": h["misleading"]} for h in trend],
        "partial_run": bool(only),
    }
    out = {"summary": summary, "cost": c, "base": BASE, "results": res}
    os.makedirs(QA, exist_ok=True)
    if not only:
        with open(OUT + ".tmp", "w") as f:
            json.dump(out, f, indent=1)
        os.replace(OUT + ".tmp", OUT)
        with open(HISTORY, "a") as f:
            f.write(json.dumps(entry) + "\n")
        with open(prev_path, "w") as f:
            json.dump([{"id": r["id"], "status": r["status"]} for r in res], f)
    else:
        print(json.dumps(out, indent=1)[:4000])
    print(f"{started:%F %T} benchmark {ok}/{len(res)} ok, misleading {statuses['misleading']}, {statuses}, "
          f"errors {errors}, newly failing {len(newly)}, router calls {c['calls']} (${c['usd']:.3f}), {wall:.0f} s")


if __name__ == "__main__":
    main()
