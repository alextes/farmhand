import { LRU } from "./deps.ts";

/**
 * Structure CoinGecko uses in simple price responses
 */
type RawPrice = Record<string, MultiPrice>;

export type MultiPrice = {
  usd: number;
  btc: number;
  eth: number;
};

const oneHourInMs = 3600000;
const priceCache = new LRU<MultiPrice>({ capacity: 200, stdTTL: oneHourInMs });

export const getPricesById = async (
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
