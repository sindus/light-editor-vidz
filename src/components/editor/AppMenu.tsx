import { useEffect, useRef, useState, type ReactNode } from "react";

export interface MenuAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  shortcut?: string;
}

export type MenuEntry = MenuAction | "separator";

interface Props {
  label: string;
  items?: MenuEntry[];
  children?: ReactNode;
}

/** Menu déroulant générique utilisé pour File / Edit / ? dans la top bar. */
export default function AppMenu({ label, items, children }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div className="app-menu" ref={ref}>
      <button type="button" className={`editor-menu-item${open ? " open" : ""}`} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div className="app-menu-dropdown">
          {items?.map((entry, i) =>
            entry === "separator" ? (
              <div className="app-menu-separator" key={`sep-${i}`} />
            ) : (
              <button
                type="button"
                key={entry.label}
                className="app-menu-action"
                disabled={entry.disabled}
                onClick={() => {
                  entry.onClick();
                  setOpen(false);
                }}
              >
                <span>{entry.label}</span>
                {entry.shortcut && <span className="app-menu-shortcut mono">{entry.shortcut}</span>}
              </button>
            ),
          )}
          {children}
        </div>
      )}
    </div>
  );
}
