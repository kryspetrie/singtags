import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ScrubRail from './ScrubRail.vue'

/**
 * Auto-generated visual smoke story. Prefer hand-curating args when this
 * component becomes a design surface; regenerate with --force only when
 * intentional.
 */
const meta = {
  title: 'Components/ScrubRail',
  component: ScrubRail,
  tags: ['autodocs'],
  args: {
  value: 0.35,
  max: 1
},
} satisfies Meta<typeof ScrubRail>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
