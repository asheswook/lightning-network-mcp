#!/usr/bin/env node

/**
 * lightning-mcp-server 직접 테스트
 * 사용법: node dist/test.js
 *
 * 각 서비스 함수를 직접 호출해서 응답 형식과 파싱 로직을 검증합니다.
 */

import * as amboss from "./services/amboss.js";
import * as oneml from "./services/oneml.js";
import * as lnplus from "./services/lnplus.js";

const ACINQ = "03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f";

async function test(name: string, fn: () => Promise<unknown>): Promise<boolean> {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${name}`);
  console.log("═".repeat(60));
  try {
    const start = Date.now();
    const result = await fn();
    const elapsed = Date.now() - start;
    console.log(`  ✅ 성공 (${elapsed}ms)`);
    console.log(JSON.stringify(result, null, 2).slice(0, 2000));
    if (JSON.stringify(result).length > 2000) console.log("  ... (truncated)");
    return true;
  } catch (err) {
    console.log(`  ❌ 실패: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function main() {
  console.log("lightning-mcp-server 테스트 시작\n");

  let passed = 0;
  let failed = 0;

  // ── Amboss ──
  if (await test("Amboss: getNode (ACINQ)", () => amboss.getNode(ACINQ))) passed++; else failed++;

  if (await test("Amboss: introspectSchema", () =>
    amboss.introspectSchema().then(s => `Schema length: ${s.length} chars`)
  )) passed++; else failed++;

  // ── 1ML ──
  if (await test("1ML: getNode (ACINQ)", () => oneml.getNode(ACINQ))) passed++; else failed++;

  if (await test("1ML: getTopNodes (capacity, top 5)", () =>
    oneml.getTopNodes("capacity", 5)
  )) passed++; else failed++;

  if (await test("1ML: getTopNodes (capacitychange, top 5)", () =>
    oneml.getTopNodes("capacitychange", 5)
  )) passed++; else failed++;

  // ── LN+ ──
  if (await test("LN+: getNode (ACINQ)", () => lnplus.getNode(ACINQ))) passed++; else failed++;

  if (await test("LN+: getNodesByRank (Gold+, limit 5)", () =>
    lnplus.getNodesByRank({ minRank: 8, limit: 5 })
  )) passed++; else failed++;

  if (await test("LN+: getNodesByRank (Iridium only, limit 5)", () =>
    lnplus.getNodesByRank({ minRank: 10, maxRank: 10, limit: 5 })
  )) passed++; else failed++;

  if (await test("LN+: getHighestRatedNodes (Platinum+, 5)", () =>
    lnplus.getHighestRatedNodes(9, 5)
  )) passed++; else failed++;

  if (await test("LN+: getSwaps (pending, triangle)", () =>
    lnplus.getSwaps({ status: "pending", shape: "triangle" })
  )) passed++; else failed++;

  if (await test("LN+: getSwaps (pending, xl size)", () =>
    lnplus.getSwaps({ status: "pending", size: "xl" })
  )) passed++; else failed++;

  // ── 결과 ──
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  결과: ${passed} 통과 / ${failed} 실패 (총 ${passed + failed})`);
  console.log("═".repeat(60));

  if (failed > 0) {
    console.log("\n실패한 테스트가 있습니다. 네트워크 연결과 API 응답 형식을 확인하세요.");
    console.log("스크래핑 기반 도구는 사이트 구조 변경 시 parseNodeListHtml 수정이 필요할 수 있습니다.");
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
