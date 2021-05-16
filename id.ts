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

export const getIdBySymbol = (
  idMapCache: IdMapCache,
  symbol: string,
): TE.TaskEither<GetIdError, string> => {
  const cValue = idMapCache.get(idMapKey)!.get(symbol);
  if (cValue !== undefined) {
    // Same problem as below but now we cached the ids.
    if (symbol === "uni") {
      return TE.right("uniswap");
    }

    if (symbol === "ftt") {
      return TE.right("ftx-token");
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

      if (symbol === "uni") {
        return TE.right("uniswap");
      }

      if (symbol === "ftt") {
        return TE.right("ftx-token");
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
