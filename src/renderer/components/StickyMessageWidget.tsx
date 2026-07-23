export interface StickyMessageWidgetProps {
  readonly message: string;
}

export function StickyMessageWidget({
  message,
}: StickyMessageWidgetProps) {
  return (
    <aside
      className="sticky-message-widget"
      aria-label="Sticky message"
    >
      <span
        className="sticky-message-widget__icon"
        aria-hidden="true"
      >
        📌
      </span>
      <p className="sticky-message-widget__message">{message}</p>
    </aside>
  );
}
