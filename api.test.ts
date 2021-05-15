import { assertEquals } from "https://deno.land/std@0.95.0/testing/asserts.ts";
import { superoak } from "https://deno.land/x/superoak@4.2.0/mod.ts";
import { E, LRU, pipe, TE } from "./deps.ts";
import { makeApp } from "./server.ts";
import * as Id from "./id.ts";

// We use a global cache with TTL timers. As we don't clear the timers we leak
// async ops. Deno tests notices this, judging are test dangerously
// non-deterministic, and fails the test. Therefore we mock the cache.

const app = makeApp({
  priceCache: new LRU({ capacity: 0 }),
  historicPriceCache: new LRU({ capacity: 0 }),
});

const getOrThrow = <A>(either: E.Either<unknown, A>) => {
  if (either.tag === "Right") {
    return either.right;
  }

  throw either.left;
};

Deno.test("gets an id by symbol", async () => {
  const id = await pipe(
    Id.getIdBySymbol("eth"),
    (te) => te().then(getOrThrow),
  );

  assertEquals(id, "ethereum");
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
