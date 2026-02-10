# lightning-mcp-server

MCP server for Lightning Network node and channel exploration. Aggregates data from **Amboss**, **1ML**, and **LN+** so AI assistants can search for optimal channels and routing partners.

## Data Sources

| Source | Method | Purpose |
|--------|--------|---------|
| **Amboss** | GraphQL API | Node details, channels, social info, verification status |
| **1ML** | JSON API + web scraping | Node rankings (capacity, growth, availability, etc.) |
| **LN+** | REST API v2.3 + web scraping | Node Rank tiers, liquidity swaps, community ratings |

## Tools

| Tool | Description |
|------|-------------|
| `ln_lookup_node` | Look up a node by pubkey across all 3 sources |
| `ln_search_top_nodes` | Top nodes from 1ML by capacity, growth, age, etc. |
| `ln_search_nodes_by_rank` | Filter nodes by LN+ rank tier (Gold+, Platinum+, etc.) |
| `ln_get_highest_rated` | Highest community-rated node operators on LN+ |
| `ln_find_swaps` | Search LN+ liquidity swaps by shape, size, status |
| `ln_find_path` | Pathfinding placeholder (not yet available via public API) |
| `ln_compare_nodes` | Side-by-side comparison of multiple nodes |
| `ln_search_by_alias` | Search nodes by alias/name across Amboss and LN+ |
| `ln_introspect_amboss` | Explore the Amboss GraphQL schema |

## Setup

```bash
npm install
npm run build
```

## Environment Variables

```bash
# Optional: for Amboss authenticated queries (public queries work without it)
export AMBOSS_API_KEY="your-api-key"
```

## Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "lightning": {
      "command": "node",
      "args": ["/path/to/lightning-mcp-server/dist/index.js"],
      "env": {
        "AMBOSS_API_KEY": "optional-api-key"
      }
    }
  }
}
```

## Claude Code (CLI)

```bash
claude mcp add lightning -- node /path/to/lightning-mcp-server/dist/index.js
```

## LN+ Rank Tiers

| Rank | Name | Description |
|------|------|-------------|
| 10 | Iridium | Top hub nodes |
| 9 | Platinum | Large routing nodes |
| 8 | Gold | Strong routing nodes |
| 7 | Silver | Mid-tier routing |
| 6 | Tungsten | Decent nodes |
| 5 | Titanium | Minimum recommended for routing |
| 4 | Mercury | General user recommended |
| 3 | Copper | Light usage |
| 2 | Iron | Beginner |
| 1 | Aluminium | Newcomer |

Ranks are calculated using a PageRank-style algorithm based on the capacity of connected nodes.

## Example Prompts

- "Show me the top 20 nodes by capacity"
- "Find Platinum+ nodes with 100+ channels on clearnet"
- "Search for ACINQ nodes" (alias search — no pubkey needed)
- "Look up ACINQ node details" (requires pubkey for full detail)
- "Any open triangle swaps above 10M sats?"
- "Compare these two nodes: {pubkey1} vs {pubkey2}"

## Notes

- No API keys required for basic usage — all public endpoints work out of the box
- Amboss free API is not for commercial use
- 1ML Advanced API requires separate access (currently using Simple JSON + scraping)
- LN+ node search relies on web scraping — may break if site structure changes
- Be mindful of rate limits across all sources
