import type { Meta, StoryObj } from '@storybook/vue3-vite'
import TagMyRating from './TagMyRating.vue'

/**
 * Auto-generated visual smoke story. Prefer hand-curating args when this
 * component becomes a design surface; regenerate with --force only when
 * intentional.
 */
const meta = {
  title: 'Components/TagMyRating',
  component: TagMyRating,
  tags: ['autodocs'],
  args: {
  tagId: 1,
  rating: 3
},
} satisfies Meta<typeof TagMyRating>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
