import {
  Application,
  Context,
  Router,
} from "https://deno.land/x/oak@v7.3.0/mod.ts";
import "https://deno.land/x/dotenv/load.ts";
import { getPricesById } from "./price.ts";
import { fetchCoinGeckoIdMap } from "./id.ts";
import { getPriceChange } from "./price_change.ts";

const app = new Application();

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

app.use(handleError);

app.use(async (ctx, next) => {
  await next();
  const rt = ctx.response.headers.get("X-Response-Time");
  if (Deno.env.get("ENV") === "dev") {
    console.log(`${ctx.request.method} ${ctx.request.url} - ${rt}`);
  }
});

app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  ctx.response.headers.set("X-Response-Time", `${ms}ms`);
});

const router = new Router();

router.get("/coin/:symbol/price", async (context) => {
  const symbol = context.params.symbol!;

  const idMap = await fetchCoinGeckoIdMap();
  const id = idMap[symbol];

  if (id === undefined) {
    context.response.status = 404;
    context.response.body = `no coingecko symbol ticker found for ${symbol}`;
    return;
  }

  const prices = await getPricesById(id);
  context.response.body = prices;
});

router.get("/coin/:symbol/price-change/:daysAgo", async (context) => {
  const symbol = context.params.symbol!;
  const daysAgo = Number(context.params.daysAgo);

  const idMap = await fetchCoinGeckoIdMap();
  const id = idMap[symbol];

  if (id === undefined) {
    context.response.status = 404;
    context.response.body = `no coingecko symbol ticker found for ${symbol}`;
    return;
  }

  const historicPrices = await getPriceChange(id, daysAgo);
  context.response.body = historicPrices;
});

app.use(router.routes());

app.addEventListener("listen", ({ hostname, port }) => {
  console.log(
    `Listening on ${hostname ?? "localhost"}:${port}`,
  );
});

await app.listen({ port: 8080 });
