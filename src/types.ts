export interface AmbossNodeInfo {
  pubkey: string;
  alias: string;
  color: string;
  capacity_sat: number;
  channel_count: number;
  sockets: Array<{
    ip_address: string;
    ip_type: string;
    port: number;
    is_current: boolean;
  }>;
  socials: Array<{
    type: string;
    value: string;
  }>;
  is_verified: boolean;
  channels: Array<{
    short_channel_id: string;
    capacity_sat?: number;
  }>;
}

export interface OneMLNodeInfo {
  pub_key: string;
  alias: string;
  capacity: number;
  channelcount: number;
  color: string;
  addresses: Array<{
    network: string;
    addr: string;
  }>;
  noderank?: {
    capacity: number;
    channelcount: number;
    age: number;
    growth: number;
    availability: number;
  };
  last_update: number;
}

export interface OneMLNodeListItem {
  pub_key: string;
  alias: string;
  capacity: number;
  channelcount: number;
  rank_order: number;
}

export interface LNPlusNodeInfo {
  pubkey: string;
  alias: string;
  capacity_sat: number;
  channel_count: number;
  rank: number;
  rank_name: string;
  connection_type: string;
  min_channel_size: number;
  liquidity_credits: number;
  ratings_positive: number;
  ratings_negative: number;
}

export interface LNPlusSwap {
  id: number;
  status: string;
  shape: string;
  capacity_sat: number;
  participants_current: number;
  participants_total: number;
  connection_type: string;
  restrictions: string[];
}

export interface CombinedNodeInfo {
  pubkey: string;
  alias: string;
  capacity_sat: number;
  channel_count: number;
  color: string;
  ln_plus_rank: number;
  ln_plus_tier: string;
  sockets: string[];
  is_verified: boolean;
  socials: Array<{ type: string; value: string }>;
  oneml_rank?: {
    capacity: number;
    channelcount: number;
    age: number;
    growth: number;
    availability: number;
  };
  ratings?: {
    positive: number;
    negative: number;
  };
}
