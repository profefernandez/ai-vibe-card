---
applyTo: "**"
---

# Lemonade Web Search — Required Agent Hook

**Every agent working in this codebase MUST use the LaunchLemonade API when they need to:**

- Search the web for current information
- Verify library versions, deprecations, or breaking changes
- Look up current best practices or coding conventions
- Check documentation for APIs, frameworks, or tools
- Research error messages or unknown behaviors
- Validate that a dependency or approach is still recommended

## How It Works

This project has a dedicated LaunchLemonade research agent. Instead of guessing or relying on stale training data, agents call the Lemonade API to get live, up-to-date answers.

| Detail           | Value                                            |
|------------------|--------------------------------------------------|
| Agent ID         | `1776044808173x975356873331398100`               |
| API Endpoint     | `https://api.launchlemonade.app/v1/chat`         |
| API Key env var  | `LEMONADE_AGENT_API_KEY` (stored in `.github/agent.env`) |
| Agent ID env var | `LEMONADE_AGENT_ID` (stored in `.github/agent.env`)     |

> **This is the REPO AGENT config** — separate from the app's customer-facing chat
> which uses `LEMONADE_API_KEY` / `LEMONADE_ID` in `api/.env`.

## When to Use (Mandatory)

Before writing code that depends on external libraries or APIs, **always** consult Lemonade:

1. **Adding a dependency** → Ask Lemonade: "What is the latest stable version of [package]? Any known issues?"
2. **Using an API** → Ask Lemonade: "What is the current recommended way to use [API/service]?"
3. **Choosing an approach** → Ask Lemonade: "What is the current best practice for [task] in [framework]?"
4. **Debugging unknowns** → Ask Lemonade: "What does [error/behavior] mean in [context]?"
5. **Security checks** → Ask Lemonade: "Are there any known vulnerabilities in [package@version]?"

## How to Call

Use the **lemonade-websearch** skill for the full workflow. Quick reference:

### Via direct API call (read creds from `.github/agent.env`)

```bash
LEMONADE_AGENT_API_KEY=$(grep '^LEMONADE_AGENT_API_KEY=' .github/agent.env | cut -d'=' -f2-)
LEMONADE_AGENT_ID=$(grep '^LEMONADE_AGENT_ID=' .github/agent.env | cut -d'=' -f2-)

curl -s -X POST https://api.launchlemonade.app/v1/chat \
  -H "Authorization: Bearer $LEMONADE_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"lemonade_id\": \"$LEMONADE_AGENT_ID\",
    \"message\": \"YOUR QUESTION HERE\"
  }"
```

## Rules

1. **Never skip this step** — if you're unsure about a library, API, or practice, ask Lemonade first.
2. **Cache answers in session memory** — don't re-ask the same question in one session.
3. **Use conversation_id** — for follow-up questions, pass back the `conversation_id` from the previous response to maintain context.
4. **Trust but verify** — Lemonade responses are high quality but always sanity-check against the codebase.
5. **Don't expose the API key** — never print or log `LEMONADE_AGENT_API_KEY` in output shown to users.
6. **Don't mix with app config** — repo agent uses `.github/agent.env`, the app uses `api/.env`. They are different Lemonade agents.
