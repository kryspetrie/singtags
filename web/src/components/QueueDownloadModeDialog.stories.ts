import type { Meta, StoryObj } from '@storybook/vue3-vite'
import QueueDownloadModeDialog from './QueueDownloadModeDialog.vue'

/**
 * Auto-generated visual smoke story. Prefer hand-curating args when this
 * component becomes a design surface; regenerate with --force only when
 * intentional.
 */
const meta = {
  title: 'Components/QueueDownloadModeDialog',
  component: QueueDownloadModeDialog,
  tags: ['autodocs'],
  args: {
  open: true
},
} satisfies Meta<typeof QueueDownloadModeDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
