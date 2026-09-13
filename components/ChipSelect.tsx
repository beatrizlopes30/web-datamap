interface ChipSelectProps {
  options: readonly string[];
  selected: string[];
  onToggle: (option: string) => void;
  activeColor?: string;
}

export default function ChipSelect({ options, selected, onToggle, activeColor = '#2563eb' }: ChipSelectProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(option => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className="px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors"
            style={active
              ? { backgroundColor: activeColor, borderColor: activeColor, color: '#fff' }
              : { backgroundColor: '#fff', borderColor: '#d1d5db', color: '#374151' }
            }
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
