import { Text, LocalizedAttrs } from '@/components/LocalizedText';
export default function Loading() {
  return (
    <LocalizedAttrs><main
      id="main"
      className="wrap page-content"
      aria-label="Loading page"
      role="status"
    >
      <div className="product-skeleton">
        <div />
        <span />
        <span />
      </div>
    </main></LocalizedAttrs>
  );
}
