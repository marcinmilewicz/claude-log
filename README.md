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

It also reads Codex data. Zip `~/.codex` too and drop both zips at once for one combined report (or only this one for a Codex report):

```sh
cd ~/.codex && zip -r ~/Desktop/codex-data.zip sessions archived_sessions history.jsonl
```

## CLI: a local report without a zip

The `claude-log` npm package reads `~/.claude` and `~/.codex` directly and writes the same dashboard as one self-contained HTML file (scripts, styles and data inlined) that opens from disk in a browser. Nothing is uploaded, not even to the local browser app.

```sh
npx claude-log                 # reads ~/.claude and ~/.codex, writes ./claude-log-report.html and opens it
npx claude-log ~/Desktop/claude-data.zip -o report.html --no-open
npx claude-log --claude        # only ~/.claude (--codex: only ~/.codex)
```

See `cli/README.md` for all options. The report contains prompts and file paths, so don't share it carelessly. On large histories it can be tens of MB.

### Building and publishing the CLI

```sh
npm run build:cli              # builds cli/dist/claude-log.mjs
npm run report                 # runs the local build on ~/.claude
cd cli && npm pack             # builds and packs claude-log-<version>.tgz
npx --package ./cli/claude-log-0.1.0.tgz claude-log   # runs the packed tarball like `npx claude-log`
cd cli && npm publish          # builds and publishes to npm (needs `npm login`)
```

The package lives in `cli/` and has no runtime dependencies. Its `prepack` script runs `build:cli` in the repository root, in two steps. First, `vite.report.config.ts` builds `report.html` (entry `src/report.tsx`, the dashboard without the landing page) into a single file with everything inlined. Then `vite.cli.config.ts` bundles `src/cli/main.ts`, that template and all dependencies into one Node script. It also copies `LICENSE` and `NOTICE` into `cli/` and writes `THIRD_PARTY_LICENSES.txt` for the bundled packages (React, zip.js). At run time the CLI parses the data with the same code as the browser app (`src/core/parse.ts`) and puts the dataset as JSON in place of the placeholder in the template.

## Where the data comes from

| File in the zip | What we take from it |
|---|---|
| `projects/<project>/<sessionId>.jsonl` | API calls with `usage` (cost, tokens, model, effort), tools with their results, prompts, slash commands, skills, compactions, turn durations, permission denials, hooks, API errors, session title, `cost-state` |
| `projects/<project>/<sessionId>/subagents/agent-*.jsonl` + `.meta.json` + `.forked-skill.json` | subagent calls, their type, and the skill that started them |
| `history.jsonl` | prompt history (goes further back than the transcripts) |
| `sessions/<pid>.json` | sessions running when the zip was made |
| `stats-cache.json` | counters since the first session |

### Codex

Each directory or zip is detected from its file names: Claude Code transcripts win when both are present, otherwise `rollout-*.jsonl` files make it a Codex dataset (`src/core/ingest-codex.ts`). Several sources (by default `~/.claude` and `~/.codex`, whichever exist) are parsed separately and combined by `src/core/merge.ts`. The same directory has the same project key in both tools, so its Claude Code and Codex sessions land in one project, and the "Tool" filter narrows the dashboard to one of them.

| File | What we take from it |
|---|---|
| `sessions/YYYY/MM/DD/rollout-<datetime>-<sessionId>.jsonl`, `archived_sessions/rollout-*.jsonl` | `session_meta` (cwd, git branch, CLI version), `turn_context` (model, effort), `token_count` (usage per response and plan usage limits), tool calls and their results (`exec_command`, `apply_patch`, MCP…), prompts, compactions, turn durations, interruptions |
| `history.jsonl` | prompt history |

Differences from Claude Code:

- OpenAI has no cache writes. `cached_input_tokens` count as cache reads at the model's cached input rate, and the rest of the input at the input rate. Prices are the OpenAI standard tier (`src/core/pricing.ts`).
- Codex writes most `token_count` events twice. A response counts only when the session's running `total_token_usage` changes.
- A tool error is a non-zero exit code or a failed call. "Rejected or interrupted" counts commands you rejected or aborted.
- Skills are counted when Codex reads a `skills/<name>/SKILL.md` file with a shell command.
- The plan usage limits section shows the `rate_limits` readings (5-hour and weekly windows). They are account-wide, so only the date filter applies.
- Codex records no subagents, hooks, cost-state or session titles. Those parts of the dashboard are hidden when the view has no Claude Code data, and the first prompt stands in for the session title.

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

## License

[Apache-2.0](LICENSE) © Marcin Milewicz. You can use, modify and redistribute the code, including commercially. Redistributions and derivative works must keep the copyright and license notices and the attribution in [NOTICE](NOTICE).
