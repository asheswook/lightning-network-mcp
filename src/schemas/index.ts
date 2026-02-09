import { z } from "zod";

export const PubkeySchema = z
  .string()
  .regex(/^[0-9a-f]{66}$/, "Must be a 66-character hex public key")
  .describe("Lightning node public key (66-char hex)");

export const LookupNodeSchema = z
  .object({
    pubkey: PubkeySchema,
  })
  .strict();

export const SearchTopNodesSchema = z
  .object({
    order: z
      .enum([
        "capacity",
        "channelcount",
        "age",
        "growth",
        "availability",
        "capacitychange",
        "channelcountchange",
      ])
      .default("capacity")
      .describe("Ranking criteria to sort by"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe("Number of results to return"),
  })
  .strict();

export const SearchNodesByRankSchema = z
  .object({
    min_rank: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(8)
      .describe("Minimum LN+ rank (1=Aluminium .. 10=Iridium). 8=Gold is a good default for quality routing nodes."),
    max_rank: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(10)
      .describe("Maximum LN+ rank"),
    min_capacity_btc: z
      .number()
      .min(0)
      .optional()
      .describe("Minimum capacity in BTC (e.g. 1, 10)"),
    min_channels: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Minimum number of public channels"),
    connection_type: z
      .enum(["clearnet", "tor", "both"])
      .optional()
      .describe("Filter by connection type"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(30)
      .describe("Max results"),
    page: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("Page number for pagination"),
  })
  .strict();

export const GetHighestRatedNodesSchema = z
  .object({
    min_rank: z
      .number()
      .int()
      .min(0)
      .max(10)
      .optional()
      .describe("Filter by minimum LN+ rank tier"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe("Max results"),
    page: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("Page number"),
  })
  .strict();

export const FindSwapsSchema = z
  .object({
    status: z
      .enum(["pending", "opening", "completed"])
      .default("pending")
      .describe("Swap status filter"),
    shape: z
      .enum(["dual", "triangle", "square", "pentagon"])
      .optional()
      .describe("Swap shape/topology"),
    size: z
      .enum(["xs", "sm", "md", "lg", "xl", "xxl"])
      .optional()
      .describe("Channel size category: xs(<500K), sm(500K-1M), md(1M-3M), lg(3M-5M), xl(5M-10M), xxl(>10M)"),
    page: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("Page number"),
  })
  .strict();

export const FindPathSchema = z
  .object({
    origin: PubkeySchema.describe("Source node pubkey"),
    destination: PubkeySchema.describe("Destination node pubkey"),
    amount_sats: z
      .number()
      .int()
      .min(1)
      .describe("Payment amount in satoshis"),
  })
  .strict();

export const CompareNodesSchema = z
  .object({
    pubkeys: z
      .array(PubkeySchema)
      .min(2)
      .max(10)
      .describe("List of pubkeys to compare (2-10)"),
  })
  .strict();

export const IntrospectAmbossSchema = z.object({}).strict();
