import { LRU } from "./deps.ts";
import * as A from "https://deno.land/x/fun@v1.0.0/array.ts";
import { pipe } from "https://deno.land/x/fun@v1.0.0/fns.ts";
import * as M from "https://deno.land/x/fun@v1.0.0/map.ts";

type RawCoinId = {
  id: string;
  symbol: string;
  name: string;
};

type IdMap = Map<string, string[]>;

const twentyFourHoursInMs = 86400000;
const idMapCache = new LRU<IdMap>({ capacity: 1, stdTTL: twentyFourHoursInMs });
const idMapKey = "idMapKey";

export const fetchCoinGeckoIdMap = async (): Promise<IdMap> => {
  const cValue = idMapCache.get(idMapKey);
  if (cValue !== undefined) {
    return cValue;
  }

  const res = await fetch("https://api.coingecko.com/api/v3/coins/list");
  if (res.status !== 200) {
    const errorText = `coingecko bad response ${res.status} ${res.statusText}`;
    throw new Error(errorText);
  }

  const rawIds: RawCoinId[] = await res.json();
  const idMap = pipe(
    rawIds,
    A.reduce((map, rawId: RawCoinId) => {
      const ids = map.get(rawId.symbol) || [];
      map.set(rawId.symbol, [...ids, rawId.id]);
      return map;
    }, M.empty() as Map<string, string[]>),
  );

  idMapCache.set(idMapKey, idMap);
  return idMap;
};
