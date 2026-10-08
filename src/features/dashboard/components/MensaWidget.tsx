import { Utensils } from 'lucide-react';
import { MENSA_MENU } from '@/features/dashboard/lib/mockData';

export function MensaWidget() {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-line bg-surface-secondary/60 p-5 ">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-surface text-secondary">
              <Utensils size={15} strokeWidth={2} aria-hidden />
            </span>
            <h2 className="text-[16px] font-semibold tracking-tight text-primary">Mensa today</h2>
          </div>

          <span className="font-mono text-[11.5px] font-medium text-secondary">11:00 – 14:30</span>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {MENSA_MENU.map((meal) => (
            <div key={meal.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-primary">
                  {meal.name}
                </span>
                <span className="text-[11.5px] text-secondary/80">{meal.tag}</span>
              </div>

              <span className="font-mono text-[13px] font-semibold text-primary">{meal.price}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 border-t border-yellow/20 pt-2.5 text-right">
        <span className="text-[11px] font-medium text-secondary/70">
          Campus Mensa · Sample menu
        </span>
      </div>
    </div>
  );
}
