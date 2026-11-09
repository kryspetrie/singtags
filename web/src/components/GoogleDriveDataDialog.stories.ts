import type { Meta, StoryObj } from '@storybook/vue3-vite'
import GoogleDriveDataDialog from './GoogleDriveDataDialog.vue'

/**
 * Auto-generated visual smoke story. Prefer hand-curating args when this
 * component becomes a design surface; regenerate with --force only when
 * intentional.
 */
const meta = {
  title: 'Components/GoogleDriveDataDialog',
  component: GoogleDriveDataDialog,
  tags: ['autodocs'],
  args: {
  open: true
},
} satisfies Meta<typeof GoogleDriveDataDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
