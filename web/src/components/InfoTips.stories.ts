import type { Meta, StoryObj } from '@storybook/vue3-vite'
import InfoTips from './InfoTips.vue'

/**
 * Auto-generated visual smoke story. Prefer hand-curating args when this
 * component becomes a design surface; regenerate with --force only when
 * intentional.
 */
const meta = {
  title: 'Components/InfoTips',
  component: InfoTips,
  tags: ['autodocs'],
  args: {
  tipId: 'storybook'
},
} satisfies Meta<typeof InfoTips>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
