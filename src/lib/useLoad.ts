import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '../api/client'

interface LoadState<T> {
  data: T | null
  error: string | null
  loading: boolean
}

/** Runs `load` on mount and whenever `deps` change; `reload` runs it again on demand. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<LoadState<T>>({ data: null, error: null, loading: true })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    setState((current) => ({ ...current, loading: true, error: null }))
    load().then(
      (data) => active && setState({ data, error: null, loading: false }),
      (error: unknown) => active && setState({ data: null, error: errorMessage(error), loading: false }),
    )
    return () => {
      active = false
    }
    // `load` is recreated on every render; the caller lists what it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  const reload = useCallback(() => setVersion((current) => current + 1), [])
  return { ...state, reload }
}
