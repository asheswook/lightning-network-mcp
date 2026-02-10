import * as cheerio from "cheerio";
import { LNPLUS_BASE_URL, LNPLUS_API_URL, LN_RANK_TIERS } from "../constants.js";
import { httpGet } from "./http.js";
import type { LNPlusNodeInfo, LNPlusSwap } from "../types.js";

// ── Shape / Size mappings ───────────────────────────────────────────

const PARTICIPANT_TO_SHAPE: Record<number, string> = {
  2: "dual",
  3: "triangle",
  4: "square",
  5: "pentagon",
};

const SIZE_RANGES: Record<string, [number, number]> = {
  xs: [0, 499_999],
  sm: [500_000, 999_999],
  md: [1_000_000, 2_999_999],
  lg: [3_000_000, 4_999_999],
  xl: [5_000_000, 9_999_999],
  xxl: [10_000_000, Infinity],
};

// ── Helpers ─────────────────────────────────────────────────────────

function parseBtcCapacity(text: string): number {
  const btcMatch = text.match(/~?([\d.]+)\s*BTC/i);
  if (btcMatch) return Math.round(parseFloat(btcMatch[1]) * 1e8);
  const satMatch = text.match(/([\d,.]+)\s*SAT/i);
  if (satMatch) return parseInt(satMatch[1].replace(/,/g, ""), 10);
  return 0;
}

function parseChannelCount(text: string): number {
  const m = text.match(/(\d[\d,]*)/);
  return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
}

function parseSatAmount(text: string): number {
  const m = text.match(/([\d,.]+)\s*([KMB])?\s*SAT/i);
  if (!m) return 0;
  const val = parseFloat(m[1].replace(/,/g, ""));
  const unit = (m[2] ?? "").toUpperCase();
  if (unit === "K") return val * 1_000;
  if (unit === "M") return val * 1_000_000;
  if (unit === "B") return val * 1_000_000_000;
  return val;
}

// ── API: Get Node (scrape profile page — no public API endpoint) ────

export async function getNode(pubkey: string): Promise<LNPlusNodeInfo | null> {
  try {
    const url = `${LNPLUS_BASE_URL}/nodes/${pubkey}`;
    const html = await httpGet(url);
    return parseNodeProfilePage(html, pubkey);
  } catch (err) {
    if (err instanceof Error && (err.message.includes("404") || err.message.includes("500"))) return null;
    throw err;
  }
}

function parseNodeProfilePage(html: string, pubkey: string): LNPlusNodeInfo | null {
  const $ = cheerio.load(html);

  const alias = $(".node-title").first().text().trim();
  if (!alias) return null;

  const capacityText = $(".node-capacity").last().text().trim();
  const capacitySat = parseBtcCapacity(capacityText);

  const channelsText = $(".node-channels").first().text().trim();
  const channelCount = parseChannelCount(channelsText);

  const connText = $(".node-connection").first().text().trim();
  const connMatch = connText.match(/Connection[:\s]*(.*)/i);
  const connectionType = connMatch ? connMatch[1].trim() : "unknown";

  let rank = 0;
  let rankName = "Unknown";
  const rankText = $(".rank").first().text().trim();
  const rankMatch = rankText.match(/Rank[:\s]*(\d+)\s*(?:\/\s*(\w+))?/i);
  if (rankMatch) {
    rank = parseInt(rankMatch[1], 10);
    rankName = rankMatch[2] ?? LN_RANK_TIERS[rank] ?? "Unknown";
  }

  const minChText = $(".min-channel-size").first().text().trim();
  const minChannelSize = parseSatAmount(minChText);

  const lcText = $(".liquidity_credits").first().text().trim();
  const liquidityCredits = parseSatAmount(lcText);

  let ratingsPositive = 0;
  let ratingsNegative = 0;
  $(".fa-smile").each((_, el) => {
    const num = parseInt($(el).parent().text().trim(), 10);
    if (!isNaN(num)) ratingsPositive = num;
  });
  $(".fa-frown").each((_, el) => {
    const num = parseInt($(el).parent().text().trim(), 10);
    if (!isNaN(num)) ratingsNegative = num;
  });

  return {
    pubkey,
    alias,
    capacity_sat: capacitySat,
    channel_count: channelCount,
    rank,
    rank_name: rankName,
    connection_type: connectionType,
    min_channel_size: minChannelSize,
    liquidity_credits: liquidityCredits,
    ratings_positive: ratingsPositive,
    ratings_negative: ratingsNegative,
  };
}

// ── API: Get Swaps ──────────────────────────────────────────────────

interface SwapFilters {
  status?: "pending" | "opening" | "completed";
  shape?: "dual" | "triangle" | "square" | "pentagon";
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "xxl";
  page?: number;
}

export async function getSwaps(filters: SwapFilters = {}): Promise<LNPlusSwap[]> {
  try {
    return await getSwapsFromApi(filters);
  } catch {
    return getSwapsByScraping(filters);
  }
}

