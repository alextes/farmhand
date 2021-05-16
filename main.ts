import { LRU, M } from "./deps.ts";
import { milisFromHours } from "./duration.ts";
import { makeApp } from "./server.ts";
import * as Id from "./id.ts";

const hostname = Deno.env.get("ENV") === "dev" ? "localhost" : "0.0.0.0";
const oneHourInMs = milisFromHours(1);
const fourHoursInMilis = milisFromHours(4);
const idMapCache = new LRU({ capacity: 1, stdTTL: fourHoursInMilis });
idMapCache.set(Id.idMapKey, M.empty());
const app = makeApp({
  idMapCache,
  priceCache: new LRU({ capacity: 1000, stdTTL: oneHourInMs }),
  historicPriceCache: new LRU({ capacity: 100000 }),
});
await app.listen({ hostname, port: 8080 });
