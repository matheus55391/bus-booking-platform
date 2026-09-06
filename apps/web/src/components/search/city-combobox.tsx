'use client';

import { Building2, Bus, MapPin } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  formatLocationLabel,
  searchLocations,
  type Location,
} from '@/data/locations';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = {
  id?: string;
  value: string;
  placeholder?: string;
  invalid?: boolean;
  onChange: (city: string) => void;
  onBlur?: () => void;
};

export function CityCombobox({
  id,
  value,
  placeholder,
  invalid,
  onChange,
  onBlur,
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [activeIndex, setActiveIndex] = useState(0);
  const results = searchLocations(query);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  function select(location: Location) {
    onChange(location.city);
    setQuery(location.city);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true);
      return;
    }

    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    }

    if (event.key === 'Enter' && open && results[activeIndex]) {
      event.preventDefault();
      select(results[activeIndex]);
    }
  }

  return (
    <div ref={rootRef} className="relative z-20 min-w-0 flex-1">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-invalid={invalid}
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setActiveIndex(0);
        }}
        onBlur={() => {
          window.setTimeout(() => onBlur?.(), 150);
        }}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          onChange(next);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={onKeyDown}
        className={cn(
          'h-10 border-0 bg-transparent px-0 text-base shadow-none focus-visible:border-0 focus-visible:ring-0 aria-invalid:border-0 aria-invalid:ring-0',
          invalid && 'placeholder:text-destructive',
        )}
      />

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 top-[calc(100%+0.35rem)] z-50 max-h-72 w-[min(100vw-2rem,22rem)] overflow-auto rounded-xl border border-border bg-card py-1 shadow-[0_16px_40px_-12px_rgba(20,32,25,0.35)] sm:w-80"
        >
          {results.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted-foreground">
              Nenhuma cidade ou rodoviária encontrada
            </li>
          ) : (
            results.map((location, index) => {
              const active = index === activeIndex;
              return (
                <li key={location.id} role="option" aria-selected={active}>
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors',
                      active
                        ? 'bg-primary/15 text-foreground'
                        : 'hover:bg-secondary',
                    )}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      select(location);
                    }}
                  >
                    <LocationIcon type={location.type} />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {formatLocationLabel(location)}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}

function LocationIcon({ type }: { type: Location['type'] }) {
  const className = 'size-4 shrink-0 text-primary';
  if (type === 'city_all') {
    return <Building2 className={className} aria-hidden />;
  }
  if (type === 'station') {
    return <Bus className={className} aria-hidden />;
  }
  return <MapPin className={className} aria-hidden />;
}
