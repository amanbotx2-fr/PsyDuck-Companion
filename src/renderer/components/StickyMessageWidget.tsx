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
      <p className="sticky-message-widget__message">{message}</p>
    </aside>
  );
}
