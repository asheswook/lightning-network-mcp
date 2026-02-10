import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as amboss from "../services/amboss.js";
import * as oneml from "../services/oneml.js";
import * as lnplus from "../services/lnplus.js";
import { LN_RANK_TIERS } from "../constants.js";
import {
  LookupNodeSchema,
  SearchTopNodesSchema,
  SearchNodesByRankSchema,
  GetHighestRatedNodesSchema,
  FindSwapsSchema,
  FindPathSchema,
  CompareNodesSchema,
  IntrospectAmbossSchema,
  SearchByAliasSchema,
} from "../schemas/index.js";

function textContent(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function jsonContent(data: unknown) {
  const text = JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

export function registerAllTools(server: McpServer, ambossApiKey?: string): void {
  // ═══════════════════════════════════════════════════════════════════
  // 1. ln_lookup_node — Lookup a node by pubkey across all sources
  // ═══════════════════════════════════════════════════════════════════
  server.registerTool(
    "ln_lookup_node",
    {
      title: "Lookup Lightning Node",
      description: `Look up detailed information about a Lightning Network node by its public key.
Fetches data from Amboss (graph data, socials, verification), 1ML (rankings, capacity), and LN+ (rank tier, ratings).

Args:
  - pubkey (string): 66-character hex public key of the node

Returns: Combined node info including alias, capacity, channels, rank tier, ratings, and connection details from all three sources.`,
      inputSchema: LookupNodeSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ pubkey }) => {
      const [ambossData, onemlData, lnplusData] = await Promise.allSettled([
        amboss.getNode(pubkey, ambossApiKey),
        oneml.getNode(pubkey),
        lnplus.getNode(pubkey),
      ]);

      const a = ambossData.status === "fulfilled" ? ambossData.value : null;
      const o = onemlData.status === "fulfilled" ? onemlData.value : null;
      const l = lnplusData.status === "fulfilled" ? lnplusData.value : null;

      if (!a && !o && !l) {
        return textContent(`No data found for pubkey: ${pubkey}`);
      }

      const result = {
        pubkey,
        alias: a?.alias ?? o?.alias ?? l?.alias ?? "unknown",
        capacity_sat: a?.capacity_sat ?? o?.capacity ?? l?.capacity_sat ?? 0,
        channel_count: a?.channel_count ?? o?.channelcount ?? l?.channel_count ?? 0,
        color: a?.color ?? o?.color ?? "",
        amboss: a
          ? {
              is_claimed: a.is_claimed,
              socials: a.socials,
              addresses: a.addresses,
              channel_ids: a.channels.slice(0, 20).map((c) => c.short_channel_id),
              total_channels: a.channel_count,
              last_update: a.last_update,
            }
          : null,
        oneml: o
          ? {
              rank: o.noderank,
              addresses: o.addresses,
              last_update: o.last_update
                ? new Date(o.last_update * 1000).toISOString()
                : null,
            }
          : null,
        lnplus: l
          ? {
              rank: l.rank,
              rank_name: l.rank_name,
              connection_type: l.connection_type,
              min_channel_size: l.min_channel_size,
              liquidity_credits: l.liquidity_credits,
              ratings: {
                positive: l.ratings_positive,
                negative: l.ratings_negative,
              },
            }
          : null,
        errors: [
          ambossData.status === "rejected" ? `amboss: ${(ambossData.reason as Error).message}` : null,
          onemlData.status === "rejected" ? `1ml: ${(onemlData.reason as Error).message}` : null,
          lnplusData.status === "rejected" ? `lnplus: ${(lnplusData.reason as Error).message}` : null,
        ].filter(Boolean),
      };

      return jsonContent(result);
    }
  );

  // ═══════════════════════════════════════════════════════════════════
  // 2. ln_search_top_nodes — Top nodes from 1ML by various criteria
  // ═══════════════════════════════════════════════════════════════════
  server.registerTool(
    "ln_search_top_nodes",
    {
      title: "Search Top Lightning Nodes",
      description: `Search for top Lightning Network nodes ranked by various criteria via 1ML.

Args:
  - order: Ranking criteria — "capacity", "channelcount", "age", "growth", "availability", "capacitychange", "channelcountchange"
  - limit: Number of results (1-50, default 20)

Returns: List of top nodes with pubkey, alias, capacity, and channel count.`,
      inputSchema: SearchTopNodesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ order, limit }) => {
      const nodes = await oneml.getTopNodes(order, limit);
      if (!nodes.length) {
        return textContent("No nodes found for the given criteria.");
      }
      return jsonContent({ count: nodes.length, order, nodes });
    }
  );

  // ═══════════════════════════════════════════════════════════════════
  // 3. ln_search_nodes_by_rank — LN+ rank tier based search
  // ═══════════════════════════════════════════════════════════════════
  server.registerTool(
    "ln_search_nodes_by_rank",
    {
      title: "Search Nodes by LN+ Rank Tier",
      description: `Search Lightning Network nodes filtered by LN+ Node Ranking tier.
LN+ ranks nodes 0-10 based on the quality of their connections (similar to PageRank):
  1=Aluminium, 2=Iron, 3=Copper, 4=Mercury, 5=Titanium,
  6=Tungsten, 7=Silver, 8=Gold, 9=Platinum, 10=Iridium

Routing nodes should target Titanium(5)+. Quality routing nodes are Gold(8)+.

Args:
  - min_rank: Minimum rank (1-10, default 8 for Gold+)
  - max_rank: Maximum rank (1-10, default 10)
  - min_capacity_btc: Optional minimum capacity in BTC
  - min_channels: Optional minimum channel count
  - connection_type: "clearnet", "tor", or "both"
  - limit: Max results (1-100, default 30)
  - page: Page number

Returns: List of nodes matching the criteria with rank, capacity, channels, and connection info.`,
      inputSchema: SearchNodesByRankSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ min_rank, max_rank, min_capacity_btc, min_channels, connection_type, limit, page }) => {
      const nodes = await lnplus.getNodesByRank({
        minRank: min_rank,
        maxRank: max_rank,
        minCapacityBtc: min_capacity_btc,
        minChannels: min_channels,
        connectionType: connection_type,
        limit,
        page,
      });

      if (!nodes.length) {
        return textContent(
          `No nodes found with rank ${min_rank}(${LN_RANK_TIERS[min_rank]})-${max_rank}(${LN_RANK_TIERS[max_rank]}) matching criteria.`
        );
      }

      return jsonContent({
        count: nodes.length,
        filter: { min_rank, max_rank, min_capacity_btc, min_channels, connection_type },
        nodes,
      });
    }
  );

  // ═══════════════════════════════════════════════════════════════════
  // 4. ln_get_highest_rated — Best-rated node operators on LN+
  // ═══════════════════════════════════════════════════════════════════
  server.registerTool(
    "ln_get_highest_rated",
    {
      title: "Get Highest Rated LN+ Nodes",
      description: `Get the highest-rated Lightning node operators on LN+ based on community ratings from liquidity swaps.

Args:
  - min_rank: Optional minimum LN+ rank tier (0-10)
  - limit: Max results (1-50, default 20)
  - page: Page number

Returns: Nodes sorted by community rating count, with rank tier and capacity info.`,
      inputSchema: GetHighestRatedNodesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ min_rank, limit, page }) => {
      const nodes = await lnplus.getHighestRatedNodes(min_rank, limit, page);
      if (!nodes.length) {
        return textContent("No rated nodes found.");
      }
      return jsonContent({ count: nodes.length, page, nodes });
    }
  );

  // ═══════════════════════════════════════════════════════════════════
  // 5. ln_find_swaps — Search liquidity swaps on LN+
  // ═══════════════════════════════════════════════════════════════════
  server.registerTool(
    "ln_find_swaps",
    {
      title: "Find Liquidity Swaps",
      description: `Search for Lightning Network liquidity swaps on LN+.
Liquidity swaps allow multiple node operators to mutually open channels.

Args:
  - status: "pending" (open for application), "opening" (channels being opened), "completed"
  - shape: Swap topology — "dual", "triangle", "square", "pentagon"
  - size: Channel size — "xs"(<500K), "sm"(500K-1M), "md"(1M-3M), "lg"(3M-5M), "xl"(5M-10M), "xxl"(>10M)
  - page: Page number

Returns: List of matching swaps with capacity, participant count, and connection type.`,
      inputSchema: FindSwapsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ status, shape, size, page }) => {
      const swaps = await lnplus.getSwaps({ status, shape, size, page });
      if (!swaps.length) {
        return textContent("No swaps found matching criteria.");
      }
      return jsonContent({ count: swaps.length, filter: { status, shape, size }, swaps });
    }
  );

  // ═══════════════════════════════════════════════════════════════════
  // 6. ln_find_path — Pathfinding between two nodes
  // ═══════════════════════════════════════════════════════════════════
  server.registerTool(
    "ln_find_path",
    {
      title: "Find Payment Path",
      description: `Find a payment route between two Lightning Network nodes.
NOTE: Pathfinding is not currently available through the Amboss public GraphQL API.
This tool will return a "not available" message. It is kept as a placeholder for future implementation.

Args:
  - origin: Source node pubkey (66-char hex)
  - destination: Destination node pubkey (66-char hex)
  - amount_sats: Payment amount in satoshis

Returns: Currently returns "not available" message.`,
      inputSchema: FindPathSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ origin, destination, amount_sats }) => {
      const path = await amboss.findPath(origin, destination, amount_sats, ambossApiKey);
      if (!path) {
        return textContent(
          `Pathfinding is not currently available. The Amboss public GraphQL API does not expose a pathfinding query. ` +
          `Requested: ${origin.slice(0, 12)}... → ${destination.slice(0, 12)}... for ${amount_sats} sats.`
        );
      }

      return jsonContent({
        total_fee_sat: path.fee,
        total_amount_sat: path.tokens,
        hop_count: path.hops.length,
        hops: path.hops.map((h, i) => ({
          hop: i + 1,
          pubkey: h.public_key,
          channel: h.channel,
          channel_capacity_sat: h.channel_capacity,
          fee_sat: h.fee,
          forward_sat: h.forward,
        })),
      });
    }
  );

  // ═══════════════════════════════════════════════════════════════════
  // 7. ln_compare_nodes — Side-by-side comparison
  // ═══════════════════════════════════════════════════════════════════
  server.registerTool(
    "ln_compare_nodes",
    {
      title: "Compare Lightning Nodes",
      description: `Compare multiple Lightning Network nodes side by side.
Fetches data from all sources (Amboss, 1ML, LN+) for each node and presents a comparison.

Args:
  - pubkeys: Array of 2-10 node pubkeys to compare

Returns: Comparison table with capacity, channels, rank, ratings, and connection info for each node.`,
      inputSchema: CompareNodesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ pubkeys }) => {
      const results = await Promise.all(
        pubkeys.map(async (pk) => {
          const [o, l] = await Promise.allSettled([
            oneml.getNode(pk),
            lnplus.getNode(pk),
          ]);

          const oData = o.status === "fulfilled" ? o.value : null;
          const lData = l.status === "fulfilled" ? l.value : null;

          return {
            pubkey: pk,
            alias: oData?.alias ?? lData?.alias ?? pk.slice(0, 16) + "...",
            capacity_sat: oData?.capacity ?? lData?.capacity_sat ?? 0,
            capacity_btc: ((oData?.capacity ?? lData?.capacity_sat ?? 0) / 1e8).toFixed(3),
            channel_count: oData?.channelcount ?? lData?.channel_count ?? 0,
            oneml_rank: oData?.noderank ?? null,
            lnplus_rank: lData?.rank ?? null,
            lnplus_tier: lData ? `${lData.rank}/${lData.rank_name}` : "unknown",
            connection: lData?.connection_type ?? "unknown",
            ratings: lData
              ? { positive: lData.ratings_positive, negative: lData.ratings_negative }
              : null,
          };
        })
      );

      return jsonContent({ node_count: results.length, comparison: results });
    }
  );

  // ═══════════════════════════════════════════════════════════════════
  // 8. ln_introspect_amboss — Discover Amboss API schema
  // ═══════════════════════════════════════════════════════════════════
  server.registerTool(
    "ln_introspect_amboss",
    {
      title: "Introspect Amboss GraphQL Schema",
      description: `Fetch the Amboss GraphQL API schema via introspection.
Useful for discovering available queries, mutations, and fields.

Returns: Raw introspection result showing all available query types and their arguments.`,
      inputSchema: IntrospectAmbossSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const schema = await amboss.introspectSchema(ambossApiKey);
      return textContent(schema);
    }
  );

  server.registerTool(
    "ln_search_by_alias",
    {
      title: "Search Nodes by Alias",
      description: `Search for Lightning Network nodes by alias/name instead of pubkey.
Queries Amboss and LN+ to find matching nodes and merges results.

Args:
  - query: Node alias or name to search for (e.g. "ACINQ", "Kraken", "Bitfinex")
  - limit: Max results (1-50, default 10)

Returns: List of matching nodes with pubkey, alias, capacity, channels, and LN+ rank if available.`,
      inputSchema: SearchByAliasSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ query, limit }) => {
      const [ambossResult, lnplusResult] = await Promise.allSettled([
        amboss.searchByAlias(query, limit, ambossApiKey),
        lnplus.searchByAlias(query, limit),
      ]);

      const ambossNodes = ambossResult.status === "fulfilled" ? ambossResult.value : [];
      const lnplusNodes = lnplusResult.status === "fulfilled" ? lnplusResult.value : [];

      const merged = new Map<string, {
        pubkey: string;
        alias: string;
        capacity_sat: number;
        channel_count: number;
        lnplus_rank?: number;
        lnplus_rank_name?: string;
        connection_type?: string;
        source: string[];
      }>();

      for (const n of ambossNodes) {
        merged.set(n.pubkey, {
          pubkey: n.pubkey,
          alias: n.alias,
          capacity_sat: n.capacity_sat,
          channel_count: n.channel_count,
          source: ["amboss"],
        });
      }

      for (const n of lnplusNodes) {
        const existing = merged.get(n.pubkey);
        if (existing) {
          existing.lnplus_rank = n.rank;
          existing.lnplus_rank_name = n.rank_name;
          existing.connection_type = n.connection_type;
          existing.source.push("lnplus");
        } else {
          merged.set(n.pubkey, {
            pubkey: n.pubkey,
            alias: n.alias,
            capacity_sat: Math.round(n.capacity_btc * 1e8),
            channel_count: n.channel_count,
            lnplus_rank: n.rank,
            lnplus_rank_name: n.rank_name,
            connection_type: n.connection_type,
            source: ["lnplus"],
          });
        }
      }

      const nodes = [...merged.values()].slice(0, limit);

      if (!nodes.length) {
        return textContent(`No nodes found matching "${query}".`);
      }

      const errors = [
        ambossResult.status === "rejected" ? `amboss: ${(ambossResult.reason as Error).message}` : null,
        lnplusResult.status === "rejected" ? `lnplus: ${(lnplusResult.reason as Error).message}` : null,
      ].filter(Boolean);

      return jsonContent({
        query,
        count: nodes.length,
        nodes,
        ...(errors.length ? { errors } : {}),
      });
    }
  );
}
