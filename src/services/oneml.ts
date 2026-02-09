import * as cheerio from "cheerio";
import { ONEML_BASE_URL } from "../constants.js";
import { httpGet } from "./http.js";
import type { OneMLNodeInfo } from "../types.js";

/**
 * 1ML provides a simple JSON API by appending .json to most pages.
 * - Node: /node/{pubkey}.json
 * - Node list (ranked): /node?order={order}.json  (may not be fully available)
 *
 * Advanced API requires beta access. We use the simple JSON endpoints.
 */

export async function getNode(pubkey: string): Promise<OneMLNodeInfo | null> {
  try {
    const url = `${ONEML_BASE_URL}/node/${pubkey}/json`;
    const text = await httpGet(url);
    const data = JSON.parse(text);

    return {
      pub_key: data.pub_key ?? pubkey,
      alias: data.alias ?? "",
      capacity: data.capacity ?? 0,
      channelcount: data.channelcount ?? 0,
      color: data.color ?? "",
      addresses: data.addresses ?? [],
      noderank: data.noderank
        ? {
            capacity: data.noderank.capacity ?? 0,
            channelcount: data.noderank.channelcount ?? 0,
            age: data.noderank.age ?? 0,
            growth: data.noderank.growth ?? 0,
            availability: data.noderank.availability ?? 0,
          }
        : undefined,
      last_update: data.last_update ?? 0,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes("404")) return null;
    throw err;
  }
}

/**
 * Scrape 1ML top nodes page by ranking criteria.
 * order: "capacity" | "channelcount" | "age" | "growth" | "availability"
 *        | "capacitychange" | "channelcountchange"
 */
export type OneMLSortOrder =
  | "capacity"
  | "channelcount"
  | "age"
  | "growth"
  | "availability"
  | "capacitychange"
  | "channelcountchange";

export async function getTopNodes(
  order: OneMLSortOrder = "capacity",
  limit: number = 20
): Promise<Array<{ pub_key: string; alias: string; capacity_btc: string; channel_count: string }>> {
  const url = `${ONEML_BASE_URL}/node?order=${order}`;
  const html = await httpGet(url);
  const $ = cheerio.load(html);

  const results: Array<{
    pub_key: string;
    alias: string;
    capacity_btc: string;
    channel_count: string;
  }> = [];

  $("li.list-group-item").each((_, el) => {
    if (results.length >= limit) return;

    const card = $(el);
    const link = card.find('a[href^="/node/"]').first();
    const href = link.attr("href") ?? "";
    const pubkeyMatch = href.match(/\/node\/([0-9a-f]{66})/);
    if (!pubkeyMatch) return;

    const pubkey = pubkeyMatch[1];
    const alias = link.find("h2").text().trim() || link.attr("title") || pubkey.slice(0, 16) + "...";

    let capacityBtc = "unknown";
    let channelCount = "unknown";

    card.find("ul.list-unstyled li").each((_, li) => {
      const text = $(li).text().trim();
      const capMatch = text.match(/Capacity\s*([\d.]+)\s*BTC/);
      if (capMatch) capacityBtc = capMatch[1];
      const chMatch = text.match(/Channel\s*Count\s*(\d[\d,]*)/i);
      if (chMatch) channelCount = chMatch[1].replace(/,/g, "");
    });

    results.push({ pub_key: pubkey, alias, capacity_btc: capacityBtc, channel_count: channelCount });
  });

  return results;
}
