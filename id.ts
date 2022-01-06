import { A, LRU, M, pipe, TE } from "./deps.ts";
import { BadResponse, DecodeError, FetchError } from "./errors.ts";

type RawCoinId = {
  id: string;
  symbol: string;
  name: string;
};

type IdMap = Map<string, string[]>;
export type IdMapCache = LRU<IdMap>;

type IdFetchError = BadResponse | DecodeError | FetchError;

type UnknownSymbol = { type: "UnknownSymbol"; error: Error };
export type GetIdError = IdFetchError | UnknownSymbol;

export const idMapKey = "id-map-key";

export const fetchCoinGeckoIdMap = (
  cache: IdMapCache,
): TE.TaskEither<IdFetchError, IdMap> => (
  pipe(
    () => fetch("https://api.coingecko.com/api/v3/coins/list"),
    TE.fromFailableTask((error) => ({
      type: "FetchError" as const,
      error: error as Error,
    })),
    TE.chain((res): TE.TaskEither<IdFetchError, RawCoinId[]> => {
      if (res.status !== 200) {
        return TE.left({
          type: "BadResponse" as const,
          error: new Error(
            `coingecko bad response ${res.status} ${res.statusText}`,
          ),
          status: res.status,
        });
      }

      return pipe(
        () => res.json() as Promise<RawCoinId[]>,
        TE.fromFailableTask((error) => ({
          type: "DecodeError" as const,
          error: error as Error,
        })),
      );
    }),
    TE.map(A.reduce(
      (map, rawId: RawCoinId) => {
        const ids = map.get(rawId.symbol) || [];
        map.set(rawId.symbol, [...ids, rawId.id]);
        return map;
      },
      M.empty() as Map<string, string[]>,
    )),
    TE.map((idMap) => {
      cache.set(idMapKey, idMap);
      return idMap;
    }),
  )
);

const overrides: Record<string, string> = {
  "boo": "spookyswap",
  "comp": "compound-governance-token",
  "ftt": "ftx-token",
  "uni": "uniswap",
};

export const getIdBySymbol = (
  idMapCache: IdMapCache,
  symbol: string,
): TE.TaskEither<GetIdError, string> => {
  let mIdMap = idMapCache.get(idMapKey);
  if (mIdMap === undefined) {
    // When the TTL of the IdMap expires we need to reinitialize.
    mIdMap = M.empty();
    idMapCache.set(idMapKey, mIdMap);
  }
  const cValue = mIdMap.get(symbol);
  if (cValue !== undefined) {
    // Same problem as below but now we cached the ids.
    if (Object.keys(overrides).includes(symbol)) {
      return TE.right(overrides[symbol]);
    }

    return TE.right(cValue[0]);
  }

  return pipe(
    fetchCoinGeckoIdMap(idMapCache),
    TE.chain((idMap): TE.TaskEither<GetIdError, string> => {
      // Some symbols have multiple ids. We currently return the first matching
      // id CoinGecko gave us. For some symbols we know almost certainly that
      // would be the wrong one. As a workaround we return the more likely id
      // here.

      if (Object.keys(overrides).includes(symbol)) {
        return TE.right(overrides[symbol]);
      }

      const mIds = idMap.get(symbol);
      if (mIds === undefined) {
        const errorText = `CoinGecko has no ids for symbol ${symbol}`;
        return TE.left({
          type: "UnknownSymbol",
          error: new Error(errorText),
        });
      }

      return TE.right(mIds[0]);
    }),
  );
};

// TODO: get token by symbol, return id with highest market cap
