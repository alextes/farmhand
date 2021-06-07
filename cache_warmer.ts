import { E, pipe, T } from "./deps.ts";
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
  "Xsushi",
  "yfi",
  "yve-crvdao",
];

const getOrThrow = <A>(e: E.Either<{ error: { message: string } }, A>) => {
  if (E.isLeft(e)) {
    throw e.left;
  }

  return (e as { right: A }).right;
};

export const warmUpCache = async (
  idMapCache: IdMapCache,
  historicPriceCache: HistoricPriceCache,
) => {
  for (const symbol of commonSymbols) {
    const id = await pipe(
      Id.getIdBySymbol(idMapCache, symbol),
      T.map(getOrThrow),
    )();

    await pipe(
      PriceChange.getPriceChange(historicPriceCache, id, "usd", 180),
      T.map(getOrThrow),
    )();

    await pipe(
      PriceChange.getPriceChange(historicPriceCache, id, "btc", 180),
      T.map(getOrThrow),
    )();

    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
  }
};
