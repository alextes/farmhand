import { LRU } from "./deps.ts";
import { milisFromHours } from "./duration.ts";
import { makeApp } from "./server.ts";

const hostname = Deno.env.get("ENV") === "dev" ? "localhost" : "0.0.0.0";
const oneHourInMs = milisFromHours(1);
const app = makeApp({
  priceCache: new LRU({ capacity: 200, stdTTL: oneHourInMs }),
  historicPriceCache: new LRU({ capacity: 100000 }),
});
await app.listen({ hostname, port: 8080 });
