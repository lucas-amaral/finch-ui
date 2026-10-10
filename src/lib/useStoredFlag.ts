import { useState } from 'react'

/** An on/off choice of the user that is remembered in this browser under `key`. */
export function useStoredFlag(key: string, initial: boolean): [boolean, () => void] {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key)
    return stored === null ? initial : stored === 'true'
  })

  function toggle() {
    localStorage.setItem(key, String(!value))
    setValue(!value)
  }

  return [value, toggle]
}
