import type { Meta, StoryObj } from '@storybook/vue3-vite'
import LabelPillsInput from './LabelPillsInput.vue'

/**
 * Auto-generated visual smoke story. Prefer hand-curating args when this
 * component becomes a design surface; regenerate with --force only when
 * intentional.
 */
const meta = {
  title: 'Components/LabelPillsInput',
  component: LabelPillsInput,
  tags: ['autodocs'],
  args: {
  modelValue: [
    'demo'
  ],
  placeholder: 'Add label'
},
} satisfies Meta<typeof LabelPillsInput>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
