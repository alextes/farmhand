import { A, pipe, TE } from "./deps.ts";
import * as M from "https://deno.land/x/fun@v1.0.0/map.ts";
import { BadResponse, DecodeError, FetchError } from "./errors.ts";
import { milisFromHours } from "./duration.ts";

type RawCoinId = {
  id: string;
  symbol: string;
  name: string;
};

type IdMap = Map<string, string[]>;

type IdFetchError = BadResponse | DecodeError | FetchError;

type UnknownSymbol = { type: "UnknownSymbol"; error: Error };
export type GetIdError = IdFetchError | UnknownSymbol;

const oneHourInMilis = milisFromHours(1);
let cachedIdMap: IdMap = M.empty();

export const fetchCoinGeckoIdMap = (): TE.TaskEither<IdFetchError, IdMap> => (
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
        setTimeout(() => {
          cachedIdMap = M.empty();
        }, oneHourInMilis);
        return map;
      },
      M.empty() as Map<string, string[]>,
    )),
    TE.map((idMap) => {
      cachedIdMap = idMap;
      return idMap;
    }),
  )
);

export const getIdBySymbol = (
  symbol: string,
): TE.TaskEither<GetIdError, string> => {
  const cValue = cachedIdMap.get(symbol);
  if (cValue !== undefined) {
    return TE.right(cValue[0]);
  }

  return pipe(
    fetchCoinGeckoIdMap(),
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
