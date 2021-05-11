import { LRU } from "./deps.ts";
import { makeApp } from "./server.ts";

const hostname = Deno.env.get("ENV") === "dev" ? "localhost" : "0.0.0.0";
const twentyFourHoursInMs = 86400000;
const oneHourInMs = 3600000;
const app = makeApp({
  idMapCache: new LRU({ capacity: 1, stdTTL: twentyFourHoursInMs }),
  priceCache: new LRU({ capacity: 200, stdTTL: oneHourInMs }),
  historicPriceCache: new LRU({ capacity: 100000 }),
});
await app.listen({ hostname, port: 8080 });
