import {
  Application,
  Context,
  Router,
} from "https://deno.land/x/oak@v7.3.0/mod.ts";
import { format, subDays } from "https://deno.land/x/date_fns@v2.15.0/index.js";
import { LRU } from "https://deno.land/x/velo@0.1.5/mod.ts";
import "https://deno.land/x/dotenv/load.ts";

type RawCoinId = {
  id: string;
  symbol: string;
  name: string;
};

type IdMap = Partial<Record<string, string | undefined>>;

const hourInMs = 3600000;
const idMapCache = new LRU({ capacity: 1, stdTTL: hourInMs });
const idMapKey = "idMapKey";

const fetchCoinGeckoIdMap = async (): Promise<IdMap> => {
  if (idMapCache.has(idMapKey)) {
    return idMapCache.get(idMapKey);
  }

  const res = await fetch("https://api.coingecko.com/api/v3/coins/list");
  const coinGeckoRawIds = await res.json();
  const coinGeckoIdMap = coinGeckoRawIds.reduce(
    (obj: Record<string, string>, rawId: RawCoinId) => {
      obj[rawId.symbol] = rawId.id;
      return obj;
    },
    {},
  );

  idMapCache.set(idMapKey, coinGeckoIdMap);
  return coinGeckoIdMap;
};

type Price = {
  usd: number;
  btc: number;
  eth: number;
};

const tenMinInMs = 600000;
const priceCache = new LRU({ capacity: 200, stdTTL: tenMinInMs });

const getPricesById = async (id: string): Promise<Price> => {
  const cacheKey = `price-${id}`;
  if (priceCache.has(cacheKey)) {
    return priceCache.get(cacheKey);
  }

  const uri =
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd%2Cbtc%2Ceth`;
  const res = await fetch(uri);
  const prices = await res.json();

  priceCache.set(cacheKey, prices[id]);

  return prices[id];
};

const priceChangeCache = new LRU({ capacity: 100000 });

const getPriceChange = async (id: string, daysAgo: number) => {
  const cacheKey = `priceChange-${id}-${daysAgo}`;
  if (priceChangeCache.has(cacheKey)) {
    return priceChangeCache.get(cacheKey);
  }

  const now = new Date();
  const historicDate = subDays(now, daysAgo);
  const uri = `https://api.coingecko.com/api/v3/coins/${id}/history?date=${
    format(historicDate, "dd-MM-yyyy", {})
  }`;
  const res = await fetch(uri);
  const history = await res.json();

  if (history.error !== undefined) {
    throw new Error(history.error);
  }

  const historicPrice = {
    usd: history.market_data.current_price.usd,
    btc: history.market_data.current_price.btc,
    eth: history.market_data.current_price.eth,
  };

  const currentPrice = await getPricesById(id);

  const priceChange = {
    usd: currentPrice.usd / historicPrice.usd - 1,
    btc: currentPrice.btc / historicPrice.btc - 1,
    eth: currentPrice.eth / historicPrice.eth - 1,
  };

  priceChangeCache.set(cacheKey, priceChange);

  return priceChange;
};

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
