import { format, subDays } from "https://deno.land/x/date_fns@v2.15.0/index.js";
import { LRU } from "https://deno.land/x/velo@0.1.5/mod.ts";
import { getPricesById } from "./price.ts";

const priceChangeCache = new LRU({ capacity: 100000 });

export const getPriceChange = async (id: string, daysAgo: number) => {
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
