export type WatchlistItem = {
  id: number;
  symbol: string;
  name: string;
  market: string;
};

export type WeightEntry = {
  id: number;
  date: string;
  targetWeight: number | null;
  actualWeight: number | null;
  diff: number | null;
};

export type RunningEntry = {
  id: number;
  date: string;
  distanceKm: number;
  durationMinutes: number;
  avgPaceSeconds: number;
  note: string | null;
  source: string;
  externalId: string | null;
};

export type RunningSummary = {
  totalDistanceKm: number;
  averagePaceSeconds: number | null;
};

export type DashboardSnapshot = {
  watchlist: WatchlistItem[];
  weights: WeightEntry[];
  runs: RunningEntry[];
  runningSummary: {
    week: RunningSummary;
    month: RunningSummary;
    year: RunningSummary;
  };
};

export type HourlyWeather = {
  time: string;
  temperature: number;
  precipitationProbability: number | null;
  skyLabel: string;
};

export type DailyWeather = {
  dayLabel: string;
  summary: string;
  minTemp: number | null;
  maxTemp: number | null;
  rainProbability: number | null;
};

export type WeatherResponse = {
  source: string;
  locationName: string;
  generatedAt: string;
  current: {
    temperature: number | null;
    skyLabel: string;
    rainTypeLabel: string;
  };
  hourly: HourlyWeather[];
  weekly: DailyWeather[];
  note?: string;
};

export type Quote = {
  symbol: string;
  name: string;
  market: string;
  price: number;
  change: number;
  changeRate: number;
};

export type IndexQuote = {
  name: string;
  price: number;
  change: number;
  changeRate: number;
};

export type MarketResponse = {
  source: string;
  generatedAt: string;
  indices: IndexQuote[];
  watchlist: Quote[];
  note?: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  isAllDay: boolean;
};

export type CalendarResponse = {
  source: string;
  generatedAt: string;
  date: string;
  events: CalendarEvent[];
  note?: string;
};

export type StravaStatusResponse = {
  connected: boolean;
  athleteId: string | null;
  note?: string;
};
