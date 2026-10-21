import type { Meta, StoryObj } from '@storybook/vue3-vite'
import CollectionPickerSheet from './CollectionPickerSheet.vue'

/**
 * Auto-generated visual smoke story. Prefer hand-curating args when this
 * component becomes a design surface; regenerate with --force only when
 * intentional.
 */
const meta = {
  title: 'Components/CollectionPickerSheet',
  component: CollectionPickerSheet,
  tags: ['autodocs'],
  args: {
  open: true
},
} satisfies Meta<typeof CollectionPickerSheet>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
