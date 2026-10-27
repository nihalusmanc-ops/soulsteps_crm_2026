import { useRef, useState, type ComponentProps } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CalendarDays,
  Clock3,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { Button } from "./button";

const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDay = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};
const todayDubai = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const months = Array.from({ length: 12 }, (_, m) =>
  new Date(2026, m, 1).toLocaleString("en-GB", { month: "long" }),
);

/** Keeps a real native input for FormData, validation and direct keyboard editing. */
export function DateTimeField({
  pickerLabel,
  ...props
}: Omit<ComponentProps<"input">, "type"> & {
  type: "date" | "time" | "datetime-local";
  pickerLabel: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [month, setMonth] = useState(() => parseDay(todayDubai()));
  const [focused, setFocused] = useState("");
  const hasDate = props.type !== "time",
    hasTime = props.type !== "date";
  const minDay = String(props.min || "").slice(0, 10),
    maxDay = String(props.max || "").slice(0, 10);
  const validDay = (key: string) =>
    (!minDay || key >= minDay) && (!maxDay || key <= maxDay);
  const show = () => {
    const value = input.current?.value || "";
    const selected = hasDate ? value.slice(0, 10) || todayDubai() : "";
    setDay(selected);
    setFocused(selected);
    setMonth(parseDay(selected || todayDubai()));
    setTime(
      props.type === "datetime-local"
        ? value.slice(11, 16)
        : props.type === "time"
          ? value
          : "",
    );
    setOpen(true);
  };
  const commit = (value: string) => {
    const field = input.current;
    if (!field) return;
    // Use the native setter so React notices the same change as a typed edit.
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    setOpen(false);
  };
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const browseMonth = (next: Date) => {
    setMonth(next);
    setFocused(dateKey(next));
  };
  const moveFocus = (key: string) => {
    setFocused(key);
    setMonth(parseDay(key));
    requestAnimationFrame(() =>
      grid.current
        ?.querySelector<HTMLButtonElement>(`[data-day="${key}"]`)
        ?.focus(),
    );
  };
  const candidate =
    props.type === "date"
      ? day
      : props.type === "time"
        ? time
        : `${day}T${time}`;
  const valid =
    (!hasDate || (day && validDay(day))) &&
    (!hasTime || /^\d{2}:\d{2}$/.test(time)) &&
    (!props.min || candidate >= String(props.min)) &&
    (!props.max || candidate <= String(props.max));
  const [hour = "", minute = ""] = time.split(":");
  const years = Array.from(
    new Set([
      month.getFullYear(),
      ...Array.from(
        { length: 31 },
        (_, i) => new Date().getFullYear() - 10 + i,
      ),
    ]),
  ).sort((a, b) => a - b);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <span className="date-time-field">
        <input
          {...props}
          ref={input}
          onClick={(event) => {
            props.onClick?.(event);
            if (!event.defaultPrevented && !props.disabled && !props.readOnly) {
              event.preventDefault();
              show();
            }
          }}
        />
        <button
          ref={trigger}
          type="button"
          className="date-time-trigger"
          disabled={props.disabled || props.readOnly}
          onClick={show}
          aria-label={`Choose ${pickerLabel}`}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {hasDate ? <CalendarDays size={18} /> : <Clock3 size={18} />}
        </button>
      </span>
      <Dialog.Portal>
        <Dialog.Overlay className="picker-overlay" />
        <Dialog.Content
          className="date-time-picker"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <div className="picker-title">
            <Dialog.Title>{pickerLabel}</Dialog.Title>
            <Dialog.Close
              className="icon-button"
              aria-label="Close date and time picker"
            >
              <X size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="picker-description">
            {hasTime
              ? "24-hour time · Dubai (UTC+4)"
              : "Choose a date for this record."}
          </Dialog.Description>
          {hasDate && (
            <>
              <div className="calendar-heading">
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Previous month"
                  onClick={() =>
                    browseMonth(
                      new Date(
                        month.getFullYear(),
                        month.getMonth() - 1,
                        1,
                        12,
                      ),
                    )
                  }
                >
                  <ChevronLeft size={18} />
                </button>
                <select
                  aria-label="Calendar month"
                  value={month.getMonth()}
                  onChange={(e) =>
                    browseMonth(
                      new Date(
                        month.getFullYear(),
                        Number(e.target.value),
                        1,
                        12,
                      ),
                    )
                  }
                >
                  {months.map((m, i) => (
                    <option value={i} key={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Calendar year"
                  value={month.getFullYear()}
                  onChange={(e) =>
                    browseMonth(
                      new Date(Number(e.target.value), month.getMonth(), 1, 12),
                    )
                  }
                >
                  {years.map((y) => (
                    <option key={y}>{y}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Next month"
                  onClick={() =>
                    browseMonth(
                      new Date(
                        month.getFullYear(),
                        month.getMonth() + 1,
                        1,
                        12,
                      ),
                    )
                  }
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <div
                ref={grid}
                className="calendar-days"
                role="group"
                aria-label="Choose calendar day"
              >
                {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                  <span className="weekday" key={d}>
                    {d}
                  </span>
                ))}
                {days.map((d) => {
                  const key = dateKey(d);
                  return (
                    <button
                      type="button"
                      key={key}
                      data-day={key}
                      tabIndex={key === focused ? 0 : -1}
                      aria-label={d.toLocaleDateString("en-GB", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                      aria-pressed={day === key}
                      aria-current={key === todayDubai() ? "date" : undefined}
                      disabled={!validDay(key)}
                      className={
                        d.getMonth() !== month.getMonth()
                          ? "adjacent-month"
                          : ""
                      }
                      onClick={() => {
                        setDay(key);
                        setFocused(key);
                        setMonth(parseDay(key));
                      }}
                      onKeyDown={(e) => {
                        const delta: Record<string, number> = {
                          ArrowLeft: -1,
                          ArrowRight: 1,
                          ArrowUp: -7,
                          ArrowDown: 7,
                          Home: -(d.getDay() + 6) % 7,
                          End: 6 - ((d.getDay() + 6) % 7),
                        };
                        if (e.key in delta) {
                          e.preventDefault();
                          const next = new Date(d);
                          next.setDate(d.getDate() + delta[e.key]);
                          moveFocus(dateKey(next));
                        }
                        if (e.key === "PageUp" || e.key === "PageDown") {
                          e.preventDefault();
                          const next = new Date(
                            d.getFullYear(),
                            d.getMonth() + (e.key === "PageUp" ? -1 : 1),
                            1,
                            12,
                          );
                          next.setDate(
                            Math.min(
                              d.getDate(),
                              new Date(
                                next.getFullYear(),
                                next.getMonth() + 1,
                                0,
                              ).getDate(),
                            ),
                          );
                          moveFocus(dateKey(next));
                        }
                      }}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="calendar-shortcuts">
                {[
                  ["Today", 0],
                  ["Tomorrow", 1],
                ].map(([label, offset]) => (
                  <button
                    type="button"
                    key={label}
                    onClick={() => {
                      const next = parseDay(todayDubai());
                      next.setDate(next.getDate() + Number(offset));
                      const key = dateKey(next);
                      setDay(key);
                      setFocused(key);
                      setMonth(next);
                    }}
                    disabled={
                      !validDay(
                        (() => {
                          const next = parseDay(todayDubai());
                          next.setDate(next.getDate() + Number(offset));
                          return dateKey(next);
                        })(),
                      )
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          {hasTime && (
            <div className="time-selection">
              <label>
                Hour
                <select
                  aria-label="Hour"
                  value={hour}
                  onChange={(e) => setTime(`${e.target.value}:${minute}`)}
                >
                  <option value="">HH</option>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={pad(h)}>
                      {pad(h)}
                    </option>
                  ))}
                </select>
              </label>
              <span aria-hidden="true">:</span>
              <label>
                Minute
                <select
                  aria-label="Minute"
                  value={minute}
                  onChange={(e) => setTime(`${hour}:${e.target.value}`)}
                >
                  <option value="">MM</option>
                  {Array.from({ length: 60 }, (_, m) => (
                    <option key={m} value={pad(m)}>
                      {pad(m)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="picker-footer">
            {!props.required && (
              <Button type="button" variant="ghost" onClick={() => commit("")}>
                Clear
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!valid}
              onClick={() => commit(candidate)}
            >
              Apply
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
