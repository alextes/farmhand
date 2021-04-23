import { LRU } from "./deps.ts";

export type Price = {
  usd: number;
  btc: number;
  eth: number;
};

const tenMinInMs = 600000;
const priceCache = new LRU({ capacity: 200, stdTTL: tenMinInMs });
export const getPricesById = async (id: string): Promise<Price> => {
  const cacheKey = `price-${id}`;
  if (priceCache.has(cacheKey)) {
    return priceCache.get(cacheKey);
  }

  const uri =
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd%2Cbtc%2Ceth`;
  const res = await fetch(uri);

  if (res.status !== 200) {
    const err = await res.text();
    console.error(
      `coingecko bad response, ${res.status} ${res.statusText} - ${err}`,
    );
    throw new Error(err);
  }

  const prices = await res.json();

  priceCache.set(cacheKey, prices[id]);

  return prices[id];
};
