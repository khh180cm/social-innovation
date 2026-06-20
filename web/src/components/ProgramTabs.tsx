import Link from "next/link";

function shortLabel(program: string): string {
  // "미래내일 일경험_A" → "일경험 A", "직무훈련_A" → "직무훈련 A"
  const [name, org] = program.split("_");
  const base = name.includes("일경험") ? "일경험" : "직무훈련";
  return `${base} ${org}`;
}

function Pill({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="px-2.5 py-1 rounded-sm text-xs font-medium border transition-colors"
      style={{
        color: active ? "#fff" : "var(--ink-dim)",
        background: active ? "var(--primary)" : "var(--panel)",
        borderColor: active ? "var(--primary)" : "var(--line)",
      }}
    >
      {label}
    </Link>
  );
}

export function ProgramTabs({
  programs,
  selected,
  asof,
}: {
  programs: string[];
  selected: string | null;
  asof: number;
}) {
  const q = (program: string | null) =>
    `/?${program ? `program=${encodeURIComponent(program)}&` : ""}asof=${asof}`;

  const ilgyeong = programs.filter((p) => p.includes("일경험"));
  const jikmu = programs.filter((p) => p.startsWith("직무훈련"));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Pill href={q(null)} label="전체" active={selected === null} />
      <span className="mx-1 h-4 w-px" style={{ background: "var(--line)" }} />
      {ilgyeong.map((p) => (
        <Pill
          key={p}
          href={q(p)}
          label={shortLabel(p)}
          active={selected === p}
        />
      ))}
      <span className="mx-1 h-4 w-px" style={{ background: "var(--line)" }} />
      {jikmu.map((p) => (
        <Pill
          key={p}
          href={q(p)}
          label={shortLabel(p)}
          active={selected === p}
        />
      ))}
    </div>
  );
}
