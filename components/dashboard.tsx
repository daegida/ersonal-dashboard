"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { CalendarResponse, DashboardSnapshot, StravaStatusResponse, WeatherResponse } from "@/lib/types";
import { formatSigned, formatWeight } from "@/lib/format";

type Props = {
  initialData: DashboardSnapshot;
};

export function Dashboard({ initialData }: Props) {
  const [weights, setWeights] = useState(initialData.weights);
  const [runs, setRuns] = useState(initialData.runs);
  const [weather, setWeather] = useState<WeatherResponse | null>(null);
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [stravaStatus, setStravaStatus] = useState<StravaStatusResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    void Promise.all([
      fetch("/api/weather", { cache: "no-store" }).then((res) => res.json()),
      fetch("/api/calendar", { cache: "no-store" }).then((res) => res.json()),
      fetch("/api/strava/status", { cache: "no-store" }).then((res) => res.json())
    ]).then(([weatherData, calendarData, stravaData]) => {
      setWeather(weatherData);
      setCalendar(calendarData);
      setStravaStatus(stravaData);
    });
  }, []);

  async function refreshWeights() {
    const res = await fetch("/api/weights", { cache: "no-store" });
    const json = await res.json();
    setWeights(json.weights);
  }

  async function refreshRuns() {
    const res = await fetch("/api/runs", { cache: "no-store" });
    const json = await res.json();
    setRuns(json.runs);
  }

  const latestWeight = weights[0];
  const stravaRuns = useMemo(() => runs.filter((run) => run.source === "strava"), [runs]);
  const weeklyRunChart = useMemo(() => buildWeeklyRunChart(stravaRuns), [stravaRuns]);
  const weekRunDistance = weeklyRunChart.reduce((sum, item) => sum + item.거리, 0).toFixed(1);
  const activeRunDays = weeklyRunChart.filter((item) => item.거리 > 0).length;
  const remainingTodayEvents = useMemo(() => {
    const now = new Date();

    return (calendar?.events ?? []).filter((event) => {
      if (event.isAllDay) return true;
      if (event.isTask) return true;
      return new Date(event.end) >= now;
    });
  }, [calendar]);
  const weightTrend = useMemo(
    () =>
      [...weights]
        .slice(0, 10)
        .reverse()
        .map((item) => ({ date: item.date.slice(5), 실적: item.actualWeight })),
    [weights]
  );
  return (
    <main className="shell focusShell">
      <section className="focusHeader">
        <div>
          <div className="focusEyebrow">Today Board</div>
        </div>
        <div className="focusDate">{new Date().toLocaleDateString("ko-KR", { dateStyle: "full" })}</div>
      </section>

      <section className="focusGrid">
        <SummaryCard
          className="weatherSummary"
          icon={weatherIcon(weather?.current.skyLabel)}
          label="날씨"
          topMeta={
            weather ? (
              <>
                <span className="summaryPill">{weather.locationName}</span>
                <span className="summaryPill">{weather?.current.skyLabel || "-"}</span>
                <span className="summaryPill">{weather?.current.rainTypeLabel || "-"}</span>
              </>
            ) : null
          }
          value={weather ? `${weather.current.temperature ?? "-"}°` : "-"}
          sub={weather ? null : "불러오는 중"}
          footer={
            <div className="cardChartBlock">
              <div className="cardChartHeader">
                <strong className="weatherNowLabel">
                  <span className="weatherInlineIcon">{weatherIcon(weather?.current.skyLabel)}</span>
                  <span>{weather?.current.skyLabel || "-"}</span>
                </strong>
                <span>{weather?.current.rainTypeLabel || "-"}</span>
              </div>
              <div className="weeklyClimateRow">
                {weather?.weekly.slice(0, 7).map((item) => (
                  <div className="weeklyClimateItem" key={item.dayLabel}>
                    <span>{item.dayLabel.split(" ")[0]}</span>
                    <strong className="weeklyClimateSummary">{weatherIcon(item.summary)}</strong>
                    <small className="weeklyClimateTemp">
                      {item.minTemp !== null && item.maxTemp !== null ? `${item.minTemp}°/${item.maxTemp}°` : "-"}
                    </small>
                  </div>
                ))}
              </div>
            </div>
          }
        />

        <SummaryCard
          icon="⚖"
          label="몸무게"
          topMeta={
            latestWeight?.diff === null || latestWeight?.diff === undefined
              ? <span className="summaryPill">최근 기록 없음</span>
              : (
                  <>
                    <span className="summaryPill">{latestWeight?.date || "-"}</span>
                    <span className="summaryPill">계획 대비 {formatSigned(latestWeight.diff, 1)}kg</span>
                  </>
                )
          }
          value={latestWeight ? formatWeight(latestWeight.actualWeight) : "-"}
          sub={null}
          tone={latestWeight?.diff !== null && latestWeight?.diff !== undefined && latestWeight.diff > 0 ? "down" : "up"}
          footer={
            <div className="cardChartBlock">
              <div className="miniChartWrap weightChart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weightTrend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tickMargin={8} />
                    <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Line
                      type="linear"
                      dataKey="실적"
                      stroke="#2f6b4f"
                      strokeWidth={2.5}
                      dot={{ r: 4.5, fill: "#2f6b4f", stroke: "#ffffff", strokeWidth: 2 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          }
        />

        <SummaryCard
          className="runningSummaryCard"
          icon="🏃"
          label="주간 러닝"
          topMeta={
            <>
              <span className="summaryPill">{activeRunDays}일 러닝</span>
              <span className="summaryPill">Strava</span>
            </>
          }
          value={`${weekRunDistance}km`}
          sub={null}
          footer={
            <div className="cardChartBlock">
              <div className="miniChartWrap runningChart">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyRunChart} margin={{ top: 18, right: 2, left: 2, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tickMargin={8} />
                    <YAxis hide />
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Bar dataKey="거리" fill="#f1a54c" radius={[8, 8, 0, 0]}>
                      <LabelList
                        dataKey="거리"
                        position="top"
                        offset={6}
                        fill="#7a4a00"
                        fontSize={11}
                        formatter={(value: number) => (value > 0 ? `${value}` : "")}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          }
        />
      </section>

      <section className="scheduleBoard">
        <div className="scheduleHeader">
          <div>
            <div className="scheduleTitle">오늘 주요 일정</div>
          </div>
          <div className="scheduleCountBadge">{remainingTodayEvents.length}개</div>
        </div>
        <div className="scheduleList">
          {remainingTodayEvents.map((event) => (
            <div className={`scheduleItem${event.isTask ? " taskItem" : ""}`} key={event.id}>
              <span className="scheduleTime">{event.isAllDay ? "하루 종일" : formatCalendarTime(event.start)}</span>
              {event.isTask ? <span className="scheduleKindBadge">TASK</span> : null}
              <strong>{event.title}</strong>
            </div>
          ))}
          {calendar && remainingTodayEvents.length === 0 ? <div className="scheduleEmpty">남은 일정이 없습니다.</div> : null}
        </div>
        {calendar?.note ? <div className="scheduleNote">{calendar.note}</div> : null}
      </section>

      {notice ? <div className="noticeBanner">{notice}</div> : null}

      <details className="manageBlock">
        <summary>데이터 입력 / 관리</summary>
        <div className="manageGrid">
          <ManagePanel title="몸무게 입력">
            <WeightManager
              weights={weights}
              pending={pending}
              defaultDate={today}
              onSave={(payload) =>
                startTransition(async () => {
                  const res = await fetch("/api/weights", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify(payload)
                  });
                  const json = await res.json();
                  setNotice(json.message ?? (json.ok ? "몸무게 기록을 저장했습니다." : "몸무게 기록 저장에 실패했습니다."));
                  if (json.ok) await refreshWeights();
                })
              }
            />
          </ManagePanel>

          <ManagePanel title="Strava 동기화">
            <RunningManager
              pending={pending}
              stravaStatus={stravaStatus}
              weeklyRunChart={weeklyRunChart}
              weekRunDistance={weekRunDistance}
              onConnectStrava={() =>
                startTransition(async () => {
                  const res = await fetch("/api/strava/auth-url");
                  const json = await res.json();
                  if (json.ok && json.url) {
                    window.location.href = json.url;
                    return;
                  }
                  setNotice(json.message ?? "Strava 연결 URL 생성에 실패했습니다.");
                })
              }
              onImportStrava={() =>
                startTransition(async () => {
                  const res = await fetch("/api/strava/import", { method: "POST" });
                  const json = await res.json();
                  setNotice(json.message ?? (json.ok ? "Strava 가져오기가 완료되었습니다." : "Strava 가져오기에 실패했습니다."));
                  if (json.ok) {
                    setRuns(json.runs);
                    const statusRes = await fetch("/api/strava/status", { cache: "no-store" });
                    setStravaStatus(await statusRes.json());
                  }
                })
              }
            />
          </ManagePanel>
        </div>
      </details>
    </main>
  );
}

function SummaryCard({
  icon,
  label,
  topMeta,
  value,
  sub,
  footer,
  tone,
  className
}: {
  icon: string;
  label: string;
  topMeta?: React.ReactNode;
  value: string;
  sub: React.ReactNode;
  footer?: React.ReactNode;
  tone?: "up" | "down";
  className?: string;
}) {
  return (
    <section className={`summaryCardMain ${className ?? ""}`.trim()}>
      <div className="summaryHeroRow">
        <div className="summaryLead">
          <div className="summaryIcon">{icon}</div>
          <div className="summaryHeading">
            <div className="summaryLabelRow">
              <div className="summaryLabel">{label}</div>
              {topMeta ? <div className="summaryTopMeta">{topMeta}</div> : null}
            </div>
          </div>
        </div>
        <div className="summaryValue">{value}</div>
      </div>
      <div className={`summarySub ${tone === "down" ? "changeDown" : tone === "up" ? "changeUp" : ""}`.trim()}>{sub}</div>
      {footer ? <div className="summaryFooter">{footer}</div> : null}
    </section>
  );
}

const chartTooltipStyle = {
  backgroundColor: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(37, 54, 40, 0.08)",
  borderRadius: "14px",
  boxShadow: "0 10px 30px rgba(34, 48, 31, 0.08)"
};

function ManagePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="managePanel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function WeightManager({
  weights,
  pending,
  defaultDate,
  onSave
}: {
  weights: DashboardSnapshot["weights"];
  pending: boolean;
  defaultDate: string;
  onSave: (payload: { date: string; targetWeight: number | null; actualWeight: number | null }) => void;
}) {
  const [form, setForm] = useState({ date: defaultDate, targetWeight: "", actualWeight: "" });

  return (
    <>
      <div className="compactInputs three">
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <input value={form.targetWeight} onChange={(e) => setForm({ ...form, targetWeight: e.target.value })} placeholder="계획" />
        <input value={form.actualWeight} onChange={(e) => setForm({ ...form, actualWeight: e.target.value })} placeholder="실적" />
      </div>
      <button
        className="button"
        disabled={pending}
        onClick={() =>
          onSave({
            date: form.date,
            targetWeight: form.targetWeight === "" ? null : Number(form.targetWeight),
            actualWeight: form.actualWeight === "" ? null : Number(form.actualWeight)
          })
        }
      >
        저장
      </button>
      <div className="simpleList">
        {weights.slice(0, 5).map((item) => (
          <div className="simpleRow gridWeight" key={item.id}>
            <span>{item.date}</span>
            <small>{formatWeight(item.actualWeight)}</small>
            <small>{item.diff === null ? "-" : `${formatSigned(item.diff, 1)}kg`}</small>
          </div>
        ))}
      </div>
    </>
  );
}

