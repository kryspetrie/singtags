import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ArrangingPathOptimize from './ArrangingPathOptimize.vue'

/**
 * Auto-generated visual smoke story. Prefer hand-curating args when this
 * component becomes a design surface; regenerate with --force only when
 * intentional.
 */
const meta = {
  title: 'Components/arranging/ArrangingPathOptimize',
  component: ArrangingPathOptimize,
  tags: ['autodocs'],
  args: {
    status: null,
    canRun: true,
    lastReport: null,
    hasSelection: false,
    busy: false,
    progressFraction: 0,
    progressLabel: null,
  },
} satisfies Meta<typeof ArrangingPathOptimize>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
