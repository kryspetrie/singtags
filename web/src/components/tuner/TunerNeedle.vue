<script setup lang="ts">
/**
 * Simple Tune needle — cents → rotation. Text twin lives in the parent readout.
 */
defineProps<{
  /** Signed cents vs target; null = idle. */
  cents: number | null
  inTune: boolean
}>()
</script>

<template>
  <div class="needle" :class="{ in: inTune, idle: cents == null }" aria-hidden="true">
    <div class="arc" />
    <div
      class="pointer"
      :style="{
        transform: `rotate(${Math.max(-45, Math.min(45, cents ?? 0)) * (45 / 50)}deg)`,
      }"
    />
    <div class="hub" />
  </div>
</template>

<style scoped>
.needle {
  position: relative;
  width: min(100%, 16rem);
  aspect-ratio: 2 / 1;
  margin: 0 auto;
}
.arc {
  position: absolute;
  inset: 10% 5% auto;
  height: 70%;
  border: 2px solid var(--border);
  border-bottom: none;
  border-radius: 50% 50% 0 0 / 100% 100% 0 0;
  box-sizing: border-box;
}
.pointer {
  position: absolute;
  left: 50%;
  bottom: 12%;
  width: 3px;
  height: 62%;
  margin-left: -1.5px;
  transform-origin: 50% 100%;
  background: var(--text);
  border-radius: 2px;
  transition: transform 0.08s linear;
}
.needle.in .pointer {
  background: var(--accent);
}
.needle.idle .pointer {
  opacity: 0.35;
}
.hub {
  position: absolute;
  left: 50%;
  bottom: 8%;
  width: 10px;
  height: 10px;
  margin-left: -5px;
  border-radius: 50%;
  background: var(--text);
}
@media (prefers-reduced-motion: reduce) {
  .pointer {
    transition: none;
  }
}
</style>
