# Lemonade Web Search — Agent Skill

**WORKFLOW SKILL** — Query the LaunchLemonade research agent for live web information, current best practices, library versions, API documentation, and security advisories.

**USE FOR:** checking library versions, verifying best practices, looking up API docs, researching errors, checking for vulnerabilities, validating approaches, getting current coding conventions, any question that requires up-to-date web knowledge.

**DO NOT USE FOR:** questions about this codebase's own code (use file search/read instead), simple logic questions, math, or anything answerable from the local workspace.

---

## Configuration

| Property        | Value                                        |
|-----------------|----------------------------------------------|
| Agent ID        | `1776044808173x975356873331398100`           |
| API Endpoint    | `https://api.launchlemonade.app/v1/chat`     |
| API Key Env Var | `LEMONADE_AGENT_API_KEY`                     |
| Agent ID Var    | `LEMONADE_AGENT_ID`                          |
| Env File        | `.github/agent.env` (repo agent only)        |
| Response Format | Markdown                                     |

> **Important:** This is separate from the app's Lemonade config in `api/.env`.
> The app uses `LEMONADE_API_KEY` / `LEMONADE_ID` for customer-facing chat.
> The repo agent uses `LEMONADE_AGENT_API_KEY` / `LEMONADE_AGENT_ID` for web research.

## Workflow

### Step 1 — Determine if Lemonade is needed

Before writing or modifying code that involves external dependencies, APIs, or patterns you're not 100% certain about, you MUST consult Lemonade. Examples:

- "Is `express-rate-limit` v7 backwards compatible with v6?"
- "What's the recommended way to handle file uploads in Express 5?"
- "Are there CVEs for `jsonwebtoken` 9.x?"
- "What's the current best practice for PostgreSQL connection pooling in Node.js?"
- "What's the latest stable React version and any migration notes?"

### Step 2 — Formulate a precise question

Write a clear, specific question. Include:
- The technology/library name and version if known
- What you need to know (version, best practice, vulnerability, migration path)
- Context about how it will be used

**Good:** "What is the latest stable version of @tanstack/react-query and does v5 have breaking changes from v4?"
**Bad:** "Tell me about react query"

### Step 3 — Call the API

Read the repo agent credentials from `.github/agent.env` and call LaunchLemonade directly:

```bash
# Read repo agent credentials (never print these to user-visible output)
LEMONADE_AGENT_API_KEY=$(grep '^LEMONADE_AGENT_API_KEY=' .github/agent.env | cut -d'=' -f2-)
LEMONADE_AGENT_ID=$(grep '^LEMONADE_AGENT_ID=' .github/agent.env | cut -d'=' -f2-)

curl -s -X POST https://api.launchlemonade.app/v1/chat \
  -H "Authorization: Bearer $LEMONADE_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"lemonade_id\": \"$LEMONADE_AGENT_ID\",
    \"message\": \"YOUR PRECISE QUESTION HERE\"
  }" | jq .
```

> **Do NOT use the app's local proxy** (`/api/functions/lemonade-chat`) — that uses the app's agent ID, not the repo agent's.

### Step 4 — Parse the response

The response JSON contains:

```json
{
  "response": "Markdown-formatted answer...",
  "conversation_id": "conv_abc123",
  "tokens_used": 150
}
```

- **`.response`** — The answer in Markdown format. Extract the key facts.
- **`.conversation_id`** — Save this for follow-up questions in the same topic.
- **`.tokens_used`** — Monitor for efficiency.

### Step 5 — Follow up if needed

For multi-part research, pass back the `conversation_id`:

```bash
curl -s -X POST https://api.launchlemonade.app/v1/chat \
  -H "Authorization: Bearer $LEMONADE_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"lemonade_id\": \"$LEMONADE_AGENT_ID\",
    \"message\": \"Can you elaborate on the migration steps?\",
    \"conversation_id\": \"conv_abc123\"
  }" | jq .
```

### Step 6 — Cache the answer

Store useful findings in session memory to avoid redundant API calls:

```
/memories/session/lemonade-research.md
```

Format:
```markdown
## [Topic]
- **Question:** ...
- **Answer:** ...
- **Date:** YYYY-MM-DD
```

## Error Handling

| HTTP Code | Meaning        | Action                                         |
|-----------|----------------|-------------------------------------------------|
| 200       | Success        | Parse `.response`                               |
| 400       | Bad request    | Check message is non-empty                      |
| 401       | Unauthorized   | API key missing or invalid — check `.github/agent.env` |
| 404       | Not found      | Verify agent ID is correct                      |
| 429       | Rate limited   | Wait 60 seconds, then retry                     |
| 500       | Server error   | Retry once; if persistent, skip and note in session memory |

If the API returns 401, check that `LEMONADE_AGENT_API_KEY` in `.github/agent.env` is set correctly.

## Security Rules

1. **NEVER** print or expose `LEMONADE_AGENT_API_KEY` in terminal output, logs, or files
2. **NEVER** commit the API key to version control (`.github/agent.env` must be in `.gitignore`)
3. Read the key only via `.github/agent.env` grep in a subshell variable
4. Keep 10 seconds between consecutive calls; respect 429 rate limits

## Environment Setup

### Repo agent (`.github/agent.env`) — for coding agents doing web research:

```env
LEMONADE_AGENT_API_KEY=your-api-key-here
LEMONADE_AGENT_ID=1776044808173x975356873331398100
```

### App (`api/.env`) — for the customer-facing chat (separate, deployed to server):

```env
LEMONADE_API_KEY=your-app-api-key
LEMONADE_ID=your-app-agent-id
```

These are **different Lemonade agents with different IDs**. Do not mix them.
