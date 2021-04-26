export const decodeCoinGeckoRes = async (
  res: Response,
): Promise<unknown> => {
  if (res.status !== 200) {
    const errorText = `coingecko bad response ${res.status} ${res.statusText}`;
    try {
      const jsonError = await res.json();
      throw new Error(`${errorText} ${jsonError}`);
    } catch {
      // No error on body to decode, that's fine.
    }

    try {
      const textError = await res.text();
      throw new Error(`${errorText} ${textError}`);
    } catch {
      // No error on body to decode, that's fine.
    }

    throw new Error(errorText);
  }

  return res.json();
};
