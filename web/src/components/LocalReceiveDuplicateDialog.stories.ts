import type { Meta, StoryObj } from '@storybook/vue3-vite'
import LocalReceiveDuplicateDialog from './LocalReceiveDuplicateDialog.vue'

/**
 * Auto-generated visual smoke story. Prefer hand-curating args when this
 * component becomes a design surface; regenerate with --force only when
 * intentional.
 */
const meta = {
  title: 'Components/LocalReceiveDuplicateDialog',
  component: LocalReceiveDuplicateDialog,
  tags: ['autodocs'],
  args: {
  open: true
},
} satisfies Meta<typeof LocalReceiveDuplicateDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