function RunningManager({
  pending,
  stravaStatus,
  onConnectStrava,
  onImportStrava,
  weeklyRunChart,
  weekRunDistance
}: {
  pending: boolean;
  stravaStatus: StravaStatusResponse | null;
  onConnectStrava: () => void;
  onImportStrava: () => void;
  weeklyRunChart: Array<{ day: string; 거리: number }>;
  weekRunDistance: string;
}) {
  return (
    <>
      <div className="integrationRow">
        <span>{stravaStatus?.connected ? `Strava 연결됨${stravaStatus.athleteId ? ` · ${stravaStatus.athleteId}` : ""}` : "Strava 미연결"}</span>
        <div className="integrationActions">
          <button className="secondaryButton" disabled={pending} onClick={onConnectStrava}>
            Strava 연결
          </button>
          <button className="secondaryButton" disabled={pending || !stravaStatus?.connected} onClick={onImportStrava}>
            최근 러닝 가져오기
          </button>
        </div>
      </div>
      <div className="weeklySummaryText">이번 주 Strava 러닝 합계 {weekRunDistance}km</div>
      <div className="miniChartWrap largeWeeklyChart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weeklyRunChart}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" axisLine={false} tickLine={false} tickMargin={8} />
            <YAxis />
            <Tooltip contentStyle={chartTooltipStyle} />
            <Bar dataKey="거리" fill="#f1a54c" radius={[8, 8, 0, 0]}>
              <LabelList
                dataKey="거리"
                position="top"
                offset={8}
                fill="#7a4a00"
                fontSize={11}
                formatter={(value: number) => (value > 0 ? `${value}` : "")}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function weatherIcon(label?: string) {
  if (!label) return "☁";
  if (label.includes("비")) return "🌧";
  if (label.includes("눈")) return "❄";
  if (label.includes("맑")) return "☀";
  if (label.includes("구름")) return "⛅";
  return "☁";
}

function formatCalendarTime(value: string) {
  if (!value.includes("T")) return "하루 종일";
  return new Date(value).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function buildWeeklyRunChart(runs: DashboardSnapshot["runs"]) {
  const labels = ["월", "화", "수", "목", "금", "토", "일"];
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  return labels.map((label, index) => {
    const target = new Date(monday);
    target.setDate(monday.getDate() + index);
    const dateKey = target.toISOString().slice(0, 10);
    const total = runs.filter((run) => run.date === dateKey).reduce((sum, run) => sum + run.distanceKm, 0);

    return {
      day: label,
      거리: Number(total.toFixed(1))
    };
  });
}
