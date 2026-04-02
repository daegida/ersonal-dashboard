import { DailyWeather, HourlyWeather, WeatherResponse } from "./types";

const SKY_LABELS: Record<string, string> = {
  "1": "맑음",
  "3": "구름 많음",
  "4": "흐림"
};

const RAIN_LABELS: Record<string, string> = {
  "0": "강수 없음",
  "1": "비",
  "2": "비/눈",
  "3": "눈",
  "4": "소나기"
};

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function pickShortBase(now = new Date()) {
  const candidates = ["2300", "2000", "1700", "1400", "1100", "0800", "0500", "0200"];
  const local = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hhmm = `${String(local.getUTCHours()).padStart(2, "0")}${String(local.getUTCMinutes()).padStart(2, "0")}`;

  for (const candidate of candidates) {
    if (hhmm >= candidate) {
      return { baseDate: formatDate(local), baseTime: candidate };
    }
  }

  const yesterday = new Date(local);
  yesterday.setUTCDate(local.getUTCDate() - 1);
  return { baseDate: formatDate(yesterday), baseTime: "2300" };
}

function pickMidBase(now = new Date()) {
  const local = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hhmm = `${String(local.getUTCHours()).padStart(2, "0")}${String(local.getUTCMinutes()).padStart(2, "0")}`;
  const baseTime = hhmm >= "1800" ? "1800" : "0600";

  if (hhmm >= "0600") {
    return `${formatDate(local)}${baseTime}`;
  }

  const yesterday = new Date(local);
  yesterday.setUTCDate(local.getUTCDate() - 1);
  return `${formatDate(yesterday)}1800`;
}

async function fetchJson(url: URL) {
  const response = await fetch(url, { next: { revalidate: 1800 } });
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  return response.json();
}

function toItemMap(items: Array<Record<string, string>>) {
  const map = new Map<string, Record<string, string>>();
  for (const item of items) {
    map.set(`${item.fcstDate}-${item.fcstTime}-${item.category}`, item);
  }
  return map;
}

function buildHourly(items: Array<Record<string, string>>) {
  const grouped = new Map<string, Partial<HourlyWeather & { sky: string; pty: string }>>();

  for (const item of items) {
    const key = `${item.fcstDate}-${item.fcstTime}`;
    const prev = grouped.get(key) ?? {};

    if (item.category === "TMP") prev.temperature = Number(item.fcstValue);
    if (item.category === "POP") prev.precipitationProbability = Number(item.fcstValue);
    if (item.category === "SKY") prev.sky = item.fcstValue;
    if (item.category === "PTY") prev.pty = item.fcstValue;

    grouped.set(key, prev);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 12)
    .map(([key, value]) => {
      const [, time] = key.split("-");
      return {
        time: `${time.slice(0, 2)}시`,
        temperature: value.temperature ?? 0,
        precipitationProbability: value.precipitationProbability ?? null,
        skyLabel:
          value.pty && value.pty !== "0" ? RAIN_LABELS[value.pty] ?? "강수" : SKY_LABELS[value.sky ?? "1"] ?? "맑음"
      };
    });
}

