import { getWatchlist } from "./db";
import { MarketResponse, Quote } from "./types";

const demoQuotes: Record<string, { price: number; change: number; changeRate: number }> = {
  "005930": { price: 84600, change: 1200, changeRate: 1.44 },
  "035420": { price: 196300, change: -2700, changeRate: -1.36 },
  "247540": { price: 241000, change: 3500, changeRate: 1.47 }
};

async function getKisToken() {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  const existingToken = process.env.KIS_ACCESS_TOKEN;
  const baseUrl = process.env.KIS_BASE_URL || "https://openapi.koreainvestment.com:9443";

  if (existingToken) {
    return existingToken;
  }

  if (!appKey || !appSecret) {
    return null;
  }

  const response = await fetch(`${baseUrl}/oauth2/tokenP`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: appKey,
      appsecret: appSecret
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`KIS token error: ${response.status}`);
  }

  const json = await response.json();
  return json.access_token as string;
}

async function fetchKisQuote(symbol: string, token: string): Promise<Quote> {
  const appKey = process.env.KIS_APP_KEY;
  const appSecret = process.env.KIS_APP_SECRET;
  const baseUrl = process.env.KIS_BASE_URL || "https://openapi.koreainvestment.com:9443";

  if (!appKey || !appSecret) {
    throw new Error("KIS credentials are missing");
  }

  const response = await fetch(
    `${baseUrl}/uapi/domestic-stock/v1/quotations/inquire-price?fid_cond_mrkt_div_code=J&fid_input_iscd=${symbol}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: "FHKST01010100"
      },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(`KIS quote error: ${response.status}`);
  }

  const json = await response.json();
  const out = json.output ?? {};

  return {
    symbol,
    name: out.hts_kor_isnm || symbol,
    market: out.rprs_mrkt_kor_name || "KOR",
    price: Number(out.stck_prpr ?? 0),
    change: Number(out.prdy_vrss ?? 0) * (out.prdy_vrss_sign === "5" ? -1 : 1),
    changeRate: Number(out.prdy_ctrt ?? 0)
  };
}

export async function getMarketOverview(): Promise<MarketResponse> {
  const watchlist = await getWatchlist();
  const provider = process.env.MARKET_PROVIDER || "demo";

  if (provider === "kis") {
    try {
      const token = await getKisToken();
      if (!token) {
        throw new Error("KIS token is unavailable");
      }

      const quotes = await Promise.all(watchlist.map((item) => fetchKisQuote(item.symbol, token)));
      return {
        source: "kis",
        generatedAt: new Date().toISOString(),
        indices: [
          { name: "코스피", price: 2748.12, change: 8.41, changeRate: 0.31 },
          { name: "코스닥", price: 911.53, change: -5.27, changeRate: -0.57 }
        ],
        watchlist: quotes,
        note: "관심종목은 한국투자 Open API 실시간 시세입니다. 코스피/코스닥 지수는 초기 버전 예시값으로 표기합니다."
      };
    } catch (error) {
      return {
        source: "demo-fallback",
        generatedAt: new Date().toISOString(),
        indices: [
          { name: "코스피", price: 2748.12, change: 8.41, changeRate: 0.31 },
          { name: "코스닥", price: 911.53, change: -5.27, changeRate: -0.57 }
        ],
        watchlist: watchlist.map((item) => ({
          symbol: item.symbol,
          name: item.name,
          market: item.market,
          price: demoQuotes[item.symbol]?.price ?? 0,
          change: demoQuotes[item.symbol]?.change ?? 0,
          changeRate: demoQuotes[item.symbol]?.changeRate ?? 0
        })),
        note: `KIS 연동에 실패해 데모 데이터로 대체했습니다. ${(error as Error).message}`
      };
    }
  }

  return {
    source: "demo",
    generatedAt: new Date().toISOString(),
    indices: [
      { name: "코스피", price: 2748.12, change: 8.41, changeRate: 0.31 },
      { name: "코스닥", price: 911.53, change: -5.27, changeRate: -0.57 }
    ],
    watchlist: watchlist.map((item) => ({
      symbol: item.symbol,
      name: item.name,
      market: item.market,
      price: demoQuotes[item.symbol]?.price ?? 0,
      change: demoQuotes[item.symbol]?.change ?? 0,
      changeRate: demoQuotes[item.symbol]?.changeRate ?? 0
    })),
    note: "MARKET_PROVIDER=demo 상태입니다. 데모 목록에 없는 종목은 가격 대신 종목 정보만 표시됩니다. 한국투자 Open API 키를 넣으면 관심종목 실시간 시세 연동 구조로 확장할 수 있습니다."
  };
}
