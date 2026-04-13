# Copilot Instructions

## Required: Lemonade Web Search

All agents in this workspace **must** use the LaunchLemonade API as their web search and research tool. Before writing or recommending code that relies on external libraries, APIs, or patterns, consult Lemonade first.

See [lemonade-websearch instruction](.github/instructions/lemonade-websearch.instructions.md) for the global rules and [lemonade-websearch skill](.github/skills/lemonade-websearch/SKILL.md) for the full API workflow.

### Two Lemonade Configs (do not mix)

| Purpose | Env File | Key Vars |
|---------|----------|----------|
| **Repo agent** (coding AI web search) | `.github/agent.env` | `LEMONADE_AGENT_API_KEY`, `LEMONADE_AGENT_ID` |
| **App** (customer-facing chat) | `api/.env` | `LEMONADE_API_KEY`, `LEMONADE_ID` |

### Quick Reference (repo agent)

```bash
LEMONADE_AGENT_API_KEY=$(grep '^LEMONADE_AGENT_API_KEY=' .github/agent.env | cut -d'=' -f2-)
LEMONADE_AGENT_ID=$(grep '^LEMONADE_AGENT_ID=' .github/agent.env | cut -d'=' -f2-)

curl -s -X POST https://api.launchlemonade.app/v1/chat \
  -H "Authorization: Bearer $LEMONADE_AGENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"lemonade_id\": \"$LEMONADE_AGENT_ID\", \"message\": \"your question\"}" | jq .response
```

Repo Agent ID: `1776044808173x975356873331398100`
