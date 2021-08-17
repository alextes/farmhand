import * as CacheWarmer from "./cache_warmer.ts";
import * as Id from "./id.ts";
import * as Log from "./log.ts";
import { Application, Middleware, Router } from "./deps.ts";
import { LRU, M } from "./deps.ts";
import * as CoinData from "./coin_data.ts";
import * as Price from "./price.ts";
import * as PriceChange from "./price_change.ts";
import * as Duration from "./duration.ts";
import type { State } from "./middleware_state.ts";

const handleError: Middleware = async (
  context,
  next,
) => {
  try {
    await next();
  } catch (err) {
    Log.error(String(err), { err });
    context.response.status = 500;
    context.response.body = { msg: err.message };
  }
};

export const makeApp = (state: State) => {
  const app = new Application({ state });

  app.use(handleError);

  if (Deno.env.get("ENV") === "dev") {
    app.use(async (ctx, next) => {
      await next();
      const rt = ctx.response.headers.get("X-Response-Time");
      Log.debug(`${ctx.request.method} ${ctx.request.url} - ${rt}`);
    });

    app.use(async (ctx, next) => {
      const start = Date.now();
      await next();
      const ms = Date.now() - start;
      ctx.response.headers.set("X-Response-Time", `${ms}ms`);
    });
  }

  const router = new Router();

  router.post("/coin/:symbol/price", Price.handleGetPrice);

  router.post("/coin/:symbol/price-change", PriceChange.handleGetPriceChange);

  router.post("/coin-data", CoinData.handleGetCoinData);

  app.use(router.routes());

  app.addEventListener("listen", ({ hostname, port }) => {
    Log.info(
      `listening on ${hostname ?? "localhost"}:${port}`,
    );
  });

  return app;
};

const hostname = Deno.env.get("ENV") === "dev" ? "localhost" : "0.0.0.0";
const idMapCache = new LRU({ capacity: 1, stdTTL: Duration.milisFromHours(4) });
idMapCache.set(Id.idMapKey, M.empty());
const historicPriceCache = new LRU({ capacity: 100000 });

if (Deno.env.get("ENV") !== "dev") {
  CacheWarmer.warmUpCache(idMapCache, historicPriceCache).then(() => {
    Log.info("cache warm");
  }).catch((error: unknown) => {
    Log.error(String(error), { error });
  });
}
const app = makeApp({
  idMapCache,
  priceCache: new LRU({ capacity: 1000, stdTTL: Duration.milisFromHours(4) }),
  historicPriceCache: historicPriceCache,
});

await app.listen({ hostname, port: 8080 });
