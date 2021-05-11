import { assertEquals } from "https://deno.land/std@0.95.0/testing/asserts.ts";
import { superoak } from "https://deno.land/x/superoak@4.2.0/mod.ts";
import { LRU } from "./deps.ts";
import { makeApp } from "./server.ts";

// We use a global cache with TTL timers. As we don't clear the timers we leak
// async ops. Deno tests notices this, judging are test dangerously
// non-deterministic, and fails the test. Therefore we mock the cache.

const app = makeApp({
  idMapCache: new LRU({ capacity: 0 }),
  priceCache: new LRU({ capacity: 0 }),
  historicPriceCache: new LRU({ capacity: 0 }),
});

Deno.test("returns price", async () => {
  const request = await superoak(app);
  await request.get("/coin/btc/price").expect((res) => {
    assertEquals(typeof res.body.usd, "number");
    assertEquals(typeof res.body.btc, "number");
    assertEquals(typeof res.body.eth, "number");
  });
});

Deno.test("returns price change", async () => {
  const request = await superoak(app);
  await request.post("/coin/btc/price-change/").send({
    daysAgo: 4,
    base: "usd",
  }).expect((res) => {
    assertEquals(typeof res.body.priceChange, "number");
  });
});