async function getSwapsFromApi(filters: SwapFilters): Promise<LNPlusSwap[]> {
  // LN+ API v2.3: path-style params /api/2/get_swaps/status=pending/limit=50
  const parts: string[] = [];
  if (filters.status) parts.push(`status=${filters.status}`);
  parts.push("limit=50");

  const path = parts.join("/");
  const url = `${LNPLUS_API_URL}/get_swaps/${path}`;

  const text = await httpGet(url);
  const data = JSON.parse(text);
  const swaps: Array<Record<string, unknown>> = Array.isArray(data) ? data : [];

  return swaps
    .map((s) => {
      const participantMax = (s.participant_max_count as number) ?? 0;
      const shape = PARTICIPANT_TO_SHAPE[participantMax] ?? "unknown";
      const capacitySats = (s.capacity_sats as number) ?? 0;
      const clearnet = s.clearnet_connection_allowed as boolean;
      const tor = s.tor_connection_allowed as boolean;

      let connType = "any";
      if (clearnet && tor) connType = "clearnet/tor";
      else if (clearnet) connType = "clearnet";
      else if (tor) connType = "tor";

      return {
        id: (s.id as number) ?? 0,
        status: (s.status as string) ?? "unknown",
        shape,
        capacity_sat: capacitySats,
        participants_current: (s.participant_applied_count as number) ?? 0,
        participants_total: participantMax,
        connection_type: connType,
        restrictions: [] as string[],
      };
    })
    .filter((s) => {
      if (filters.shape && s.shape !== filters.shape) return false;
      if (filters.size) {
        const range = SIZE_RANGES[filters.size];
        if (range && (s.capacity_sat < range[0] || s.capacity_sat > range[1])) return false;
      }
      return true;
    });
}

// ── Scraping fallback: Swaps ────────────────────────────────────────

async function getSwapsByScraping(filters: SwapFilters): Promise<LNPlusSwap[]> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  params.set("commit", "Search");

  const url = `${LNPLUS_BASE_URL}/swaps?${params.toString()}`;
  const html = await httpGet(url);
  const $ = cheerio.load(html);
  const results: LNPlusSwap[] = [];

  $(".liquidity_swap_card").each((_, el) => {
    const card = $(el);

    const link = card.find('a[href^="/swaps/"]').first().attr("href") ?? "";
    const idMatch = link.match(/\/swaps\/(\d+)/);
    if (!idMatch) return;
    const id = parseInt(idMatch[1], 10);

    const shapeText = card.find(".capacity_title_shape").text().trim().toLowerCase();
    const shape = shapeText || "unknown";

    const capRaw = card.find(".text-2xl.font-bold").text().replace(/[^\d]/g, "");
    const capacitySat = capRaw ? parseInt(capRaw, 10) : 0;

    const waiting = parseInt(card.find(".spaces_waiting").text().trim(), 10) || 0;
    const total = parseInt(card.find(".spaces_total").text().trim(), 10) || 0;

    const connType = card.find(".capacity_title_type").text().trim().toLowerCase() || "any";

    const swap: LNPlusSwap = {
      id,
      status: filters.status ?? "pending",
      shape,
      capacity_sat: capacitySat,
      participants_current: total - waiting,
      participants_total: total,
      connection_type: connType,
      restrictions: [],
    };

    if (filters.shape && swap.shape !== filters.shape) return;
    if (filters.size) {
      const range = SIZE_RANGES[filters.size];
      if (range && (swap.capacity_sat < range[0] || swap.capacity_sat > range[1])) return;
    }

    results.push(swap);
  });

  return results;
}

// ── Scraping: Nodes by rank tier ────────────────────────────────────

export interface NodesByRankOptions {
  minRank?: number;
  maxRank?: number;
  minCapacityBtc?: number;
  minChannels?: number;
  connectionType?: "clearnet" | "tor" | "both";
  limit?: number;
  page?: number;
}

export interface ScrapedNode {
  pubkey: string;
  alias: string;
  capacity_btc: number;
  channel_count: number;
  rank: number;
  rank_name: string;
  connection_type: string;
  min_channel_size_sat: number;
  liquidity_credits_sat: number;
  is_member: boolean;
  profile_url: string;
}

// Capacity filter values used by LN+ website
const CAPACITY_FILTERS: Array<{ min: number; value: string }> = [
  { min: 10, value: "1000000000..100000000000" },
  { min: 1, value: "100000000..999999999" },
];

// Channel filter values used by LN+ website
const CHANNEL_FILTERS: Array<{ min: number; value: string }> = [
  { min: 1000, value: "1000..100000" },
  { min: 500, value: "500..749" },
  { min: 250, value: "250..499" },
  { min: 100, value: "100..249" },
  { min: 50, value: "50..99" },
];

