import { AMBOSS_GRAPHQL_URL } from "../constants.js";
import { graphqlQuery } from "./http.js";

function getAuthHeaders(apiKey?: string): Record<string, string> | undefined {
  if (!apiKey) return undefined;
  return { Authorization: `Bearer ${apiKey}` };
}

// ── Node lookup ─────────────────────────────────────────────────────

const NODE_QUERY = `
query NodeInfo($pubkey: String!) {
  getNode(pubkey: $pubkey) {
    graph_info {
      node {
        alias
        color
        pub_key
        last_update
        addresses {
          addr
          network
        }
      }
      channels {
        channel_list {
          list {
            short_channel_id
            capacity
            chan_point
            last_update
            node1_pub
            node2_pub
            node1_policy {
              fee_base_msat
              fee_rate_milli_msat
              min_htlc
              max_htlc_msat
              time_lock_delta
            }
            node2_policy {
              fee_base_msat
              fee_rate_milli_msat
              min_htlc
              max_htlc_msat
              time_lock_delta
            }
          }
        }
        num_channels
        total_capacity
      }
    }
    socials {
      info {
        email
        twitter
        website
        lightning_address
        pubkey
      }
    }
    amboss {
      is_claimed
    }
  }
}`;

export interface AmbossNodeResult {
  alias: string;
  color: string;
  pubkey: string;
  capacity_sat: number;
  channel_count: number;
  addresses: Array<{ addr: string; network: string }>;
  channels: Array<{
    short_channel_id: string;
    capacity: number;
    node1_pub: string;
    node2_pub: string;
  }>;
  socials: {
    email: string | null;
    twitter: string | null;
    website: string | null;
    lightning_address: string | null;
  };
  is_claimed: boolean;
  last_update: number | null;
}

export async function getNode(pubkey: string, apiKey?: string): Promise<AmbossNodeResult | null> {
  try {
    const data = await graphqlQuery<{ getNode: Record<string, unknown> | null }>(
      AMBOSS_GRAPHQL_URL,
      NODE_QUERY,
      { pubkey },
      getAuthHeaders(apiKey)
    );

    const n = data.getNode;
    if (!n) return null;

    const gi = n.graph_info as Record<string, unknown> | undefined;
    const node = (gi?.node ?? {}) as Record<string, unknown>;
    const channels = (gi?.channels ?? {}) as Record<string, unknown>;
    const socials = n.socials as Record<string, unknown> | undefined;
    const socialInfo = (socials?.info ?? {}) as Record<string, unknown>;
    const ambossInfo = n.amboss as Record<string, unknown> | undefined;

    const channelListData = (channels?.channel_list ?? {}) as Record<string, unknown>;
    const channelList = (channelListData.list ?? []) as Array<Record<string, unknown>>;
    const totalCapacity = parseInt((channels?.total_capacity as string) ?? "0", 10);

    return {
      alias: (node.alias as string) ?? "",
      color: (node.color as string) ?? "",
      pubkey: (node.pub_key as string) ?? pubkey,
      capacity_sat: totalCapacity,
      channel_count: (channels?.num_channels as number) ?? 0,
      addresses: (node.addresses ?? []) as Array<{ addr: string; network: string }>,
      channels: channelList.slice(0, 30).map((c) => ({
        short_channel_id: (c.short_channel_id as string) ?? "",
        capacity: parseInt((c.capacity as string) ?? "0", 10),
        node1_pub: (c.node1_pub as string) ?? "",
        node2_pub: (c.node2_pub as string) ?? "",
      })),
      socials: {
        email: (socialInfo.email as string) ?? null,
        twitter: (socialInfo.twitter as string) ?? null,
        website: (socialInfo.website as string) ?? null,
        lightning_address: (socialInfo.lightning_address as string) ?? null,
      },
      is_claimed: !!(ambossInfo?.is_claimed),
      last_update: (node.last_update as number) ?? null,
    };
  } catch {
    return getNodeSimple(pubkey, apiKey);
  }
}

const SIMPLE_NODE_QUERY = `
query NodeInfo($pubkey: String!) {
  getNode(pubkey: $pubkey) {
    graph_info {
      node {
        alias
        color
        pub_key
        addresses { addr network }
      }
      channels {
        num_channels
        total_capacity
      }
    }
  }
}`;

async function getNodeSimple(pubkey: string, apiKey?: string): Promise<AmbossNodeResult | null> {
  const data = await graphqlQuery<{ getNode: Record<string, unknown> | null }>(
    AMBOSS_GRAPHQL_URL,
    SIMPLE_NODE_QUERY,
    { pubkey },
    getAuthHeaders(apiKey)
  );

  const n = data.getNode;
  if (!n) return null;

  const gi = n.graph_info as Record<string, unknown> | undefined;
  const node = (gi?.node ?? {}) as Record<string, unknown>;
  const channels = (gi?.channels ?? {}) as Record<string, unknown>;

  const totalCapacity = parseInt((channels?.total_capacity as string) ?? "0", 10);

  return {
    alias: (node.alias as string) ?? "",
    color: (node.color as string) ?? "",
    pubkey: (node.pub_key as string) ?? pubkey,
    capacity_sat: totalCapacity,
    channel_count: (channels?.num_channels as number) ?? 0,
    addresses: (node.addresses ?? []) as Array<{ addr: string; network: string }>,
    channels: [],
    socials: { email: null, twitter: null, website: null, lightning_address: null },
    is_claimed: false,
    last_update: null,
  };
}

// ── Pathfinding ─────────────────────────────────────────────────────

export interface PathfindingResult {
  fee: number;
  tokens: number;
  hops: Array<{
    channel: string;
    channel_capacity: number;
    fee: number;
    forward: number;
    public_key: string;
  }>;
}

export async function findPath(
  _origin: string,
  _destination: string,
  _amountSats: number,
  _apiKey?: string
): Promise<PathfindingResult | null> {
  return null;
}

// ── Search by alias ──────────────────────────────────────────────────

const SEARCH_QUERY = `
query Search($query: String!) {
  search(query: $query) {
    node_results {
      num_results
      results {
        alias
        pubkey
        capacity
        channel_amount
      }
    }
  }
}`;

export interface AmbossSearchResult {
  pubkey: string;
  alias: string;
  capacity_sat: number;
  channel_count: number;
}

export async function searchByAlias(
  query: string,
  limit: number = 10,
  apiKey?: string
): Promise<AmbossSearchResult[]> {
  const data = await graphqlQuery<{
    search: {
      node_results: {
        num_results: number;
        results: Array<{
          alias: string;
          pubkey: string;
          capacity: string;
          channel_amount: string;
        }>;
      };
    };
  }>(AMBOSS_GRAPHQL_URL, SEARCH_QUERY, { query }, getAuthHeaders(apiKey));

  const results = data.search?.node_results?.results ?? [];
  return results.slice(0, limit).map((r) => ({
    pubkey: r.pubkey,
    alias: r.alias,
    capacity_sat: parseInt(r.capacity ?? "0", 10),
    channel_count: parseInt(r.channel_amount ?? "0", 10),
  }));
}

// ── Introspection ───────────────────────────────────────────────────

export async function introspectSchema(apiKey?: string): Promise<string> {
  const INTROSPECTION = `{
    __schema {
      queryType {
        name
        fields {
          name
          description
          args { name type { name kind ofType { name kind } } }
        }
      }
    }
  }`;

  const data = await graphqlQuery<unknown>(
    AMBOSS_GRAPHQL_URL,
    INTROSPECTION,
    undefined,
    getAuthHeaders(apiKey)
  );

  return JSON.stringify(data, null, 2);
}
