// Partner API docs: public (proxy.ts lets /api/docs through the site password), static, built from lib/apiDocs.ts.
import { ENDPOINTS, ERRORS, MCP_TOOLS } from "@/lib/apiDocs";

export const metadata = { title: "API · NomBot", description: "Keyed, read-only API and remote MCP server for NomBot's nonprofit data and research." };

const CLAUDE_CODE = `claude mcp add --transport http nombot "$NOMBOT/mcp" \\
  --header "Authorization: Bearer $NOMBOT_KEY"`;

const MCP_JSON = `{
  "mcpServers": {
    "nombot": {
      "type": "http",
      "url": "https://<host>/mcp",
      "headers": { "Authorization": "Bearer nb_live_..." }
    }
  }
}`;

const CLAUDE_API = `curl https://api.anthropic.com/v1/messages \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "anthropic-beta: mcp-client-2025-11-20" \\
  -H "content-type: application/json" \\
  -d '{
    "model": "claude-opus-5-5",
    "max_tokens": 4096,
    "mcp_servers": [{ "type": "url", "name": "nombot",
      "url": "https://<host>/mcp", "authorization_token": "nb_live_..." }],
    "tools": [{ "type": "mcp_toolset", "mcp_server_name": "nombot" }],
    "messages": [{ "role": "user",
      "content": "Which foundations fund youth mentoring in Ohio?" }]
  }'`;

const OPENAI = `from openai import OpenAI

client = OpenAI()
response = client.responses.create(
    model="gpt-5",
    tools=[{
        "type": "mcp",
        "server_label": "nombot",
        "server_url": "https://<host>/mcp",
        "headers": {"Authorization": "Bearer nb_live_..."},
        "require_approval": "never",
    }],
    input="Which foundations fund youth mentoring in Ohio?",
)
print(response.output_text)`;

const RAW_MCP = `curl -X POST "$NOMBOT/mcp" \\
  -H "Authorization: Bearer $NOMBOT_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"get_organization","arguments":{"ein":"34-1877332"}}}'`;

function Code({ children, label }: { children: string; label?: string }) {
  return (
    <figure className="apidoc-code">
      {label && <figcaption>{label}</figcaption>}
      <pre><code>{children}</code></pre>
    </figure>
  );
}

