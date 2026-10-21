import type { Meta, StoryObj } from '@storybook/vue3-vite'
import BrowseWelcomeDialog from './BrowseWelcomeDialog.vue'

/**
 * Auto-generated visual smoke story. Prefer hand-curating args when this
 * component becomes a design surface; regenerate with --force only when
 * intentional.
 */
const meta = {
  title: 'Components/BrowseWelcomeDialog',
  component: BrowseWelcomeDialog,
  tags: ['autodocs'],
  args: {
  open: true
},
} satisfies Meta<typeof BrowseWelcomeDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
