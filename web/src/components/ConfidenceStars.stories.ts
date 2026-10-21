import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ConfidenceStars from './ConfidenceStars.vue'

/**
 * Auto-generated visual smoke story. Prefer hand-curating args when this
 * component becomes a design surface; regenerate with --force only when
 * intentional.
 */
const meta = {
  title: 'Components/ConfidenceStars',
  component: ConfidenceStars,
  tags: ['autodocs'],
  args: {
  value: 3
},
} satisfies Meta<typeof ConfidenceStars>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
