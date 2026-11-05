<script setup lang="ts">
/**
 * Shared privacy note for Google Drive connect and the signed-in Drive summary.
 */
</script>

<template>
  <section class="info-block" aria-labelledby="drive-privacy-heading">
    <h3 id="drive-privacy-heading">Your data &amp; privacy</h3>
    <p>
      Your files stay in a private folder in <strong>your</strong> Google Drive. SingTags keeps no
      account and no copy of your data.
    </p>
    <p>
      SingTags.com has no user database and no telemetry. We host no servers or databases, and this
      connection doesn’t send metrics or library contents back to us.
    </p>
    <p>Log out here or revoke SingTags in your Google Account to stop syncing.</p>
  </section>
</template>

<style scoped>
.info-block {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 90%, var(--border));
}
.info-block h3 {
  margin: 0;
  font-size: 0.86rem;
  font-weight: 700;
  color: var(--text);
  line-height: 1.3;
}
.info-block p {
  margin: 0;
  color: var(--muted);
  font-size: 0.82rem;
  line-height: 1.45;
}
.info-block strong {
  color: var(--text);
  font-weight: 650;
}
</style>
