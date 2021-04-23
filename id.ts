import { LRU } from "./deps.ts";

type RawCoinId = {
  id: string;
  symbol: string;
  name: string;
};

type IdMap = Partial<Record<string, string | undefined>>;

const hourInMs = 3600000;
const idMapCache = new LRU({ capacity: 1, stdTTL: hourInMs });
const idMapKey = "idMapKey";

export const fetchCoinGeckoIdMap = async (): Promise<IdMap> => {
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
