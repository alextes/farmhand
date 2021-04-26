import { LRU } from "./deps.ts";
import { decodeCoinGeckoRes } from "./coingecko.ts";

// Structure CoinGecko uses in simple price responses
type RawPrice = Record<string, Price>;

export type Price = {
  usd: number;
  btc: number;
  eth: number;
};

const oneHourInMs = 3600000;
const priceCache = new LRU({ capacity: 200, stdTTL: oneHourInMs });

export const getPricesById = async (
  id: string,
): Promise<Price> => {
  const cacheKey = `price-${id}`;
  if (priceCache.has(cacheKey)) {
    return priceCache.get(cacheKey);
  }

  const uri =
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd%2Cbtc%2Ceth`;
  const res = await fetch(uri);
  const prices = await decodeCoinGeckoRes(res) as RawPrice;

  priceCache.set(cacheKey, prices[id]);

  return prices[id];
};
