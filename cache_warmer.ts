import { E, pipe, T } from "./deps.ts";
import * as Id from "./id.ts";
import { IdMapCache } from "./id.ts";
import * as PriceChange from "./price_change.ts";
import { HistoricPriceCache } from "./price_change.ts";
const commonSymbols = [
  "1INCH",
  "AAVE",
  "ALCX",
  "ALPHA",
  "ALUSD",
  "BADGER",
  "BAL",
  "BANK",
  "BCP",
  "BGOV",
  "BNB",
  "BNT",
  "BSCX",
  "BTC",
  "BUSD",
  "CODEX",
  "COMP",
  "CRV",
  "DAI",
  "DEFI++",
  "DPI",
  "EGT",
  "ETH",
  "FTM",
  "FTT",
  "FWB",
  "INV",
  "LINK",
  "LQTY",
  "LRC",
  "LUSD",
  "MKR",
  "MLN",
  "MTA",
  "NFTX",
  "OHM",
  "REN",
  "RGT",
  "ROOK",
  "SNX",
  "STEEL",
  "SUSHI",
  "UMA",
  "UNI",
  "WASABI",
  "WHITE",
  "WOO",
  "xSUSHI",
  "YFI",
  "YVE-CRVDAO",
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
