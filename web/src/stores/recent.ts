import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const STORAGE_KEY = 'singtags.recent.v1'
const MAX = 12

export const useRecentStore = defineStore('recent', () => {
  const ids = ref<number[]>([])

  function load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) ids.value = (JSON.parse(raw) as number[]).filter((n) => Number.isFinite(n))
    } catch {
      ids.value = []
    }
  }

  load()

  const list = computed(() => ids.value)

  function push(id: number): void {
    const next = [id, ...ids.value.filter((x) => x !== id)].slice(0, MAX)
    ids.value = next
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  function clear(): void {
    ids.value = []
    localStorage.removeItem(STORAGE_KEY)
  }

  return { ids, list, push, clear, load }
})
