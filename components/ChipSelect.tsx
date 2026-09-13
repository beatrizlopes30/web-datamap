interface ChipSelectProps {
  options: readonly string[];
  selected: string[];
  onToggle: (option: string) => void;
  activeColor?: string;
  /** Quando informado, dá uma cor própria a cada opção (em vez de uma única activeColor para
   * todas) — usado para diferenciar visualmente cada sintoma no filtro. */
  colorFor?: (option: string) => string;
}

export default function ChipSelect({ options, selected, onToggle, activeColor = '#2563eb', colorFor }: ChipSelectProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(option => {
        const active = selected.includes(option);
        const color = colorFor ? colorFor(option) : activeColor;
        const style = active
          ? { backgroundColor: color, borderColor: color, color: '#fff' }
          : colorFor
            ? { backgroundColor: '#fff', borderColor: color, color }
            : { backgroundColor: '#fff', borderColor: '#d1d5db', color: '#374151' };
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors"
            style={style}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
