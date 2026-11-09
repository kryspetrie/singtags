import type { Meta, StoryObj } from '@storybook/vue3-vite'
import CacheTransferDetailsDialog from './CacheTransferDetailsDialog.vue'

/**
 * Auto-generated visual smoke story. Prefer hand-curating args when this
 * component becomes a design surface; regenerate with --force only when
 * intentional.
 */
const meta = {
  title: 'Components/CacheTransferDetailsDialog',
  component: CacheTransferDetailsDialog,
  tags: ['autodocs'],
  args: {
  open: true
},
} satisfies Meta<typeof CacheTransferDetailsDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
