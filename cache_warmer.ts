import { A, pipe, S, T, TE } from "./deps.ts";
import * as Id from "./id.ts";
import { IdMapCache } from "./id.ts";
import * as PriceChange from "./price_change.ts";
import { HistoricPriceCache } from "./price_change.ts";

const commonSymbols = [
  "1inch",
  "aave",
  "alcx",
  "alpha",
  "alusd",
  "badger",
  "bal",
  "bank",
  "bcp",
  "bgov",
  "bnb",
  "bnt",
  "bscx",
  "btc",
  "busd",
  "codex",
  "comp",
  "crv",
  "dai",
  "defi++",
  "dpi",
  "egt",
  "eth",
  "ftm",
  "ftt",
  "fwb",
  "inv",
  "link",
  "lqty",
  "lrc",
  "lusd",
  "mkr",
  "mln",
  "mta",
  "nftx",
  "ohm",
  "ren",
  "rgt",
  "rook",
  "snx",
  "steel",
  "sushi",
  "uma",
  "uni",
  "wasabi",
  "white",
  "woo",
  "xsushi",
  "yfi",
  "yve-crvdao",
];

const traverseTE = A.traverse(TE.Applicative);
const sequenceTE = S.createSequenceTuple(TE.Apply);

export const warmUpCache = async (
  idMapCache: IdMapCache,
  historicPriceCache: HistoricPriceCache,
) => {
  await pipe(
    commonSymbols,
    traverseTE((symbol) =>
      pipe(
        Id.getIdBySymbol(idMapCache, symbol),
        TE.mapLeft((err) => {
          throw err;
        }),
        TE.chain((id) =>
          sequenceTE(
            PriceChange.getPriceChange(historicPriceCache, id, "usd", 180),
            PriceChange.getPriceChange(historicPriceCache, id, "btc", 180),
          )
        ),
      )
    ),
    T.delay(2000),
  )();
};
