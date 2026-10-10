import { TrendingUp } from 'lucide-react'

/** The Finch mark and name, as shown on the sidebar and on the login page. */
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <TrendingUp size={18} strokeWidth={2.5} aria-hidden />
      </span>
      <span className="brand-name">Finch</span>
    </span>
  )
}
