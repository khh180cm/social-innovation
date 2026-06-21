export const pct = (r: number, digits = 0) => `${(r * 100).toFixed(digits)}%`;

export const wonShort = (n: number) => {
  const m = n / 10_000;
  return `${m.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}만원`;
};
