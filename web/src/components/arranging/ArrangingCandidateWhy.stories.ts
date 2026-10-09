import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ArrangingCandidateWhy from './ArrangingCandidateWhy.vue'

/**
 * Auto-generated visual smoke story. Prefer hand-curating args when this
 * component becomes a design surface; regenerate with --force only when
 * intentional.
 */
const meta = {
  title: 'Components/arranging/ArrangingCandidateWhy',
  component: ArrangingCandidateWhy,
  tags: ['autodocs'],
  args: {
  why: {
    summary: 'Sample why text for Storybook.',
    details: []
  }
},
} satisfies Meta<typeof ArrangingCandidateWhy>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
