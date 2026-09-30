# claude-log

A local Claude Code analytics dashboard. You drop in a zip of `~/.claude`, and the browser app shows where tokens and money go, which prompts and sessions cost the most, what fills the context, which tools, MCP servers, skills and subagents are used, and where work gets stuck.

The file is parsed in a Web Worker in the browser and is never uploaded anywhere.

## Running

```sh
npm install
npm run dev
```

Zip to upload:

```sh
cd ~/.claude && zip -r ~/Desktop/claude-data.zip projects history.jsonl stats-cache.json sessions -x '*/tool-results/*'
```

## Where the data comes from

| File in the zip | What we take from it |
|---|---|
| `projects/<project>/<sessionId>.jsonl` | API calls with `usage` (cost, tokens, model, effort), tools with their results, prompts, slash commands, skills, compactions, turn durations, permission denials, hooks, API errors, session title, `cost-state` |
| `projects/<project>/<sessionId>/subagents/agent-*.jsonl` + `.meta.json` + `.forked-skill.json` | subagent calls, their type, and the skill that started them |
| `history.jsonl` | prompt history (goes further back than the transcripts) |
| `sessions/<pid>.json` | sessions running when the zip was made |
| `stats-cache.json` | counters since the first session |

## How the metrics are computed

- **Cost** is computed per API call from `usage` using the pricing in `src/core/pricing.ts`. Cache write: 5 min = 1.25× input, 1 h = 2× input. Cache read has a per-model rate. On a subscription this is the equivalent value, not a bill.
- **Deduplication**: one API response is written as several lines with the same `requestId`, so it is counted once. `tool_use` blocks are deduplicated by id, because resumed sessions copy their history into a new file.
- **Prompt cost** is every call from a prompt until the next prompt in the session. Subagent calls are assigned to the parent session's prompt by time.
- **Tool result carry cost** is the result size (about 4 characters per token, about 1,600 tokens per image) × the cache read rate × the number of later calls until a compaction or the end of the session. This is an estimate.
- **Skills** are counted from the `Skill` tool, from a slash command followed by the skill's content ("Base directory for this skill"), and from subagents with `forked-skill.json`.
- Cost from transcripts comes out a few percent lower than `totalCostUSD` in `cost-state`, because Claude Code doesn't write some auxiliary calls (e.g. Haiku) to the transcript. The dashboard shows both numbers.

## Verifying on real data

```sh
npm test                                     # parser tests
npm run verify -- ~/Desktop/claude-data.zip  # parses the zip in Node and compares cost with cost-state
```

## Example screenshots

The screenshots on the landing page (`public/examples/`, one per theme; the app defaults to dark with a light/dark toggle) come from synthetic data with fictional projects and prompts, so no real transcripts are published:

```sh
npx tsx scripts/demo-data.ts ~/Desktop/demo-claude-data.zip
```

Load that zip in the app to get the same dashboard. `public/og.png` (the link preview, 1200×630) is the Overview section of that dashboard.
