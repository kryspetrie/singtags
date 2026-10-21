import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ConfirmDialog from './ConfirmDialog.vue'

/**
 * Auto-generated visual smoke story. Prefer hand-curating args when this
 * component becomes a design surface; regenerate with --force only when
 * intentional.
 */
const meta = {
  title: 'Components/ConfirmDialog',
  component: ConfirmDialog,
  tags: ['autodocs'],
  args: {
  open: true,
  title: 'Confirm',
  message: 'Are you sure?',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel'
},
} satisfies Meta<typeof ConfirmDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
