import { assertEquals } from "https://deno.land/std@0.95.0/testing/asserts.ts";
import { getFreePort } from "https://deno.land/x/free_port@v1.2.0/mod.ts";
import * as Id from "./id.ts";
import { E, LRU, M, pipe, T } from "./deps.ts";
import { makeApp } from "./server.ts";

// We use a global cache with TTL timers. As we don't clear the timers we leak
// async ops. Deno tests notices this, judges our test dangerously
// non-deterministic, and fails the test. Therefore we mock the cache.

const mockIdMapCache = new LRU({ capacity: 1 });
mockIdMapCache.set(Id.idMapKey, M.empty());

const app = makeApp({
  idMapCache: mockIdMapCache,
  priceCache: new LRU({ capacity: 1 }),
  historicPriceCache: new LRU({ capacity: 0 }),
});

const getOrThrow = <A>(e: E.Either<unknown, A>) => {
  if (E.isRight(e)) {
    return e.right;
  } else {
    throw e.left;
  }
};

const postJson = <A>(url: string, body: Record<string, unknown>): Promise<A> =>
  fetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  ).then((res) => res.json());

const makeServer = async (): Promise<[() => Promise<void>, number]> => {
  const port = await getFreePort(8080);
  const controller = new AbortController();
  const { signal } = controller;
  const listening = app.listen({ hostname: "localhost", port, signal });

  const stopListening = () => {
    controller.abort();
    return listening;
  };

  return [stopListening, port];
};

Deno.test("gets an id by symbol", () =>
  pipe(
    Id.getIdBySymbol(mockIdMapCache, "eth"),
    T.map(getOrThrow),
    T.map((id) => {
      assertEquals(id, "ethereum");
    }),
  )());

Deno.test("returns price", async () => {
  const [stopListening, port] = await makeServer();

  const { price } = await postJson<{ price: number }>(
    `http://localhost:${port}/coin/btc/price`,
    { base: "usd" },
  );

  assertEquals(typeof price, "number");

  await stopListening();
});

Deno.test("returns price change", async () => {
  const [stopListening, port] = await makeServer();

  const { priceChange } = await postJson(
    `http://localhost:${port}/coin/btc/price-change/`,
    {
      daysAgo: 4,
      base: "usd",
    },
  );

  assertEquals(typeof priceChange, "number");

  await stopListening();
});

Deno.test("uses the override successfully", async () => {
  const [stopListening, port] = await makeServer();

  const { price } = await postJson<{ price: number }>(
    `http://localhost:${port}/coin/btc/price`,
    { base: "usd" },
  );

  assertEquals(typeof price, "number");

  await stopListening();
});

Deno.test("returns a price from cache without issues", async () => {
  const [stopListening, port] = await makeServer();

  await postJson<{ price: number }>(
    `http://localhost:${port}/coin/eth/price`,
    { base: "usd" },
  );
  const { price } = await postJson<{ price: number }>(
    `http://localhost:${port}/coin/eth/price`,
    { base: "usd" },
  );

  assertEquals(typeof price, "number");

  await stopListening();
});
