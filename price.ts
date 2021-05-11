import { RouterContext } from "https://deno.land/x/oak@v7.3.0/mod.ts";
import { RouteParams } from "https://deno.land/x/oak@v7.3.0/mod.ts";
import { LRU } from "./deps.ts";
import { fetchCoinGeckoIdMap } from "./id.ts";
import { State } from "./server.ts";

export type PriceCache = LRU<MultiPrice>;

/**
 * Structure CoinGecko uses in simple price responses
 */
type RawPrice = Record<string, MultiPrice>;

export type MultiPrice = {
  usd: number;
  btc: number;
  eth: number;
};

const fetchMultiPrice = async (
  priceCache: PriceCache,
  id: string,
): Promise<MultiPrice> => {
  const cacheKey = `price-${id}`;
  const cValue = priceCache.get(cacheKey);
  if (cValue !== undefined) {
    return cValue;
  }

  const uri =
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd%2Cbtc%2Ceth`;

  const res = await fetch(uri);
  if (res.status !== 200) {
    throw new Error(`coingecko bad response ${res.status} ${res.statusText}`);
  }

  const rawPrice: RawPrice = await res.json();

  priceCache.set(cacheKey, rawPrice[id]);
  return rawPrice[id];
};

export const handleGetPrice = async (
  ctx: RouterContext<RouteParams, State>,
) => {
  const symbol = ctx.params.symbol!;

  const idMap = await fetchCoinGeckoIdMap(ctx.app.state.idMapCache);

  const mId = idMap.get(symbol);
  if (mId === undefined) {
    ctx.response.status = 404;
    ctx.response.body = {
      msg: `no coingecko symbol ticker found for ${symbol}`,
    };
    return;
  }
  // TODO: pick the token with the highest market cap
  const id = mId[0];

  const price = await fetchMultiPrice(ctx.app.state.priceCache, id);
  ctx.response.body = price;
};
