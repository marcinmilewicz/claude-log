# claude-log

Builds a Claude Code and Codex usage dashboard as a single HTML file on your machine: cost at API prices, the most expensive prompts and sessions, context, tools, MCP servers, skills and subagents.

It reads `~/.claude` and `~/.codex` (whichever exist) directly, so you don't need to zip or upload anything. The report is one self-contained file with its scripts, styles and data inlined, and it opens from disk in any browser.

```sh
npx claude-log                    # reads ~/.claude and ~/.codex, writes ./claude-log-report.html and opens it
npx claude-log ~/Desktop/claude-data.zip -o report.html --no-open
npx claude-log --codex            # only ~/.codex (--claude: only ~/.claude)
```

| Argument | Meaning |
|---|---|
| `[source...]` | Claude Code data directories (`~/.claude`, its `projects/` directory or one project), Codex data directories (`~/.codex` or its `sessions/` directory) or zips made with the commands from the web app. Several sources are combined into one report. Defaults to both `$CLAUDE_CONFIG_DIR` or `~/.claude` and `$CODEX_HOME` or `~/.codex`, whichever exist. |
| `--claude`, `--codex` | Read only the default Claude Code or Codex directory. |
| `-o, --out <file>` | Where to write the report. Defaults to `./claude-log-report.html`. |
| `--no-open` | Don't open the report in the browser. The report is also not opened when the output isn't a terminal. |

Requires Node.js 20 or later.

The report contains your prompts and file paths, so treat it like the transcripts themselves before sharing it.

## License

[Apache-2.0](LICENSE) © Marcin Milewicz. If you redistribute the tool or build on it, keep the attribution from [NOTICE](NOTICE) (section 4(d) of the license). Licenses of the bundled third-party packages are in `dist/THIRD_PARTY_LICENSES.txt`.

Source: https://github.com/marcinmilewicz/claude-log
