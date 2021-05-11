import { Application, Context, Router } from "./deps.ts";
import { IdMapCache } from "./id.ts";
import { handleGetPrice, PriceCache } from "./price.ts";
import { handleGetPriceChange, HistoricPriceCache } from "./price_change.ts";

const handleError = async (
  context: Context,
  next: () => Promise<void>,
) => {
  try {
    await next();
  } catch (err) {
    console.error(err);
    context.response.status = 500;
    context.response.body = { msg: err.message };
  }
};

export type SharedState = {
  idMapCache: IdMapCache;
  priceCache: PriceCache;
  historicPriceCache: HistoricPriceCache;
};

export const makeApp = (sharedState: SharedState) => {
  const app = new Application();

  app.use(handleError);

  if (Deno.env.get("ENV") === "dev") {
    app.use(async (ctx, next) => {
      await next();
      const rt = ctx.response.headers.get("X-Response-Time");
      console.log(`${ctx.request.method} ${ctx.request.url} - ${rt}`);
    });

    app.use(async (ctx, next) => {
      const start = Date.now();
      await next();
      const ms = Date.now() - start;
      ctx.response.headers.set("X-Response-Time", `${ms}ms`);
    });
  }

  const router = new Router();

  router.get(
    "/coin/:symbol/price",
    (ctx) =>
      handleGetPrice(sharedState.idMapCache, sharedState.priceCache, ctx),
  );

  router.post(
    "/coin/:symbol/price-change/",
    (ctx) =>
      handleGetPriceChange(
        sharedState.historicPriceCache,
        sharedState.idMapCache,
        ctx,
      ),
  );

  app.use(router.routes());

  app.addEventListener("listen", ({ hostname, port }) => {
    console.log(
      `Listening on ${hostname ?? "localhost"}:${port}`,
    );
  });

  return app;
};
