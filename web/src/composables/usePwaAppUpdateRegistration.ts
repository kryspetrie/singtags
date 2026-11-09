/**
 * Register the Vite PWA service worker with deferred idle apply + Reload snack.
 */
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { useSnackbarStore } from '../stores/snackbar'
import {
  applyWaitingPwaUpdate,
  bindPwaAppUpdate,
} from '../lib/pwaAppUpdate'

/** Call once from the app shell. */
export function usePwaAppUpdateRegistration(): void {
  let updateServiceWorker: (reloadPage?: boolean) => Promise<void> = async () => {}
  const pwaUpdate = bindPwaAppUpdate((reload) => updateServiceWorker(reload))
  ;({ updateServiceWorker } = useRegisterSW({
    immediate: true,
    onNeedRefresh() {
      pwaUpdate.onNeedRefresh()
      useSnackbarStore().show('A new SingTags version is ready.', {
        tone: 'ok',
        title: 'App update',
        ms: 0,
        action: {
          label: 'Reload',
          onClick: () => {
            void applyWaitingPwaUpdate()
          },
        },
      })
    },
  }))
}
