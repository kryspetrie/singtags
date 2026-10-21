import type { Meta, StoryObj } from '@storybook/vue3-vite'
import HomeView from './HomeView.vue'

/**
 * Auto-generated visual smoke story. Prefer hand-curating args when this
 * component becomes a design surface; regenerate with --force only when
 * intentional.
 */
const meta = {
  title: 'Views/HomeView',
  component: HomeView,
  tags: ['autodocs'],
  args: {},
} satisfies Meta<typeof HomeView>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