export default function ApiDocs() {
  return (
    <main className="apidoc">
      <p className="apidoc-kicker">For developers</p>
      <h1 className="pagetitle">NomBot API</h1>
      <p className="apidoc-lede">
        Read-only JSON access to public IRS data on 1.97 million US nonprofits and 138,734 private foundations, plus NomBot&apos;s verified research findings.
        The same data is also a remote <b>MCP server</b> for Claude, ChatGPT and other AI tools. Every call needs an API key.
      </p>
      <nav className="apidoc-toc" aria-label="On this page">
        <a href="#start">Quick start</a><a href="#auth">Keys and limits</a>
        {ENDPOINTS.map((e) => <a key={e.id} href={`#${e.id}`}>{e.title}</a>)}
        <a href="#mcp">MCP</a><a href="#data">About the data</a>
        <a href="/api/openapi.json">openapi.json</a>
      </nav>

      <section id="start">
        <h2>Quick start</h2>
        <ol className="apidoc-steps">
          <li>Ask your Institute on Generosity contact for a key. It looks like <code>nb_live_…</code>. We keep only a fingerprint of it and can&apos;t send it again, so store it like a password.</li>
          <li>Set the base URL you were given and your key.</li>
          <li>Call any endpoint with the key in the <code>Authorization</code> header.</li>
        </ol>
        <Code>{`export NOMBOT="https://<host>"     # the address we sent you
export NOMBOT_KEY="nb_live_..."

curl -H "Authorization: Bearer $NOMBOT_KEY" "$NOMBOT/api/v1/search?q=food+bank&state=WV"`}</Code>
      </section>

      <section id="auth">
        <h2>Keys and limits</h2>
        <ul className="apidoc-list">
          <li><b>Auth:</b> <code>Authorization: Bearer nb_live_…</code> on every request, REST and MCP alike. Keys never go in the URL.</li>
          <li><b>Rate limit:</b> 60 requests per minute per key unless agreed otherwise. Responses carry <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code> and <code>X-RateLimit-Reset</code> (seconds). Over the limit you get 429 with <code>Retry-After</code>.</li>
          <li><b>Read-only:</b> all endpoints are GET (MCP uses POST for JSON-RPC). Nothing you send changes the data.</li>
          <li><b>No AI in the loop:</b> no endpoint or MCP tool calls a language model. Search ranks by meaning with a local embedding model plus keyword match, so results are fast and repeatable.</li>
          <li><b>Stable shapes:</b> fields may be added under <code>/api/v1</code>, never renamed or removed.</li>
        </ul>
        <p className="apidoc-p">Errors are JSON with a short code:</p>
        <Code>{`{ "error": { "code": "rate_limited", "message": "Rate limit: 60 requests per minute for this key.", "docs": "/api/docs" } }`}</Code>
        <table className="apidoc-table">
          <thead><tr><th>Status</th><th>Code</th><th>When</th></tr></thead>
          <tbody>{ERRORS.map((e) => <tr key={e.code}><td>{e.status}</td><td><code>{e.code}</code></td><td>{e.when}</td></tr>)}</tbody>
        </table>
      </section>

      {ENDPOINTS.map((e) => (
        <section key={e.id} id={e.id}>
          <h2>{e.title}</h2>
          <p className="apidoc-route"><span className="apidoc-method">{e.method}</span><code>{e.path}</code><span className="apidoc-mcp">MCP tool <code>{e.mcpTool}</code></span></p>
          <p className="apidoc-p">{e.summary}</p>
          <table className="apidoc-table">
            <thead><tr><th>Parameter</th><th>In</th><th>Description</th></tr></thead>
            <tbody>
              {e.params.map((p) => (
                <tr key={p.name}><td><code>{p.name}</code>{p.in === "path" && <span className="apidoc-req"> required</span>}</td><td>{p.in}</td><td>{p.desc}{p.example && <> Example: <code>{p.example}</code></>}</td></tr>
              ))}
            </tbody>
          </table>
          <Code label="Request">{e.curl}</Code>
          <details className="apidoc-example">
            <summary>Example response (trimmed)</summary>
            <pre><code>{JSON.stringify(e.example, null, 2)}</code></pre>
          </details>
        </section>
      ))}

      <section id="mcp">
        <h2>MCP server</h2>
        <p className="apidoc-route"><span className="apidoc-method">POST</span><code>/mcp</code></p>
        <p className="apidoc-p">
          A remote MCP server (Streamable HTTP, JSON-RPC, no sessions) with four read-only tools. It uses the same key and rate limit as the REST API.
          Tool results are the same JSON as the matching endpoint.
        </p>
        <table className="apidoc-table">
          <thead><tr><th>Tool</th><th>What it does</th></tr></thead>
          <tbody>{MCP_TOOLS.map((t) => <tr key={t.name}><td><code>{t.name}</code></td><td>{t.desc}</td></tr>)}</tbody>
        </table>
        <Code label="Claude Code">{CLAUDE_CODE}</Code>
        <Code label="Claude API (MCP connector)">{CLAUDE_API}</Code>
        <Code label="OpenAI API, the model behind ChatGPT (Responses API, Python)">{OPENAI}</Code>
        <Code label="Any client with a JSON config (.mcp.json, Cursor and others)">{MCP_JSON}</Code>
        <Code label="Raw JSON-RPC, to test">{RAW_MCP}</Code>
        <p className="apidoc-note">
          The chat apps at claude.ai and chatgpt.com add custom connectors through an OAuth sign-in, which NomBot doesn&apos;t offer yet.
          Use the options above, or ask us if your team needs a connector in the chat apps.
        </p>
      </section>

      <section id="data">
        <h2>About the data</h2>
        <ul className="apidoc-list">
          <li><b>Sources:</b> IRS Exempt Organizations Business Master File, IRS SOI financial extracts, IRS Form 990, 990-EZ and 990-PF e-file returns, NCCS cause codes. Every record links to its source.</li>
          <li><b>Grants</b> come from private foundations&apos; 990-PF filings, IRS release years 2023 to 2026. About 66% of grants (58% of grant dollars) are linked to a recipient EIN, so totals per organization run low. Schedule I grants from public charities and federal awards (USAspending) are separate fields with their own notes.</li>
          <li><b>Health signals</b> follow fixed, published rules (Income, Bottom line, Cash, Debts, Donations, Board, Insiders). They are prompts for questions, not verdicts.</li>
          <li><b>Research findings</b> are computed by SQL over the same tables, checked before they are published, and refreshed nightly. Each one carries its method, caveats and SQL.</li>
          <li><b>Freshness:</b> loaded from the newest IRS releases. A monthly refresh is planned.</li>
        </ul>
      </section>
    </main>
  );
}
