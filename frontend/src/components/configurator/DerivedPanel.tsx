import { T } from "@/lib/i18n";

/** Side panel listing what the generator/physics derive from this step's inputs (PRD v4 §3.1). */
export default function DerivedPanel({ module, items }: { module: string; items: string[] }) {
  return (
    <aside className="bg-surface-container-lowest rounded-xl p-5 shadow-card flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-headline-sm text-headline-sm text-on-surface">
          <span className="material-symbols-outlined text-[18px] text-secondary">auto_awesome</span>
          <T>COCOON derives</T>
        </h2>
        <span className="font-data text-[10px] px-2 py-0.5 rounded-full bg-surface-container-low text-on-surface-variant">{module}</span>
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">
        <T>You don’t enter these — they are generated or computed from your inputs:</T>
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 font-body-sm text-body-sm text-on-surface">
            <span className="material-symbols-outlined text-[16px] text-equilibrium mt-px">check</span>
            <T>{item}</T>
          </li>
        ))}
      </ul>
    </aside>
  );
}
