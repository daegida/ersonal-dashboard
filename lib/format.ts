export function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value);
}

export function formatSigned(value: number, digits = 0) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, digits)}`;
}

export function formatPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatWeight(value: number | null) {
  return value === null ? "-" : `${value.toFixed(1)}kg`;
}

export function formatPace(seconds: number | null) {
  if (!seconds || Number.isNaN(seconds)) {
    return "-";
  }

  const minutes = Math.floor(seconds / 60);
  const remain = Math.round(seconds % 60);
  return `${minutes}' ${String(remain).padStart(2, "0")}"`;
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remain = Math.round(minutes % 60);
  if (hours === 0) {
    return `${remain}분`;
  }
  return `${hours}시간 ${remain}분`;
}