export async function getNodesByRank(options: NodesByRankOptions = {}): Promise<ScrapedNode[]> {
  const {
    minRank = 8,
    minCapacityBtc,
    minChannels,
    connectionType,
    limit = 30,
    page = 1,
  } = options;

  const allNodes: ScrapedNode[] = [];
  const maxRank = options.maxRank ?? 10;

  for (let rank = maxRank; rank >= minRank && allNodes.length < limit; rank--) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("rank", String(rank));
    params.set("commit", "Search");

    if (minCapacityBtc !== undefined) {
      const filter = CAPACITY_FILTERS.find((f) => minCapacityBtc >= f.min);
      if (filter) params.set("capacity", filter.value);
    }

    if (minChannels !== undefined) {
      const filter = CHANNEL_FILTERS.find((f) => minChannels >= f.min);
      if (filter) params.set("channel", filter.value);
    }

    const url = `${LNPLUS_BASE_URL}/nodes?${params.toString()}`;
    const html = await httpGet(url);
    const parsed = parseNodeCards(html);

    for (const node of parsed) {
      if (connectionType && connectionType !== "both") {
        const conn = node.connection_type.toLowerCase();
        if (connectionType === "clearnet" && !conn.includes("clearnet")) continue;
        if (connectionType === "tor" && !conn.includes("tor")) continue;
      }
      allNodes.push(node);
      if (allNodes.length >= limit) break;
    }
  }

  return allNodes;
}

// ── Scraping: Highest rated nodes ───────────────────────────────────

export async function getHighestRatedNodes(
  minRank?: number,
  limit: number = 20,
  page: number = 1
): Promise<ScrapedNode[]> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  if (minRank !== undefined && minRank > 0) params.set("rank", String(minRank));

  // /prime_nodes = rated users (10+ happy ratings, 90%+ positive)
  const url = `${LNPLUS_BASE_URL}/prime_nodes?${params.toString()}`;
  const html = await httpGet(url);

  return parseNodeCards(html).slice(0, limit);
}

// ── Search by alias ─────────────────────────────────────────────────

export async function searchByAlias(
  query: string,
  limit: number = 10
): Promise<ScrapedNode[]> {
  const params = new URLSearchParams();
  params.set("search", query);
  params.set("commit", "Search");

  const url = `${LNPLUS_BASE_URL}/nodes?${params.toString()}`;
  const html = await httpGet(url);
  return parseNodeCards(html).slice(0, limit);
}

// ── Shared cheerio card parser ──────────────────────────────────────

function parseNodeCards(html: string): ScrapedNode[] {
  const $ = cheerio.load(html);
  const results: ScrapedNode[] = [];

  // Find all card containers that have a .node-title descendant
  $("[class*='min-w-0']").each((_, el) => {
    const card = $(el);
    const titleLink = card.find(".node-title a").first();
    if (!titleLink.length) return;

    const href = titleLink.attr("href") ?? "";
    const pubkeyMatch = href.match(/\/nodes\/([0-9a-f]{66})/);
    if (!pubkeyMatch) return;

    const pubkey = pubkeyMatch[1];
    const alias = titleLink.text().trim();

    // Capacity — last .node-capacity holds the value (first is the label)
    const capText = card.find(".node-capacity").last().text().trim();
    const capacityBtc = (() => {
      const btcM = capText.match(/~?([\d.]+)\s*BTC/i);
      if (btcM) return parseFloat(btcM[1]);
      const satM = capText.match(/([\d,]+)\s*SAT/i);
      if (satM) return parseInt(satM[1].replace(/,/g, ""), 10) / 1e8;
      return 0;
    })();

    const chText = card.find(".node-channels").first().text().trim();
    const channelCount = parseChannelCount(chText);

    const connText = card.find(".node-connection").first().text().trim();
    const connMatch = connText.match(/Connection[:\s]*(.*)/i);
    const connectionType = connMatch ? connMatch[1].trim() : "unknown";

    let rank = 0;
    let rankName = "Unknown";
    const rankText = card.find(".rank").first().text().trim();
    const rkMatch = rankText.match(/Rank[:\s]*(\d+)\s*(?:\/\s*(\w+))?/i);
    if (rkMatch) {
      rank = parseInt(rkMatch[1], 10);
      rankName = rkMatch[2] ?? LN_RANK_TIERS[rank] ?? "Unknown";
    }

    const minChText = card.find(".min-channel-size").first().text().trim();
    const minChannelSize = parseSatAmount(minChText);

    const lcText = card.find(".liquidity_credits").first().text().trim();
    const liquidityCredits = parseSatAmount(lcText);

    results.push({
      pubkey,
      alias,
      capacity_btc: capacityBtc,
      channel_count: channelCount,
      rank,
      rank_name: rankName,
      connection_type: connectionType,
      min_channel_size_sat: minChannelSize,
      liquidity_credits_sat: liquidityCredits,
      is_member: false,
      profile_url: `${LNPLUS_BASE_URL}${href}`,
    });
  });

  return results;
}
