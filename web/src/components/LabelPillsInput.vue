<script setup lang="ts">
/**
 * Editable label pills: Enter/comma commits a pill; each pill has an × to remove.
 */
import { ref, watch } from 'vue'
import { parseSessionLabels } from '../types/recorder'

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    placeholder?: string
    /** Max total labels. */
    maxLabels?: number
    /** Max characters per label. */
    maxLength?: number
    disabled?: boolean
    ariaLabel?: string
  }>(),
  {
    placeholder: 'Type a label, then Enter',
    maxLabels: 24,
    maxLength: 40,
    disabled: false,
    ariaLabel: 'Add label',
  },
)

const emit = defineEmits<{
  'update:modelValue': [string[]]
  change: [string[]]
}>()

const draft = ref('')
const rootRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

watch(
  () => props.modelValue,
  () => {
    /* keep draft independent of model */
  },
)

function normalizeUnique(list: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of list) {
    const t = raw.trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(t.slice(0, props.maxLength))
    if (out.length >= props.maxLabels) break
  }
  return out
}

function commitTokens(raw: string): void {
  const parts = parseSessionLabels(raw)
  if (!parts.length) return
  const next = normalizeUnique([...props.modelValue, ...parts])
  emit('update:modelValue', next)
  emit('change', next)
  draft.value = ''
}

function onKeydown(e: KeyboardEvent): void {
  if (props.disabled) return
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    commitTokens(draft.value)
    return
  }
  if (e.key === 'Backspace' && !draft.value && props.modelValue.length) {
    e.preventDefault()
    removeAt(props.modelValue.length - 1)
  }
}

function onInput(e: Event): void {
  const el = e.target as HTMLInputElement
  const v = el.value
  if (v.includes(',') || v.includes(';') || v.includes('\n')) {
    commitTokens(v)
    return
  }
  draft.value = v.slice(0, props.maxLength)
}

function onBlur(): void {
  if (draft.value.trim()) commitTokens(draft.value)
}

function removeAt(index: number): void {
  if (props.disabled) return
  const next = props.modelValue.filter((_, i) => i !== index)
  emit('update:modelValue', next)
  emit('change', next)
  inputRef.value?.focus()
}

function focusInput(): void {
  if (props.disabled) return
  inputRef.value?.focus()
}
</script>

<template>
  <div
    ref="rootRef"
    class="pills-input"
    :class="{ disabled }"
    role="group"
    :aria-label="ariaLabel"
    @click="focusInput"
  >
    <span v-for="(label, i) in modelValue" :key="`${label}-${i}`" class="pill">
      <span class="pill-text">{{ label }}</span>
      <button
        type="button"
        class="pill-x"
        :disabled="disabled"
        :aria-label="`Remove ${label}`"
        @click.stop="removeAt(i)"
      >
        ×
      </button>
    </span>
    <input
      ref="inputRef"
      class="draft"
      type="text"
      :value="draft"
      :disabled="disabled || modelValue.length >= maxLabels"
      :placeholder="modelValue.length ? '' : placeholder"
      :maxlength="maxLength"
      :aria-label="ariaLabel"
      @keydown="onKeydown"
      @input="onInput"
      @blur="onBlur"
    />
  </div>
</template>

<style scoped>
.pills-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  min-height: 44px;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  cursor: text;
}
.pills-input.disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  max-width: 100%;
  padding: 0.15rem 0.2rem 0.15rem 0.55rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  font-size: 0.85rem;
  font-weight: 600;
  line-height: 1.2;
}
.pill-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pill-x {
  flex: 0 0 auto;
  width: 1.5rem;
  height: 1.5rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 1.05rem;
  line-height: 1;
  cursor: pointer;
}
.pill-x:hover:not(:disabled) {
  color: var(--text);
  background: color-mix(in srgb, var(--text) 8%, transparent);
}
.draft {
  flex: 1 1 6rem;
  min-width: 5rem;
  min-height: 32px;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  font-size: 16px;
  color: inherit;
  padding: 0.15rem 0.1rem;
}
.draft::placeholder {
  color: var(--muted);
}
</style>
