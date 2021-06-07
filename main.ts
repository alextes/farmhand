import { LRU, M } from "./deps.ts";
import { milisFromHours } from "./duration.ts";
import { makeApp } from "./server.ts";
import * as Id from "./id.ts";
import * as CacheWarmer from "./cache_warmer.ts";

const hostname = Deno.env.get("ENV") === "dev" ? "localhost" : "0.0.0.0";
const idMapCache = new LRU({ capacity: 1, stdTTL: milisFromHours(4) });
idMapCache.set(Id.idMapKey, M.empty());
const historicPriceCache = new LRU({ capacity: 100000 });
const app = makeApp({
  idMapCache,
  priceCache: new LRU({ capacity: 1000, stdTTL: milisFromHours(4) }),
  historicPriceCache: historicPriceCache,
});

CacheWarmer.warmUpCache(idMapCache, historicPriceCache).then(() => {
  console.log("cache warm");
}).catch((error: unknown) => {
  console.error(error);
});

await app.listen({ hostname, port: 8080 });