function buildWeekly(shortItems: Array<Record<string, string>>, midTa: Record<string, string>, midLand: Record<string, string>) {
  const grouped = new Map<string, { temps: number[]; pops: number[]; sky?: string; pty?: string }>();

  for (const item of shortItems) {
    const prev = grouped.get(item.fcstDate) ?? { temps: [], pops: [] };
    if (item.category === "TMP") prev.temps.push(Number(item.fcstValue));
    if (item.category === "POP") prev.pops.push(Number(item.fcstValue));
    if (item.category === "SKY" && !prev.sky) prev.sky = item.fcstValue;
    if (item.category === "PTY" && !prev.pty) prev.pty = item.fcstValue;
    grouped.set(item.fcstDate, prev);
  }

  const shortDays: DailyWeather[] = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 3)
    .map(([date, data]) => {
      const day = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`);
      return {
        dayLabel: `${day.getMonth() + 1}/${day.getDate()} (${["일", "월", "화", "수", "목", "금", "토"][day.getDay()]})`,
        summary:
          data.pty && data.pty !== "0" ? RAIN_LABELS[data.pty] ?? "강수" : SKY_LABELS[data.sky ?? "1"] ?? "맑음",
        minTemp: data.temps.length ? Math.min(...data.temps) : null,
        maxTemp: data.temps.length ? Math.max(...data.temps) : null,
        rainProbability: data.pops.length ? Math.max(...data.pops) : null
      };
    });

  const nextDays: DailyWeather[] = [];
  for (let day = 4; day <= 7; day += 1) {
    const minTemp = Number(midTa[`taMin${day}`]);
    const maxTemp = Number(midTa[`taMax${day}`]);
    const amRain = Number(midLand[`rnSt${day}Am`]);
    const pmRain = Number(midLand[`rnSt${day}Pm`]);
    const amSky = midLand[`wf${day}Am`] || "";
    const pmSky = midLand[`wf${day}Pm`] || "";
    const target = new Date();
    target.setDate(target.getDate() + day - 1);

    nextDays.push({
      dayLabel: `${target.getMonth() + 1}/${target.getDate()} (${["일", "월", "화", "수", "목", "금", "토"][target.getDay()]})`,
      summary: `${amSky} / ${pmSky}`.trim(),
      minTemp: Number.isNaN(minTemp) ? null : minTemp,
      maxTemp: Number.isNaN(maxTemp) ? null : maxTemp,
      rainProbability: Number.isNaN(Math.max(amRain, pmRain)) ? null : Math.max(amRain, pmRain)
    });
  }

  return [...shortDays, ...nextDays].slice(0, 7);
}

export async function getWeather(): Promise<WeatherResponse> {
  const serviceKey = process.env.KMA_SERVICE_KEY;
  const locationName = process.env.KMA_LOCATION_NAME || "서울 강남구";

  if (!serviceKey) {
    return {
      source: "demo",
      locationName,
      generatedAt: new Date().toISOString(),
      current: { temperature: 17, skyLabel: "맑음", rainTypeLabel: "강수 없음" },
      hourly: [
        { time: "09시", temperature: 17, precipitationProbability: 0, skyLabel: "맑음" },
        { time: "10시", temperature: 18, precipitationProbability: 0, skyLabel: "맑음" },
        { time: "11시", temperature: 19, precipitationProbability: 0, skyLabel: "구름 많음" },
        { time: "12시", temperature: 20, precipitationProbability: 10, skyLabel: "구름 많음" },
        { time: "13시", temperature: 21, precipitationProbability: 20, skyLabel: "흐림" },
        { time: "14시", temperature: 21, precipitationProbability: 30, skyLabel: "흐림" }
      ],
      weekly: [
        { dayLabel: "4/2 (목)", summary: "맑음", minTemp: 11, maxTemp: 21, rainProbability: 0 },
        { dayLabel: "4/3 (금)", summary: "구름 많음", minTemp: 10, maxTemp: 19, rainProbability: 20 },
        { dayLabel: "4/4 (토)", summary: "흐림", minTemp: 12, maxTemp: 18, rainProbability: 40 },
        { dayLabel: "4/5 (일)", summary: "흐림 / 비", minTemp: 11, maxTemp: 16, rainProbability: 60 },
        { dayLabel: "4/6 (월)", summary: "맑음 / 구름 많음", minTemp: 9, maxTemp: 17, rainProbability: 20 },
        { dayLabel: "4/7 (화)", summary: "맑음", minTemp: 8, maxTemp: 18, rainProbability: 10 },
        { dayLabel: "4/8 (수)", summary: "구름 많음", minTemp: 9, maxTemp: 19, rainProbability: 20 }
      ],
      note: "KMA_SERVICE_KEY가 없어 데모 데이터를 표시 중입니다."
    };
  }

  const gridX = process.env.KMA_GRID_X || "60";
  const gridY = process.env.KMA_GRID_Y || "127";
  const regionId = process.env.KMA_MID_REGION_ID || "11B00000";
  const stnId = process.env.KMA_MID_STN_ID || "109";

  const shortBase = pickShortBase();
  const shortUrl = new URL("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst");
  shortUrl.searchParams.set("serviceKey", serviceKey);
  shortUrl.searchParams.set("pageNo", "1");
  shortUrl.searchParams.set("numOfRows", "1000");
  shortUrl.searchParams.set("dataType", "JSON");
  shortUrl.searchParams.set("base_date", shortBase.baseDate);
  shortUrl.searchParams.set("base_time", shortBase.baseTime);
  shortUrl.searchParams.set("nx", gridX);
  shortUrl.searchParams.set("ny", gridY);

  const midBase = pickMidBase();
  const taUrl = new URL("https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa");
  taUrl.searchParams.set("serviceKey", serviceKey);
  taUrl.searchParams.set("pageNo", "1");
  taUrl.searchParams.set("numOfRows", "10");
  taUrl.searchParams.set("dataType", "JSON");
  taUrl.searchParams.set("regId", regionId);
  taUrl.searchParams.set("tmFc", midBase);

  const landUrl = new URL("https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst");
  landUrl.searchParams.set("serviceKey", serviceKey);
  landUrl.searchParams.set("pageNo", "1");
  landUrl.searchParams.set("numOfRows", "10");
  landUrl.searchParams.set("dataType", "JSON");
  landUrl.searchParams.set("regId", regionId);
  landUrl.searchParams.set("tmFc", midBase);

  const [shortJson, taJson, landJson] = await Promise.all([fetchJson(shortUrl), fetchJson(taUrl), fetchJson(landUrl)]);
  const shortItems = shortJson.response?.body?.items?.item ?? [];
  const midTa = taJson.response?.body?.items?.item?.[0] ?? {};
  const midLand = landJson.response?.body?.items?.item?.[0] ?? {};

  const hourly = buildHourly(shortItems);
  const weekly = buildWeekly(shortItems, midTa, midLand);
  const itemMap = toItemMap(shortItems);
  const currentHour = hourly[0];
  const firstDate = shortItems[0]?.fcstDate;
  const firstTime = shortItems[0]?.fcstTime;
  const pty = firstDate && firstTime ? itemMap.get(`${firstDate}-${firstTime}-PTY`)?.fcstValue ?? "0" : "0";

  return {
    source: "kma",
    locationName,
    generatedAt: new Date().toISOString(),
    current: {
      temperature: currentHour?.temperature ?? null,
      skyLabel: currentHour?.skyLabel ?? "정보 없음",
      rainTypeLabel: RAIN_LABELS[pty] ?? "강수 없음"
    },
    hourly,
    weekly
  };
}
