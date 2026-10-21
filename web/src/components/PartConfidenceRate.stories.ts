import type { Meta, StoryObj } from '@storybook/vue3-vite'
import PartConfidenceRate from './PartConfidenceRate.vue'

/**
 * Auto-generated visual smoke story. Prefer hand-curating args when this
 * component becomes a design surface; regenerate with --force only when
 * intentional.
 */
const meta = {
  title: 'Components/PartConfidenceRate',
  component: PartConfidenceRate,
  tags: ['autodocs'],
  args: {
  part: 'lead',
  value: 2
},
} satisfies Meta<typeof PartConfidenceRate>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
